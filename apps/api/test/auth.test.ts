import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { registerAuth } from "../src/auth/plugin";
import { createAuthStore } from "../src/auth/store";
import { AuthError, type AuthClaims } from "../src/auth/verify";
import { runMigrations } from "../src/migrate";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let db: PGlite;

// Fake token verifier: "tok:<uuid>:<session>[:flags]" -> claims; anything else is invalid; "down" simulates an outage.
const verify = async (t: string): Promise<AuthClaims> => {
  if (t === "down") throw new AuthError("auth_unavailable");
  const [p, id, sid, flag] = t.split(":");
  if (p !== "tok" || !id || !sid) throw new AuthError("invalid_token");
  return { userId: id, email: `${id.slice(0, 4)}@example.com`, phone: null, sessionId: sid, isAnonymous: flag === "anon" };
};

function makeApp() {
  const app = buildApp();
  const { requireAuth, requireRole } = registerAuth(app, { verify, store: createAuthStore(db) });
  app.get("/admin/ping", { preHandler: [requireAuth, requireRole("admin")] }, async () => ({ ok: true }));
  return app;
}
const get = (app: ReturnType<typeof makeApp>, url: string, token?: string) =>
  app.inject({ method: "GET", url, headers: token ? { authorization: `Bearer ${token}` } : {} });

beforeAll(async () => {
  db = new PGlite();
  await runMigrations(db, dir);
}, 120_000);
beforeEach(async () => {
  await db.exec("truncate users cascade");
});

describe("authentication", () => {
  it("401 without a token, with a malformed header, or with an invalid token", async () => {
    const app = makeApp();
    expect((await get(app, "/me")).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/me", headers: { authorization: "Basic abc" } })).statusCode).toBe(401);
    expect((await get(app, "/me", "garbage")).statusCode).toBe(401);
  });
  it("503 when the auth provider is unavailable", async () => {
    expect((await get(makeApp(), "/me", "down")).statusCode).toBe(503);
  });
  it("403 for anonymous sign-ins", async () => {
    expect((await get(makeApp(), "/me", `tok:${A}:s1:anon`)).statusCode).toBe(403);
  });
  it("first login provisions the user with the default role; repeat logins do not duplicate", async () => {
    const app = makeApp();
    const r1 = await get(app, "/me", `tok:${A}:s1`);
    expect(r1.statusCode).toBe(200);
    expect(r1.json()).toMatchObject({ id: A, status: "active", roles: ["user"] });
    await get(app, "/me", `tok:${A}:s1`);
    expect((await db.query("select * from users")).rows).toHaveLength(1);
    expect((await db.query("select * from user_roles")).rows).toHaveLength(1);
  });
  it("403 for suspended accounts", async () => {
    const app = makeApp();
    await get(app, "/me", `tok:${A}:s1`);
    await db.query("update users set status = 'suspended' where id = $1", [A]);
    expect((await get(app, "/me", `tok:${A}:s1`)).statusCode).toBe(403);
  });
  it("409 when the email already belongs to a different account", async () => {
    await db.query("insert into users (id, email) values ($1, $2)", [B, `${A.slice(0, 4)}@example.com`]);
    expect((await get(makeApp(), "/me", `tok:${A}:s1`)).statusCode).toBe(409);
  });
});

describe("authorization", () => {
  it("403 for a normal user on an admin route, 200 once granted admin, 401 when unauthenticated", async () => {
    const app = makeApp();
    expect((await get(app, "/admin/ping")).statusCode).toBe(401);
    expect((await get(app, "/admin/ping", `tok:${A}:s1`)).statusCode).toBe(403);
    await db.query("insert into user_roles (user_id, role) values ($1, 'admin')", [A]);
    expect((await get(app, "/admin/ping", `tok:${A}:s1`)).statusCode).toBe(200);
  });
});

describe("sessions", () => {
  it("lists only my active sessions and marks the current one", async () => {
    const app = makeApp();
    await get(app, "/me", `tok:${A}:phone`);
    await get(app, "/me", `tok:${A}:laptop`);
    await get(app, "/me", `tok:${B}:other`);
    const res = await get(app, "/me/sessions", `tok:${A}:laptop`);
    const s = res.json().sessions as { current: boolean }[];
    expect(s).toHaveLength(2);
    expect(s.filter((x) => x.current)).toHaveLength(1);
  });
  it("revoking a session blocks it immediately while other sessions keep working", async () => {
    const app = makeApp();
    await get(app, "/me", `tok:${A}:phone`);
    const list = await get(app, "/me/sessions", `tok:${A}:laptop`);
    const phone = (await db.query<{ id: string }>("select id from user_sessions where auth_session_id = 'phone'")).rows[0]!.id;
    expect(list.statusCode).toBe(200);
    const del = await app.inject({ method: "DELETE", url: `/me/sessions/${phone}`, headers: { authorization: `Bearer tok:${A}:laptop` } });
    expect(del.statusCode).toBe(204);
    expect((await get(app, "/me", `tok:${A}:phone`)).statusCode).toBe(401);
    expect((await get(app, "/me", `tok:${A}:laptop`)).statusCode).toBe(200);
  });
  it("cannot revoke another user's session (404, session still works)", async () => {
    const app = makeApp();
    await get(app, "/me", `tok:${B}:bsess`);
    const bId = (await db.query<{ id: string }>("select id from user_sessions where auth_session_id = 'bsess'")).rows[0]!.id;
    const del = await app.inject({ method: "DELETE", url: `/me/sessions/${bId}`, headers: { authorization: `Bearer tok:${A}:s1` } });
    expect(del.statusCode).toBe(404);
    expect((await get(app, "/me", `tok:${B}:bsess`)).statusCode).toBe(200);
  });
  it("400 for a malformed session id; 401 when unauthenticated", async () => {
    const app = makeApp();
    expect((await app.inject({ method: "DELETE", url: "/me/sessions/not-a-uuid", headers: { authorization: `Bearer tok:${A}:s1` } })).statusCode).toBe(400);
    expect((await app.inject({ method: "DELETE", url: `/me/sessions/${A}` })).statusCode).toBe(401);
  });
});
