import { loadApiEnv } from "@sp/config";
import { buildApp, type ReadinessCheck } from "./app";
import { registerAuth } from "./auth/plugin";
import { createAuthStore } from "./auth/store";
import { createTokenVerifier } from "./auth/verify";
import { makePool } from "./db";
import { loadDotEnv } from "./env";

loadDotEnv();
const env = loadApiEnv(process.env);

const readinessChecks: Record<string, ReadinessCheck> = {};
const pool = env.DATABASE_URL ? makePool(env.DATABASE_URL) : undefined;
if (pool) {
  readinessChecks.database = async () => {
    await pool.query("select 1");
  };
}

const app = buildApp({ readinessChecks, logger: true });

if (pool && env.SUPABASE_URL) {
  const verify = createTokenVerifier({ supabaseUrl: env.SUPABASE_URL, publishableKey: env.SUPABASE_PUBLISHABLE_KEY });
  const store = createAuthStore({ exec: (sql) => pool.query(sql), query: (sql, params) => pool.query(sql, params as unknown[]) as never });
  registerAuth(app, { verify, store });
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
