import pg from "pg";
import { loadApiEnv } from "@sp/config";
import { buildApp, type ReadinessCheck } from "./app";

const env = loadApiEnv(process.env);

const readinessChecks: Record<string, ReadinessCheck> = {};
let pool: pg.Pool | undefined;
if (env.DATABASE_URL) {
  pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 5, connectionTimeoutMillis: 3000 });
  readinessChecks.database = async () => {
    await pool!.query("select 1");
  };
}

const app = buildApp({ readinessChecks, logger: true });
await app.listen({ port: env.PORT, host: "0.0.0.0" });

const shutdown = async () => {
  await app.close();
  await pool?.end();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
