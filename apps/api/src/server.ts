import { loadApiEnv } from '@sp/config';
import { readdir } from 'node:fs/promises';
import { createSchemaReadinessCheck } from './schema-readiness';
import { buildApp, type ReadinessCheck } from './app';
import { createApiConfigurationCheck } from './readiness';
import { registerAuth } from './auth/plugin';
import { resolveCorsOrigins } from './cors';
import { createAuthStore } from './auth/store';
import { createTokenVerifier } from './auth/verify';
import { makePool } from './db';
import { createProfileStore } from './profile/store';
import { registerProfile } from './profile/plugin';
import { createEmailProofReader } from './profile/email-proof';
import { createConnectionsStore } from './connections/store';
import { registerConnections } from './connections/plugin';
import { createDiscoveryStore } from './discovery/store';
import { registerDiscovery } from './discovery/plugin';
import { createMessagingStore } from './messaging/store';
import { createMessageNotifier, createExpoPushSender, noopPushSender } from './messaging/notify';
import { registerMessaging } from './messaging/plugin';
import { createReceiptWorker } from './messaging/receipts';
import { createQueuedPushWorker } from './messaging/queue';
import { loadDotEnv } from './env';
import { createCommunityStore } from './community/store';
import { registerCommunity } from './community/plugin';
import { createSafetyStore } from './safety/store';
import { registerSafety } from './safety/plugin';
import { createAccountCleanupWorker } from './safety/cleanup';
import { createShareStore } from './share/store';
import { registerShare } from './share/plugin';

loadDotEnv();
const env = loadApiEnv(process.env);

const readinessChecks: Record<string, ReadinessCheck> = {
  configuration: createApiConfigurationCheck(env),
};
const pool = env.DATABASE_URL ? makePool(env.DATABASE_URL) : undefined;
if (pool) {
  readinessChecks.database = async () => {
    await pool.query('select 1');
  };
  const migrationNames = (await readdir(new URL('../migrations/', import.meta.url))).filter(
    (name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name),
  );
  readinessChecks.schema = createSchemaReadinessCheck(
    { query: (sql, params) => pool.query(sql, params as unknown[]) as never },
    migrationNames,
  );
}

const app = buildApp({ readinessChecks, logger: true, corsOrigins: resolveCorsOrigins(env) });

if (pool && env.SUPABASE_URL) {
  const verify = createTokenVerifier({
    supabaseUrl: env.SUPABASE_URL,
    publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
  });
  const db = {
    exec: (sql: string) => pool.query(sql),
    query: (sql: string, params?: unknown[]) => pool.query(sql, params as unknown[]) as never,
  };
  const store = createAuthStore(db);
  const { requireAuth, requireRole } = registerAuth(app, { verify, store });
  registerProfile(app, {
    requireAuth,
    store: createProfileStore(db),
    readEmailProof: createEmailProofReader({
      supabaseUrl: env.SUPABASE_URL,
      publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
      readConfirmationBaseline: async () => {
        const { rows } = await pool.query<{ baseline: string }>(
          'select confirmed_email_not_before::text as baseline from public.email_proof_settings where singleton',
        );
        if (!rows[0]) throw new Error('Email confirmation baseline is missing');
        return rows[0].baseline;
      },
    }),
  });
  registerDiscovery(app, { requireAuth, requireRole, store: createDiscoveryStore(db) });
  registerConnections(app, { requireAuth, requireRole, store: createConnectionsStore(db) });
  const pushEnabled = env.PUSH_PROVIDER === 'expo';
  const sender = pushEnabled
    ? createExpoPushSender({
        accessToken: process.env.EXPO_ACCESS_TOKEN,
        onUnregistered: async (token) => {
          await db.query('delete from device_push_tokens where token = $1', [token]);
        },
        onTicket: async (id, token) => {
          await db.query(
            'insert into push_delivery_receipts (ticket_id, token) values ($1, $2) on conflict do nothing',
            [id, token],
          );
        },
      })
    : noopPushSender;
  const notifier = createMessageNotifier(db, sender, () =>
    app.log.warn('Push delivery failed; message remains saved'),
  );
  const durablePush =
    (
      await pool.query<{ installed: boolean }>(
        "select to_regclass('app_private.message_push_jobs') is not null as installed",
      )
    ).rows[0]?.installed === true;
  registerMessaging(app, {
    requireAuth,
    pushEnabled,
    store: createMessagingStore(
      db,
      undefined,
      durablePush ? {} : { onMessageSent: notifier.messageSent },
    ),
  });
  if (pushEnabled) {
    if (durablePush) {
      const deliver = createQueuedPushWorker(db, notifier);
      let delivering = false;
      const deliverTick = () => {
        if (delivering) return;
        delivering = true;
        void deliver()
          .catch(() => app.log.warn('Queued message delivery needs attention'))
          .finally(() => {
            delivering = false;
          });
      };
      const deliveryTimer = setInterval(deliverTick, 15_000);
      deliveryTimer.unref();
      deliverTick();
      app.addHook('onClose', async () => {
        clearInterval(deliveryTimer);
      });
    }
    const checkReceipts = createReceiptWorker(db, { accessToken: process.env.EXPO_ACCESS_TOKEN });
    let checking = false;
    const receiptTimer = setInterval(() => {
      if (checking) return;
      checking = true;
      void checkReceipts()
        .catch(() => app.log.warn('Push receipt check deferred'))
        .finally(() => {
          checking = false;
        });
    }, 60_000);
    receiptTimer.unref();
    app.addHook('onClose', async () => {
      clearInterval(receiptTimer);
    });
  }
  registerCommunity(app, { requireAuth, store: createCommunityStore(db) });
  const withTransaction = async (work: (tx: typeof db) => Promise<void>) => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await work({
        exec: (sql) => client.query(sql),
        query: (sql, params) => client.query(sql, params as unknown[]) as never,
      });
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  };
  registerSafety(app, {
    requireAuth,
    requireRole,
    store: createSafetyStore(db, { withTransaction }),
  });
  if (process.env.SUPABASE_SECRET_KEY) {
    const cleanup = createAccountCleanupWorker(db, {
      supabaseUrl: env.SUPABASE_URL,
      secretKey: process.env.SUPABASE_SECRET_KEY,
    });
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await cleanup();
      } catch {
        app.log.warn('Account cleanup deferred; check database/Storage/Auth connectivity');
      } finally {
        running = false;
      }
    };
    const timer = setInterval(() => {
      void tick();
    }, 60_000);
    timer.unref();
    app.addHook('onClose', async () => {
      clearInterval(timer);
    });
  } else {
    app.log.warn('SUPABASE_SECRET_KEY missing: external account cleanup jobs will remain pending');
  }
  registerShare(app, { store: createShareStore(db) });
} else {
  app.log.warn(
    'DATABASE_URL and/or SUPABASE_URL not set: auth routes (/me, /me/sessions) are NOT registered',
  );
}

await app.listen({ port: env.PORT, host: '0.0.0.0' });

const shutdown = async () => {
  await app.close();
  await pool?.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
