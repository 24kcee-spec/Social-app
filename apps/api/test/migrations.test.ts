import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await runMigrations(db, dir);
});

beforeEach(async () => {
  await db.exec("truncate users cascade");
});

const insertUser = (email: string | null, phone: string | null) =>
  db.query("insert into users (email, phone) values ($1, $2) returning id", [email, phone]);

describe("migration runner", () => {
  it("is idempotent: a second run applies nothing", async () => {
    expect(await runMigrations(db, dir)).toEqual([]);
    const { rows } = await db.query<{ name: string }>("select name from schema_migrations");
    expect(rows.map((r) => r.name)).toEqual(["0001_users_and_roles.sql", "0002_user_sessions.sql", "0003_profiles_interests_prompts_media.sql"]);
  });
});

describe("users table constraints", () => {
  it("accepts email-only and phone-only users", async () => {
    await insertUser("a@example.com", null);
    await insertUser(null, "+263771234567");
  });
  it("defaults status to active", async () => {
    await insertUser("a@example.com", null);
    const { rows } = await db.query<{ status: string }>("select status from users");
    expect(rows[0]?.status).toBe("active");
  });
  it("rejects duplicate emails and duplicate phones", async () => {
    await insertUser("a@example.com", null);
    await expect(insertUser("a@example.com", null)).rejects.toThrow();
    await insertUser(null, "+263771234567");
    await expect(insertUser(null, "+263771234567")).rejects.toThrow();
  });
  it("rejects upper-case emails (case-insensitive uniqueness)", async () => {
    await expect(insertUser("A@Example.com", null)).rejects.toThrow();
  });
  it("rejects users with no contact method", async () => {
    await expect(insertUser(null, null)).rejects.toThrow();
  });
  it("rejects non-E.164 phone numbers", async () => {
    await expect(insertUser(null, "0771234567")).rejects.toThrow();
  });
  it("rejects unknown status values", async () => {
    await expect(db.query("insert into users (email, status) values ('b@example.com', 'weird')")).rejects.toThrow();
  });
});

describe("user_roles", () => {
  it("accepts valid roles, rejects duplicates and unknown roles", async () => {
    const { rows } = await insertUser("a@example.com", null);
    const id = (rows[0] as { id: string }).id;
    await db.query("insert into user_roles (user_id, role) values ($1, 'user')", [id]);
    await expect(db.query("insert into user_roles (user_id, role) values ($1, 'user')", [id])).rejects.toThrow();
    await expect(db.query("insert into user_roles (user_id, role) values ($1, 'god')", [id])).rejects.toThrow();
  });
  it("cascades on user delete", async () => {
    const { rows } = await insertUser("a@example.com", null);
    const id = (rows[0] as { id: string }).id;
    await db.query("insert into user_roles (user_id, role) values ($1, 'admin')", [id]);
    await db.query("delete from users where id = $1", [id]);
    const left = await db.query("select * from user_roles");
    expect(left.rows).toHaveLength(0);
  });
});

describe("user_sessions", () => {
  it("enforces one row per (user, auth session) and cascades on user delete", async () => {
    const { rows } = await insertUser("a@example.com", null);
    const id = (rows[0] as { id: string }).id;
    await db.query("insert into user_sessions (user_id, auth_session_id) values ($1, 's1')", [id]);
    await expect(db.query("insert into user_sessions (user_id, auth_session_id) values ($1, 's1')", [id])).rejects.toThrow();
    await db.query("delete from users where id = $1", [id]);
    expect((await db.query("select * from user_sessions")).rows).toHaveLength(0);
  });
});


