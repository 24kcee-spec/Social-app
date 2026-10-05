import { describe, expect, it } from "vitest";
import { createMessagingClient, newClientTag } from "./messaging";

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const mk = (f: typeof fetch) => createMessagingClient({ apiUrl: "http://api", getAccessToken: async () => "tok", fetchImpl: f });

describe("messaging client", () => {
  it("opens and lists conversations", async () => {
    const seen: string[] = []; let body = "";
    const c = mk(async (u, init) => {
      seen.push(`${init?.method} ${String(u).replace("http://api", "")}`);
      if (init?.method === "POST") body = String(init?.body ?? "");
      return init?.method === "POST" ? ok({ conversation: { id: "c1" } }, 201) : ok({ conversations: [{ id: "c1" }] });
    });
    expect((await c.openConversation("u 1")).id).toBe("c1");
    expect(await c.listConversations()).toHaveLength(1);
    expect(JSON.parse(body)).toEqual({ userId: "u 1" });
    expect(seen).toEqual(["POST /conversations", "GET /conversations"]);
  });

  it("pages messages and sends with a client tag", async () => {
    const seen: string[] = [];
    const c = mk(async (u, init) => {
      seen.push(`${init?.method} ${String(u).replace("http://api", "")}`);
      return init?.method === "POST" ? ok({ message: { id: "m1" } }, 201) : ok({ messages: [{ id: "m1" }], hasMore: true });
    });
    const page = await c.listMessages("c 1", { limit: 25, before: "2026-10-12T12:00:00.000Z" });
    expect(page.hasMore).toBe(true);
    const tag = newClientTag();
    expect((await c.sendMessage("c1", "hi there", tag)).id).toBe("m1");
    expect(seen[0]).toBe("GET /conversations/c%201/messages?limit=25&before=2026-10-12T12%3A00%3A00.000Z");
    expect(seen[1]).toBe("POST /conversations/c1/messages");
  });

  it("generates valid unique client tags", () => {
    const a = newClientTag(); const b = newClientTag();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });

  it("marks read and manages settings and push tokens", async () => {
    const seen: string[] = [];
    const c = mk(async (u, init) => {
      seen.push(`${init?.method} ${String(u).replace("http://api", "")}`);
      if (init?.method === "GET") return ok({ messages: true, connectionRequests: false });
      return init?.method === "DELETE" ? new Response(null, { status: 204 }) : init?.method === "PUT" ? ok({ messages: false, connectionRequests: true }) : ok({ registered: true }, 201);
    });
    await c.markRead("c1");
    expect(await c.getNotificationSettings()).toEqual({ messages: true, connectionRequests: false });
    await c.setNotificationSettings({ messages: false, connectionRequests: true });
    await c.registerPushToken("android", "tok-123456");
    await c.removePushToken("tok-123456");
    expect(seen).toEqual(["POST /conversations/c1/read", "GET /me/notification-settings", "PUT /me/notification-settings", "POST /me/push-tokens", "DELETE /me/push-tokens"]);
  });

  it("turns server codes into kind, plain sentences", async () => {
    for (const [code, re] of [["not_connected", /connected/], ["rate_limited", /pause/], ["daily_limit", /one day/]] as const) {
      await expect(mk(async () => ok({ error: code }, 429)).sendMessage("c1", "hi", newClientTag())).rejects.toMatchObject({ code, message: expect.stringMatching(re) });
    }
    await expect(mk(async () => { throw new Error("offline"); }).listConversations()).rejects.toMatchObject({ status: 503 });
    await expect(mk(async () => ok({}, 401)).markRead("c1")).rejects.toThrow(/sign in again/);
  });
});
