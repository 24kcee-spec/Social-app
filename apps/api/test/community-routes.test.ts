import { describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import { buildApp } from "../src/app";
import { registerCommunity } from "../src/community/plugin";
import { CommunityError, type CommunityStore } from "../src/community/store";

const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TAG = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const h = { authorization: "Bearer t" };

function makeApp(over: Partial<Record<keyof CommunityStore, unknown>> = {}) {
  const store = new Proxy({ ...over } as Record<string, unknown>, { get: (t, k: string) => t[k] ?? vi.fn(async () => { throw new Error("unexpected store call " + k); }) }) as unknown as CommunityStore;
  const app = buildApp();
  const requireAuth = async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.headers.authorization !== "Bearer t") return reply.code(401).send({ error: "unauthorized" });
    req.auth = { user: { id: ME, email: "me@example.com", phone: null, status: "active", roles: ["user"], createdAt: new Date(), lastActiveAt: null }, sessionId: "s" };
  };
  registerCommunity(app, { store, requireAuth });
  return app;
}

describe("community routes", () => {
  it("requires sign-in everywhere", async () => {
    const app = makeApp();
    for (const [method, url] of [["GET", "/groups"], ["POST", "/groups"], ["GET", "/events"], ["POST", `/events/${ID}/rsvp`], ["GET", `/events/${ID}/messages`]] as const) {
      expect((await app.inject({ method, url })).statusCode, url).toBe(401);
    }
  });
  it("rejects malformed ids before touching the store", async () => {
    const listEventMessages = vi.fn();
    const app = makeApp({ listEventMessages });
    expect((await app.inject({ method: "GET", url: "/events/not-a-uuid/messages", headers: h })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/groups/xyz/join", headers: h })).statusCode).toBe(400);
    expect(listEventMessages).not.toHaveBeenCalled();
  });
  it("returns field-level validation errors", async () => {
    const app = makeApp();
    const res = await app.inject({ method: "POST", url: "/groups", headers: h, payload: { name: "x", generalArea: "" } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "validation", fields: { name: expect.any(String) } });
    const bad = await app.inject({ method: "POST", url: `/events/${ID}/messages`, headers: h, payload: { body: "", clientTag: "nope" } });
    expect(bad.statusCode).toBe(400);
  });
  it("maps every domain error to the right status", async () => {
    const cases: [CommunityError["code"], number][] = [["not_found", 404], ["forbidden", 403], ["full", 409], ["invalid", 400], ["onboarding_required", 403], ["limit_reached", 409], ["rate_limited", 429], ["daily_limit", 429]];
    for (const [code, status] of cases) {
      const app = makeApp({ rsvp: vi.fn(async () => { throw new CommunityError(code, "msg"); }) });
      const res = await app.inject({ method: "POST", url: `/events/${ID}/rsvp`, headers: h });
      expect(res.statusCode, code).toBe(status);
      expect(res.json()).toMatchObject({ error: code });
    }
  });
  it("passes the signed-in user to the store, never an id from the request", async () => {
    const sendEventMessage = vi.fn(async () => ({ id: ID, eventId: ID, senderId: ME, senderName: "Me", body: "hi", clientTag: TAG, createdAt: "2026-10-12T12:00:00.000Z" }));
    const app = makeApp({ sendEventMessage });
    const res = await app.inject({ method: "POST", url: `/events/${ID}/messages`, headers: h, payload: { body: "hi", clientTag: TAG, senderId: "someone-else" } });
    expect(res.statusCode).toBe(201);
    expect(sendEventMessage).toHaveBeenCalledWith(ME, ID, "hi", TAG);
  });
});
