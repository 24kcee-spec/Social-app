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
    expect(rows.map((r) => r.name)).toEqual(["0001_users_and_roles.sql"]);
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
