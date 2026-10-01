import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/** Minimal surface shared by `pg` (CLI) and PGlite (tests). */
export interface SqlRunner {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

const FILE_RE = /^[0-9]{4}_[a-z0-9_]+\.sql$/;

/** Applies every not-yet-applied migration in filename order. Each file runs in its own transaction. Returns names applied. */
export async function runMigrations(db: SqlRunner, dir: string): Promise<string[]> {
  await db.exec(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
  const done = new Set((await db.query<{ name: string }>("select name from schema_migrations")).rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (!FILE_RE.test(file)) throw new Error(`Bad migration filename: ${file} (expected 0001_name.sql)`);
    if (done.has(file)) continue;
    const sql = await readFile(path.join(dir, file), "utf8");
    await db.exec(`begin;\n${sql}\ninsert into schema_migrations (name) values ('${file}');\ncommit;`);
    applied.push(file);
  }
  return applied;
}