describe("Phase 2 profile tables", () => {
  it("creates all profile-related tables", async () => {
    const { rows } = await db.query<{ name: string }>(`select table_name as name from information_schema.tables where table_schema='public' and table_name = any($1::text[]) order by table_name`, [["profiles", "interests", "user_interests", "prompt_catalog", "prompt_answers", "profile_media"]]);
    expect(rows.map((r) => r.name)).toEqual(["interests", "profile_media", "profiles", "prompt_answers", "prompt_catalog", "user_interests"]);
  });
  it("seeds the interest catalogue", async () => {
    const { rows } = await db.query<{ count: string }>("select count(*)::text as count from interests where active=true");
    expect(Number(rows[0]?.count)).toBe(50);
  });
  it("seeds the prompt catalogue", async () => {
    const { rows } = await db.query<{ count: string }>("select count(*)::text as count from prompt_catalog where active=true");
    expect(Number(rows[0]?.count)).toBe(10);
  });
  it("creates a default profile shell when a user already exists", async () => {
    const { rows } = await insertUser("before@example.com", null);
    const id = (rows[0] as { id: string }).id;
    await db.query("insert into profiles (user_id) values ($1)", [id]);
    const { rows: profileRows } = await db.query<{ display_name: string; discoverable: boolean; onboarding_completed: boolean }>("select display_name, discoverable, onboarding_completed from profiles where user_id=$1", [id]);
    expect(profileRows[0]).toEqual({ display_name: "New member", discoverable: true, onboarding_completed: false });
  });
  it("enforces profile display-name length and bio length", async () => {
    const { rows } = await insertUser("profile@example.com", null);
    const id = (rows[0] as { id: string }).id;
    await expect(db.query("insert into profiles (user_id, display_name) values ($1,$2)", [id, "x"])).rejects.toThrow();
    await db.query("insert into profiles (user_id, display_name) values ($1,$2)", [id, "Valid Name"]);
    await expect(db.query("update profiles set bio=$2 where user_id=$1", [id, "x".repeat(281)])).rejects.toThrow();
  });
  it("enforces allowed social styles", async () => {
    const { rows } = await insertUser("style@example.com", null);
    const id = (rows[0] as { id: string }).id;
    await expect(db.query("insert into profiles (user_id, display_name, social_styles) values ($1,$2,$3)", [id, "Style User", ["unknown"]])).rejects.toThrow();
  });
  it("enforces interest strengths from 1 through 3", async () => {
    const { rows } = await insertUser("interest@example.com", null);
    const id = (rows[0] as { id: string }).id;
    const interest = (await db.query<{ id: string }>("select id from interests limit 1")).rows[0]!.id;
    await expect(db.query("insert into user_interests (user_id, interest_id, strength) values ($1,$2,0)", [id, interest])).rejects.toThrow();
    await db.query("insert into user_interests (user_id, interest_id, strength) values ($1,$2,3)", [id, interest]);
  });
  it("enforces prompt answer length", async () => {
    const { rows } = await insertUser("prompt@example.com", null);
    const id = (rows[0] as { id: string }).id;
    await expect(db.query("insert into prompt_answers (user_id, prompt_id, answer) values ($1,'weekend','x')", [id])).rejects.toThrow();
  });
  it("enforces profile media type and size constraints", async () => {
    const { rows } = await insertUser("media@example.com", null);
    const id = (rows[0] as { id: string }).id;
    await expect(db.query("insert into profile_media (user_id,storage_path,thumbnail_path,content_type,size_bytes,width,height) values ($1,$2,$3,'image/gif',1,1,1)", [id, `${id}/a`, `${id}/a-thumb`])).rejects.toThrow();
    await expect(db.query("insert into profile_media (user_id,storage_path,thumbnail_path,content_type,size_bytes,width,height) values ($1,$2,$3,'image/jpeg',5242881,1,1)", [id, `${id}/b`, `${id}/b-thumb`])).rejects.toThrow();
  });
  it("enforces unique profile media slots", async () => {
    const { rows } = await insertUser("slot@example.com", null);
    const id = (rows[0] as { id: string }).id;
    await db.query("insert into profile_media (user_id,storage_path,thumbnail_path,content_type,size_bytes,width,height,sort_order) values ($1,$2,$3,'image/jpeg',1,1,1,0)", [id, `${id}/a`, `${id}/a-thumb`]);
    await expect(db.query("insert into profile_media (user_id,storage_path,thumbnail_path,content_type,size_bytes,width,height,sort_order) values ($1,$2,$3,'image/jpeg',1,1,1,0)", [id, `${id}/b`, `${id}/b-thumb`])).rejects.toThrow();
  });
  it("cascades profile data when the user is deleted", async () => {
    const { rows } = await insertUser("cascade2@example.com", null);
    const id = (rows[0] as { id: string }).id;
    const interest = (await db.query<{ id: string }>("select id from interests limit 1")).rows[0]!.id;
    await db.query("insert into profiles (user_id,display_name) values ($1,'Cascade')", [id]);
    await db.query("insert into user_interests (user_id,interest_id) values ($1,$2)", [id, interest]);
    await db.query("insert into prompt_answers (user_id,prompt_id,answer) values ($1,'weekend','Read and build.')", [id]);
    await db.query("insert into profile_media (user_id,storage_path,thumbnail_path,content_type,size_bytes,width,height) values ($1,$2,$3,'image/jpeg',1,1,1)", [id, `${id}/a`, `${id}/a-thumb`]);
    await db.query("delete from users where id=$1", [id]);
    expect((await db.query("select * from profiles where user_id=$1", [id])).rows).toHaveLength(0);
    expect((await db.query("select * from user_interests where user_id=$1", [id])).rows).toHaveLength(0);
    expect((await db.query("select * from prompt_answers where user_id=$1", [id])).rows).toHaveLength(0);
    expect((await db.query("select * from profile_media where user_id=$1", [id])).rows).toHaveLength(0);
  });
});
