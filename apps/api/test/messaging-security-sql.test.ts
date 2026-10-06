import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate";

const here = path.dirname(fileURLToPath(import.meta.url));
const ID = { A: "a1000000-0000-4000-8000-000000000000", B: "a2000000-0000-4000-8000-000000000000", C: "a3000000-0000-4000-8000-000000000000" };
let db: PGlite;
let conv: string;

/** Minimal stand-ins for what Supabase provides, so the real docs SQL runs unchanged. */
const SUPABASE_STUBS = `
  create schema if not exists auth;
  create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
  do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
  create publication supabase_realtime;
`;

async function asUser(userId: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`set request.jwt.sub = '${userId ?? ""}'`);
  await db.exec("set role authenticated");
  try { return await db.query<Record<string, unknown>>(sql, params); }
  finally { await db.exec("reset role"); await db.exec("reset request.jwt.sub"); }
}

beforeAll(async () => {
  db = new PGlite();
  await runMigrations(db, path.join(here, "..", "migrations"));
  await db.exec(SUPABASE_STUBS);
  await db.exec(await readFile(path.join(here, "..", "..", "..", "docs", "supabase-phase5-security.sql"), "utf8"));
  await db.exec(await readFile(path.join(here, "..", "..", "..", "docs", "supabase-phase5b-security.sql"), "utf8"));
  await db.exec("grant usage on schema public to authenticated; grant select on all tables in schema public to authenticated");
  for (const [id, name] of [[ID.A, "ann"], [ID.B, "ben"], [ID.C, "cy"]] as const) await db.query(`insert into users (id, email) values ($1, $2)`, [id, `${name}@example.com`]);
  await db.query(`insert into connections (user_a, user_b) values ($1, $2)`, [ID.A, ID.B]);
  const { rows } = await db.query<{ id: string }>(`insert into conversations (direct_a, direct_b) values ($1, $2) returning id::text`, [ID.A, ID.B]);
  conv = rows[0]!.id;
  await db.query(`insert into conversation_members (conversation_id, user_id) values ($1, $2), ($1, $3)`, [conv, ID.A, ID.B]);
  await db.query(`insert into messages (conversation_id, sender_id, body, client_tag) values ($1, $2, 'hello', 'b0000000-0000-4000-8000-000000000001')`, [conv, ID.A]);
});

const count = async (user: string | null, table: string) => Number((await asUser(user, `select count(*)::int as n from ${table}`)).rows[0]!.n);

describe("Phase 5 + 5b Supabase security SQL (real files, run on Postgres)", () => {
  it("is safe to run twice", async () => {
    await db.exec(await readFile(path.join(here, "..", "..", "..", "docs", "supabase-phase5-security.sql"), "utf8"));
    await db.exec(await readFile(path.join(here, "..", "..", "..", "docs", "supabase-phase5b-security.sql"), "utf8"));
  });

  it("lets only the two members read their conversation, messages and member rows", async () => {
    for (const member of [ID.A, ID.B]) {
      expect(await count(member, "messages")).toBe(1);
      expect(await count(member, "conversations")).toBe(1);
      expect(await count(member, "conversation_members")).toBe(2);
    }
    expect(await count(ID.C, "messages")).toBe(0);
    expect(await count(ID.C, "conversations")).toBe(0);
    expect(await count(null, "messages")).toBe(0);
  });

  it("gives clients no access to the API-owned tables", async () => {
    await db.query(`insert into device_push_tokens (user_id, platform, token) values ($1, 'web', 'token-web-12345')`, [ID.A]);
    await expect(asUser(ID.A, `select * from device_push_tokens`)).resolves.toMatchObject({ rows: [] });
    await expect(asUser(ID.A, `select * from notification_settings`)).resolves.toMatchObject({ rows: [] });
  });

  it("denies every client write on messages", async () => {
    await expect(asUser(ID.A, `insert into messages (conversation_id, sender_id, body, client_tag) values ($1, $2, 'forged', 'b0000000-0000-4000-8000-000000000009')`, [conv, ID.A])).rejects.toThrow();
  });

  it("stops streaming and serving a conversation to both people once either has blocked the other", async () => {
    await db.query(`insert into user_blocks (blocker_id, blocked_id) values ($1, $2)`, [ID.B, ID.A]);
    for (const who of [ID.A, ID.B]) {
      expect(await count(who, "messages")).toBe(0);
      expect(await count(who, "conversations")).toBe(0);
      expect(await count(who, "conversation_members")).toBe(0);
    }
    await db.query(`delete from user_blocks`);
    expect(await count(ID.A, "messages")).toBe(1);
  });

  it("publishes messages and conversation_members to Realtime", async () => {
    const { rows } = await db.query<{ tablename: string }>(`select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename`);
    expect(rows.map((r) => r.tablename)).toEqual(expect.arrayContaining(["conversation_members", "messages"]));
  });
});
