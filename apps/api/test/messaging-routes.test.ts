import { describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import { buildApp } from "../src/app";
import { registerMessaging } from "../src/messaging/plugin";
import { MessagingError, type MessagingStore } from "../src/messaging/store";

const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CONV = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TAG = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const conversation = { id: CONV, other: { userId: OTHER, displayName: "Ben", bio: "", thumbnailPath: null }, lastMessage: null, unreadCount: 0, createdAt: "2026-10-12T12:00:00.000Z" };
const message = { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", conversationId: CONV, senderId: ME, kind: "text" as const, body: "hi", clientTag: TAG, createdAt: "2026-10-12T12:00:00.000Z", read: false };

function makeStore(over: Partial<MessagingStore> = {}): MessagingStore {
  return {
    openConversation: vi.fn(async () => conversation),
    listConversations: vi.fn(async () => [conversation]),
    listMessages: vi.fn(async () => ({ messages: [message], hasMore: false })),
    sendMessage: vi.fn(async () => message),
    markRead: vi.fn(async () => undefined),
    getSettings: vi.fn(async () => ({ messages: true, connectionRequests: true })),
    updateSettings: vi.fn(async (_u: string, s: { messages: boolean; connectionRequests: boolean }) => s),
    registerPushToken: vi.fn(async () => undefined),
    removePushToken: vi.fn(async () => undefined),
    ...over,
  } as MessagingStore;
}
function makeApp(store = makeStore()) {
  const app = buildApp();
  const requireAuth = async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.headers.authorization !== "Bearer t") return reply.code(401).send({ error: "unauthorized" });
    req.auth = { user: { id: ME, email: "me@example.com", phone: null, status: "active", roles: ["user"], createdAt: new Date(), lastActiveAt: null }, sessionId: "s" };
  };
  registerMessaging(app, { store, requireAuth });
  return { app, store };
}
const h = { authorization: "Bearer t" };

describe("messaging routes", () => {
  it("require authentication everywhere", async () => {
    const { app } = makeApp();
    const routes: { method: "GET" | "POST" | "DELETE" | "PUT"; url: string }[] = [
      { method: "POST", url: "/conversations" }, { method: "GET", url: "/conversations" },
      { method: "GET", url: `/conversations/${CONV}/messages` }, { method: "POST", url: `/conversations/${CONV}/messages` },
      { method: "POST", url: `/conversations/${CONV}/read` },
      { method: "GET", url: "/me/notification-settings" }, { method: "PUT", url: "/me/notification-settings" },
      { method: "POST", url: "/me/push-tokens" }, { method: "DELETE", url: "/me/push-tokens" },
    ];
    for (const r of routes) expect((await app.inject(r)).statusCode, `${r.method} ${r.url}`).toBe(401);
  });

  it("opens a conversation as the signed-in user only", async () => {
    const { app, store } = makeApp();
    const res = await app.inject({ method: "POST", url: "/conversations", headers: h, payload: { userId: OTHER } });
    expect(res.statusCode).toBe(201);
    expect(res.json().conversation.id).toBe(CONV);
    expect(store.openConversation).toHaveBeenCalledWith(ME, OTHER);
    expect((await app.inject({ method: "POST", url: "/conversations", headers: h, payload: { userId: "nope" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/conversations", headers: h, payload: {} })).statusCode).toBe(400);
  });

  it("lists conversations and pages messages with validation", async () => {
    const { app, store } = makeApp();
    expect((await app.inject({ method: "GET", url: "/conversations", headers: h })).json().conversations).toHaveLength(1);
    const res = await app.inject({ method: "GET", url: `/conversations/${CONV}/messages?limit=25`, headers: h });
    expect(res.statusCode).toBe(200);
    expect(store.listMessages).toHaveBeenCalledWith(ME, CONV, { limit: 25, before: undefined });
    expect((await app.inject({ method: "GET", url: "/conversations/not-a-uuid/messages", headers: h })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: `/conversations/${CONV}/messages?limit=0`, headers: h })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: `/conversations/${CONV}/messages?before=not-a-date`, headers: h })).statusCode).toBe(400);
  });

  it("sends a message with a client tag and rejects junk", async () => {
    const { app, store } = makeApp();
    const res = await app.inject({ method: "POST", url: `/conversations/${CONV}/messages`, headers: h, payload: { body: "hi", clientTag: TAG } });
    expect(res.statusCode).toBe(201);
    expect(res.json().message.body).toBe("hi");
    expect(store.sendMessage).toHaveBeenCalledWith(ME, CONV, "hi", TAG);
    const bad = [{}, { body: "hi" }, { body: "  ", clientTag: TAG }, { body: "hi", clientTag: "nope" }, { body: "x".repeat(2001), clientTag: TAG }];
    for (const payload of bad) expect((await app.inject({ method: "POST", url: `/conversations/${CONV}/messages`, headers: h, payload })).statusCode, JSON.stringify(payload).slice(0, 40)).toBe(400);
  });

  it("marks read and manages notification settings", async () => {
    const { app, store } = makeApp();
    expect((await app.inject({ method: "POST", url: `/conversations/${CONV}/read`, headers: h })).statusCode).toBe(204);
    expect(store.markRead).toHaveBeenCalledWith(ME, CONV);
    expect((await app.inject({ method: "GET", url: "/me/notification-settings", headers: h })).json()).toEqual({ messages: true, connectionRequests: true });
    const put = await app.inject({ method: "PUT", url: "/me/notification-settings", headers: h, payload: { messages: false, connectionRequests: true } });
    expect(put.statusCode).toBe(200);
    expect(store.updateSettings).toHaveBeenCalledWith(ME, { messages: false, connectionRequests: true });
    expect((await app.inject({ method: "PUT", url: "/me/notification-settings", headers: h, payload: { messages: "yes" } })).statusCode).toBe(400);
  });

  it("registers and removes push tokens", async () => {
    const { app, store } = makeApp();
    const res = await app.inject({ method: "POST", url: "/me/push-tokens", headers: h, payload: { platform: "android", token: "fcm-token-abc123" } });
    expect(res.statusCode).toBe(201);
    expect(store.registerPushToken).toHaveBeenCalledWith(ME, "android", "fcm-token-abc123");
    expect((await app.inject({ method: "POST", url: "/me/push-tokens", headers: h, payload: { platform: " toaster ", token: "x" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "DELETE", url: "/me/push-tokens", headers: h, payload: { token: "fcm-token-abc123" } })).statusCode).toBe(204);
    expect(store.removePushToken).toHaveBeenCalledWith(ME, "fcm-token-abc123");
  });

  it("maps every domain error to the right status", async () => {
    const cases: [MessagingError["code"], number][] = [["not_found", 404], ["not_member", 404], ["not_connected", 403], ["onboarding_required", 403], ["rate_limited", 429], ["daily_limit", 429], ["messages_off", 403], ["account_inactive", 403]];
    for (const [code, status] of cases) {
      const { app } = makeApp(makeStore({ sendMessage: vi.fn(async () => { throw new MessagingError(code, "msg"); }) }));
      const res = await app.inject({ method: "POST", url: `/conversations/${CONV}/messages`, headers: h, payload: { body: "hi", clientTag: TAG } });
      expect(res.statusCode, code).toBe(status);
      expect(res.json().error, code).toBe(code);
    }
  });
});
