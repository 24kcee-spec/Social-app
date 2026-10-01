import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadApiEnv } from "@sp/config";
import { runMigrations } from "./migrate";

const env = loadApiEnv(process.env);
if (!env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to your environment, then re-run.");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
try {
  const applied = await runMigrations(
    { exec: (sql) => pool.query(sql), query: (sql, params) => pool.query(sql, params as unknown[]) as never },
    dir,
  );
  console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database already up to date.");
} finally {
  await pool.end();
}
