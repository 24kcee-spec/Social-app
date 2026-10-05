import { describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import { buildApp } from "../src/app";
import { registerConnections } from "../src/connections/plugin";
import { ConnectionError, type ConnectionsStore } from "../src/connections/store";

const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REQ = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function makeStore(over: Partial<ConnectionsStore> = {}): ConnectionsStore {
  return {
    getStarters: vi.fn(async () => ({ icebreakers: [], questions: [{ ref: "q_energy", text: "Q?" }], games: [], allowCustom: true })),
    sendRequest: vi.fn(async () => ({ status: "pending" as const, requestId: REQ })),
    respond: vi.fn(async () => undefined), withdraw: vi.fn(async () => undefined),
    listRequests: vi.fn(async () => []), listConnections: vi.fn(async () => []), removeConnection: vi.fn(async () => undefined),
    getSettings: vi.fn(async () => ({ lowPressureMode: false })), updateSettings: vi.fn(async (_u: string, s: { lowPressureMode: boolean }) => s),
    activationSummary: vi.fn(async (sinceDays: number) => ({ sinceDays, signedUp: 1, onboarded: 1, sentFirstRequest: 0, connected: 0, activatedWithin48h: 0, activationRate: 0 })),
    ...over,
  } as ConnectionsStore;
}
function makeApp(store = makeStore(), roles: ("user" | "admin")[] = ["user"]) {
  const app = buildApp();
  const requireAuth = async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.headers.authorization !== "Bearer t") return reply.code(401).send({ error: "unauthorized" });
    req.auth = { user: { id: ME, email: "me@example.com", phone: null, status: "active", roles, createdAt: new Date(), lastActiveAt: null }, sessionId: "s" };
  };
  const requireRole = (...allowed: string[]) => async (req: FastifyRequest, reply: FastifyReply) => {
    if (!allowed.some((r) => (req.auth!.user.roles as string[]).includes(r))) return reply.code(403).send({ error: "forbidden" });
  };
  registerConnections(app, { store, requireAuth, requireRole: requireRole as never });
  return { app, store };
}
const h = { authorization: "Bearer t" };
const intro = { kind: "question", ref: "q_energy" };

