import { describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { DiscoveryCard } from "@sp/types";
import { buildApp } from "../src/app";
import { registerDiscovery } from "../src/discovery/plugin";
import { OnboardingRequiredError, RateLimitedError, SelfActionError, UnknownUserError, type DiscoveryStore } from "../src/discovery/store";

const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const card: DiscoveryCard = { userId: OTHER, displayName: "Bea", bio: "Hi", socialStyles: ["low_pressure"], messagePermission: "everyone", interests: [], sharedInterests: [], prompts: [], thumbnailPath: null, score: 12, reasons: [{ code: "shared_interests", text: "You both like Football", points: 12 }] };

function makeStore(over: Partial<DiscoveryStore> = {}): DiscoveryStore {
  return {
    getFeed: vi.fn(async () => ({ people: [card], hasMore: false })),
    recordEvents: vi.fn(async () => 1),
    block: vi.fn(async () => undefined),
    unblock: vi.fn(async () => undefined),
    listBlocks: vi.fn(async () => [{ userId: OTHER, displayName: "Bea", blockedAt: "2026-10-02T00:00:00.000Z" }]),
    explain: vi.fn(async () => ({ viewerId: ME, candidateId: OTHER, eligible: true, excludedBecause: [], hiddenByIgnores: false, score: 12, components: [], feedPosition: 1, history: { ignores30d: 0, impressions7d: 0 } })),
    ...over,
  } as DiscoveryStore;
}

function makeApp(store = makeStore(), roles: ("user" | "admin")[] = ["user"]) {
  const app = buildApp();
  const requireAuth = async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.headers.authorization !== "Bearer test-token") return reply.code(401).send({ error: "unauthorized" });
    req.auth = { user: { id: ME, email: "me@example.com", phone: null, status: "active", roles, createdAt: new Date(), lastActiveAt: null }, sessionId: "s1" };
  };
  const requireRole = (...allowed: string[]) => async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return reply.code(401).send({ error: "unauthorized" });
    if (!allowed.some((r) => (req.auth!.user.roles as string[]).includes(r))) return reply.code(403).send({ error: "forbidden" });
  };
  registerDiscovery(app, { store, requireAuth, requireRole: requireRole as never });
  return { app, store };
}
const authed = { authorization: "Bearer test-token" };

describe("discovery routes", () => {
  it("protects every Phase 3 route with authentication", async () => {
    const { app } = makeApp();
    const routes: { method: "GET" | "POST" | "DELETE"; url: string }[] = [
      { method: "GET", url: "/discovery/people" }, { method: "POST", url: "/discovery/events" }, { method: "GET", url: "/blocks" },
      { method: "POST", url: "/blocks" }, { method: "DELETE", url: `/blocks/${OTHER}` }, { method: "GET", url: `/admin/discovery/explain?viewerId=${ME}&candidateId=${OTHER}` },
    ];
    for (const r of routes) expect((await app.inject(r)).statusCode).toBe(401);
  });

  it("returns the feed for the signed-in viewer only, with defaults", async () => {
    const { app, store } = makeApp();
    const res = await app.inject({ method: "GET", url: "/discovery/people", headers: authed });
    expect(res.statusCode).toBe(200);
    expect(res.json().people[0].reasons[0].text).toBe("You both like Football");
    expect(store.getFeed).toHaveBeenCalledWith(ME, 20, 0);
  });

  it("validates and clamps paging input", async () => {
    const { app, store } = makeApp();
    expect((await app.inject({ method: "GET", url: "/discovery/people?limit=500", headers: authed })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/discovery/people?offset=-1", headers: authed })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/discovery/people?limit=abc", headers: authed })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/discovery/people?limit=5&offset=10", headers: authed })).statusCode).toBe(200);
    expect(store.getFeed).toHaveBeenLastCalledWith(ME, 5, 10);
  });

  it("asks people to finish their profile first", async () => {
    const { app } = makeApp(makeStore({ getFeed: vi.fn(async () => { throw new OnboardingRequiredError("Finish your profile to see people"); }) }));
    const res = await app.inject({ method: "GET", url: "/discovery/people", headers: authed });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("onboarding_required");
  });

  it("accepts event batches and returns how many were stored", async () => {
    const { app, store } = makeApp();
    const res = await app.inject({ method: "POST", url: "/discovery/events", headers: authed, payload: { events: [{ candidateId: OTHER, type: "impression" }] } });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ recorded: 1 });
    expect(store.recordEvents).toHaveBeenCalledWith(ME, [{ candidateId: OTHER, type: "impression" }]);
  });

  it("rejects malformed events", async () => {
    const { app, store } = makeApp();
    for (const payload of [{}, { events: [] }, { events: [{ candidateId: "nope", type: "impression" }] }, { events: [{ candidateId: OTHER, type: "like" }] }, { events: Array.from({ length: 51 }, () => ({ candidateId: OTHER, type: "open" })) }]) {
      expect((await app.inject({ method: "POST", url: "/discovery/events", headers: authed, payload })).statusCode).toBe(400);
    }
    expect(store.recordEvents).not.toHaveBeenCalled();
  });

  it("returns 429 when events arrive too fast", async () => {
    const { app } = makeApp(makeStore({ recordEvents: vi.fn(async () => { throw new RateLimitedError("x"); }) }));
    const res = await app.inject({ method: "POST", url: "/discovery/events", headers: authed, payload: { events: [{ candidateId: OTHER, type: "open" }] } });
    expect(res.statusCode).toBe(429);
  });

  it("blocks, lists and unblocks", async () => {
    const { app, store } = makeApp();
    expect((await app.inject({ method: "POST", url: "/blocks", headers: authed, payload: { userId: OTHER } })).statusCode).toBe(201);
    expect(store.block).toHaveBeenCalledWith(ME, OTHER);
    expect((await app.inject({ method: "GET", url: "/blocks", headers: authed })).json().blocks).toHaveLength(1);
    expect((await app.inject({ method: "DELETE", url: `/blocks/${OTHER}`, headers: authed })).statusCode).toBe(204);
    expect(store.unblock).toHaveBeenCalledWith(ME, OTHER);
  });

  it("validates block requests and maps store errors", async () => {
    expect((await makeApp().app.inject({ method: "POST", url: "/blocks", headers: authed, payload: { userId: "x" } })).statusCode).toBe(400);
    expect((await makeApp().app.inject({ method: "DELETE", url: "/blocks/not-a-uuid", headers: authed })).statusCode).toBe(400);
    expect((await makeApp(makeStore({ block: vi.fn(async () => { throw new SelfActionError("self"); }) })).app.inject({ method: "POST", url: "/blocks", headers: authed, payload: { userId: ME } })).statusCode).toBe(400);
    expect((await makeApp(makeStore({ block: vi.fn(async () => { throw new UnknownUserError("none"); }) })).app.inject({ method: "POST", url: "/blocks", headers: authed, payload: { userId: OTHER } })).statusCode).toBe(404);
  });

  it("limits the admin explain tool to admins and validates ids", async () => {
    const url = `/admin/discovery/explain?viewerId=${ME}&candidateId=${OTHER}`;
    expect((await makeApp(makeStore(), ["user"]).app.inject({ method: "GET", url, headers: authed })).statusCode).toBe(403);
    const admin = makeApp(makeStore(), ["admin"]);
    const res = await admin.app.inject({ method: "GET", url, headers: authed });
    expect(res.statusCode).toBe(200);
    expect(res.json().feedPosition).toBe(1);
    expect((await admin.app.inject({ method: "GET", url: "/admin/discovery/explain?viewerId=x&candidateId=y", headers: authed })).statusCode).toBe(400);
  });
});
