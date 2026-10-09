import { loadApiEnv } from "@sp/config";
import { buildApp, type ReadinessCheck } from "./app";
import { registerAuth } from "./auth/plugin";
import { resolveCorsOrigins } from "./cors";
import { createAuthStore } from "./auth/store";
import { createTokenVerifier } from "./auth/verify";
import { makePool } from "./db";
import { createProfileStore } from "./profile/store";
import { registerProfile } from "./profile/plugin";
import { createConnectionsStore } from "./connections/store";
import { registerConnections } from "./connections/plugin";
import { createDiscoveryStore } from "./discovery/store";
import { registerDiscovery } from "./discovery/plugin";
import { createMessagingStore } from "./messaging/store";
import { createMessageNotifier, noopPushSender } from "./messaging/notify";
import { registerMessaging } from "./messaging/plugin";
import { loadDotEnv } from "./env";
import { createCommunityStore } from "./community/store";
import { registerCommunity } from "./community/plugin";

loadDotEnv();
const env = loadApiEnv(process.env);

const readinessChecks: Record<string, ReadinessCheck> = {};
const pool = env.DATABASE_URL ? makePool(env.DATABASE_URL) : undefined;
if (pool) {
  readinessChecks.database = async () => {
    await pool.query("select 1");
  };
}

const app = buildApp({ readinessChecks, logger: true, corsOrigins: resolveCorsOrigins(env) });

if (pool && env.SUPABASE_URL) {
  const verify = createTokenVerifier({ supabaseUrl: env.SUPABASE_URL, publishableKey: env.SUPABASE_PUBLISHABLE_KEY });
  const db = { exec: (sql: string) => pool.query(sql), query: (sql: string, params?: unknown[]) => pool.query(sql, params as unknown[]) as never };
  const store = createAuthStore(db);
  const { requireAuth, requireRole } = registerAuth(app, { verify, store });
  registerProfile(app, { requireAuth, store: createProfileStore(db) });
  registerDiscovery(app, { requireAuth, requireRole, store: createDiscoveryStore(db) });
  registerConnections(app, { requireAuth, requireRole, store: createConnectionsStore(db) });
  // Push delivery: noopPushSender until real FCM/APNs credentials are wired (pre-pilot step).
  // The notifier still enforces notification_settings and device tokens, so going live is a one-line swap.
  const notifier = createMessageNotifier(db, noopPushSender, (msg, err) => app.log.warn({ err }, msg));
  registerMessaging(app, { requireAuth, store: createMessagingStore(db, undefined, { onMessageSent: notifier.messageSent }) });
  registerCommunity(app, { requireAuth, store: createCommunityStore(db) });
} else {
  app.log.warn("DATABASE_URL and/or SUPABASE_URL not set: auth routes (/me, /me/sessions) are NOT registered");
}

await app.listen({ port: env.PORT, host: "0.0.0.0" });

const shutdown = async () => {
  await app.close();
  await pool?.end();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