describe("connections routes", () => {
  it("require authentication everywhere", async () => {
    const { app } = makeApp();
    const routes: { method: "GET" | "POST" | "DELETE" | "PUT"; url: string }[] = [
      { method: "GET", url: `/people/${OTHER}/starters` }, { method: "POST", url: "/connections/requests" }, { method: "GET", url: "/connections/requests" },
      { method: "POST", url: `/connections/requests/${REQ}/accept` }, { method: "POST", url: `/connections/requests/${REQ}/decline` }, { method: "DELETE", url: `/connections/requests/${REQ}` },
      { method: "GET", url: "/connections" }, { method: "DELETE", url: `/connections/${OTHER}` }, { method: "GET", url: "/me/interaction-settings" }, { method: "PUT", url: "/me/interaction-settings" },
      { method: "GET", url: "/admin/activation/summary" },
    ];
    for (const r of routes) expect((await app.inject(r)).statusCode, `${r.method} ${r.url}`).toBe(401);
  });

  it("returns starters and validates the id", async () => {
    const { app, store } = makeApp();
    expect((await app.inject({ method: "GET", url: `/people/${OTHER}/starters`, headers: h })).json().questions).toHaveLength(1);
    expect(store.getStarters).toHaveBeenCalledWith(ME, OTHER);
    expect((await app.inject({ method: "GET", url: "/people/nope/starters", headers: h })).statusCode).toBe(400);
  });

  it("sends a request from the signed-in user only", async () => {
    const { app, store } = makeApp();
    const res = await app.inject({ method: "POST", url: "/connections/requests", headers: h, payload: { recipientId: OTHER, intro } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ status: "pending", requestId: REQ });
    expect(store.sendRequest).toHaveBeenCalledWith(ME, OTHER, intro);
  });

  it("validates every intro shape", async () => {
    const { app, store } = makeApp();
    const bad = [{}, { recipientId: OTHER }, { recipientId: "x", intro }, { recipientId: OTHER, intro: { kind: "dm", text: "hi" } }, { recipientId: OTHER, intro: { kind: "icebreaker", ref: "not-a-uuid" } },
      { recipientId: OTHER, intro: { kind: "this_or_that", ref: "t_coffee_tea" } }, { recipientId: OTHER, intro: { kind: "this_or_that", ref: "t", choice: "c" } },
      { recipientId: OTHER, intro: { kind: "custom", text: "x" } }, { recipientId: OTHER, intro: { kind: "custom", text: "y".repeat(241) } }];
    for (const payload of bad) expect((await app.inject({ method: "POST", url: "/connections/requests", headers: h, payload })).statusCode, JSON.stringify(payload)).toBe(400);
    const good = [{ kind: "icebreaker", ref: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, { kind: "this_or_that", ref: "t", choice: "a" }, { kind: "custom", text: "Hello!" }];
    for (const i of good) expect((await app.inject({ method: "POST", url: "/connections/requests", headers: h, payload: { recipientId: OTHER, intro: i } })).statusCode).toBe(201);
    expect(store.sendRequest).toHaveBeenCalledTimes(3);
  });

  it("maps every domain error to the right status", async () => {
    const cases: [ConnectionError["code"], number][] = [["onboarding_required", 403], ["not_found", 404], ["not_accepting", 403], ["already_connected", 409], ["already_pending", 409], ["cooldown", 409], ["daily_limit", 429], ["pending_limit", 429], ["custom_not_allowed", 400], ["invalid_intro", 400]];
    for (const [code, status] of cases) {
      const { app } = makeApp(makeStore({ sendRequest: vi.fn(async () => { throw new ConnectionError(code, "msg"); }) }));
      const res = await app.inject({ method: "POST", url: "/connections/requests", headers: h, payload: { recipientId: OTHER, intro } });
      expect(res.statusCode, code).toBe(status);
      expect(res.json()).toEqual({ error: code, message: "msg" });
    }
  });

  it("lists by box, validating the box", async () => {
    const { app, store } = makeApp();
    expect((await app.inject({ method: "GET", url: "/connections/requests", headers: h })).statusCode).toBe(200);
    expect(store.listRequests).toHaveBeenLastCalledWith(ME, "incoming");
    await app.inject({ method: "GET", url: "/connections/requests?box=outgoing", headers: h });
    expect(store.listRequests).toHaveBeenLastCalledWith(ME, "outgoing");
    expect((await app.inject({ method: "GET", url: "/connections/requests?box=all", headers: h })).statusCode).toBe(400);
  });

  it("accepts, declines and withdraws", async () => {
    const { app, store } = makeApp();
    expect((await app.inject({ method: "POST", url: `/connections/requests/${REQ}/accept`, headers: h })).statusCode).toBe(204);
    expect(store.respond).toHaveBeenLastCalledWith(ME, REQ, "accept");
    expect((await app.inject({ method: "POST", url: `/connections/requests/${REQ}/decline`, headers: h })).statusCode).toBe(204);
    expect(store.respond).toHaveBeenLastCalledWith(ME, REQ, "decline");
    expect((await app.inject({ method: "DELETE", url: `/connections/requests/${REQ}`, headers: h })).statusCode).toBe(204);
    expect(store.withdraw).toHaveBeenCalledWith(ME, REQ);
    expect((await app.inject({ method: "POST", url: "/connections/requests/bad/accept", headers: h })).statusCode).toBe(400);
    const gone = makeApp(makeStore({ respond: vi.fn(async () => { throw new ConnectionError("not_pending", "closed"); }) }));
    expect((await gone.app.inject({ method: "POST", url: `/connections/requests/${REQ}/accept`, headers: h })).statusCode).toBe(409);
  });

  it("lists and removes connections", async () => {
    const { app, store } = makeApp();
    expect((await app.inject({ method: "GET", url: "/connections", headers: h })).json()).toEqual({ connections: [] });
    expect((await app.inject({ method: "DELETE", url: `/connections/${OTHER}`, headers: h })).statusCode).toBe(204);
    expect(store.removeConnection).toHaveBeenCalledWith(ME, OTHER);
    expect((await app.inject({ method: "DELETE", url: "/connections/nope", headers: h })).statusCode).toBe(400);
  });

  it("reads and updates the low-pressure setting", async () => {
    const { app, store } = makeApp();
    expect((await app.inject({ method: "GET", url: "/me/interaction-settings", headers: h })).json()).toEqual({ lowPressureMode: false });
    const res = await app.inject({ method: "PUT", url: "/me/interaction-settings", headers: h, payload: { lowPressureMode: true } });
    expect(res.json()).toEqual({ lowPressureMode: true });
    expect(store.updateSettings).toHaveBeenCalledWith(ME, { lowPressureMode: true });
    expect((await app.inject({ method: "PUT", url: "/me/interaction-settings", headers: h, payload: { lowPressureMode: "yes" } })).statusCode).toBe(400);
  });

  it("limits the activation summary to admins and validates the window", async () => {
    expect((await makeApp().app.inject({ method: "GET", url: "/admin/activation/summary", headers: h })).statusCode).toBe(403);
    const admin = makeApp(makeStore(), ["admin"]);
    expect((await admin.app.inject({ method: "GET", url: "/admin/activation/summary", headers: h })).json().sinceDays).toBe(30);
    await admin.app.inject({ method: "GET", url: "/admin/activation/summary?sinceDays=7", headers: h });
    expect(admin.store.activationSummary).toHaveBeenLastCalledWith(7);
    expect((await admin.app.inject({ method: "GET", url: "/admin/activation/summary?sinceDays=0", headers: h })).statusCode).toBe(400);
  });
});
