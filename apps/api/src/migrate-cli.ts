import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApiEnv } from "@sp/config";
import { makePool } from "./db";
import { loadDotEnv } from "./env";
import { runMigrations } from "./migrate";

loadDotEnv();
const env = loadApiEnv(process.env);
if (!env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env at the repo root, then re-run.");
  process.exit(1);
}
const pool = makePool(env.DATABASE_URL);
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
try {
  const applied = await runMigrations({ exec: (sql) => pool.query(sql), query: (sql, params) => pool.query(sql, params as unknown[]) as never }, dir);
  console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database already up to date.");
} catch (err) {
  console.error("Migration failed:", err instanceof Error ? err.message : "unknown error");
  process.exitCode = 1;
} finally {
  await pool.end();
}
