import { describe, expect, it } from "vitest";
import { createConnectionsClient } from "./connections";

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const mk = (f: typeof fetch) => createConnectionsClient({ apiUrl: "http://api", getAccessToken: async () => "tok", fetchImpl: f });

describe("connections client", () => {
  it("loads starters and sends a request with the chosen intro", async () => {
    const seen: string[] = []; let body = "";
    const c = mk(async (u, init) => { seen.push(`${init?.method} ${String(u).replace("http://api", "")}`); body = String(init?.body ?? ""); return ok(init?.method === "POST" ? { status: "pending", requestId: "r1" } : { icebreakers: [], questions: [], games: [], allowCustom: true }, init?.method === "POST" ? 201 : 200); });
    expect((await c.getStarters("u 1")).allowCustom).toBe(true);
    expect(await c.sendRequest("u1", { kind: "question", ref: "q_energy" })).toEqual({ status: "pending", requestId: "r1" });
    expect(JSON.parse(body)).toEqual({ recipientId: "u1", intro: { kind: "question", ref: "q_energy" } });
    expect(seen).toEqual(["GET /people/u%201/starters", "POST /connections/requests"]);
  });

  it("lists, answers and withdraws requests", async () => {
    const seen: string[] = [];
    const c = mk(async (u, init) => { seen.push(`${init?.method} ${String(u).replace("http://api", "")}`); return init?.method === "GET" ? ok({ requests: [{ id: "r" }], connections: [{ other: {} }] }) : new Response(null, { status: 204 }); });
    expect(await c.listRequests("outgoing")).toHaveLength(1);
    await c.accept("r"); await c.decline("r"); await c.withdraw("r");
    expect(await c.listConnections()).toHaveLength(1);
    await c.removeConnection("u");
    expect(seen).toEqual(["GET /connections/requests?box=outgoing", "POST /connections/requests/r/accept", "POST /connections/requests/r/decline", "DELETE /connections/requests/r", "GET /connections", "DELETE /connections/u"]);
  });

  it("reads and writes the low-pressure setting", async () => {
    let body = "";
    const c = mk(async (_u, init) => { body = String(init?.body ?? ""); return ok({ lowPressureMode: init?.method === "PUT" }); });
    expect(await c.getSettings()).toEqual({ lowPressureMode: false });
    expect(await c.setLowPressure(true)).toEqual({ lowPressureMode: true });
    expect(JSON.parse(body)).toEqual({ lowPressureMode: true });
  });

  it("turns server codes into kind, plain sentences", async () => {
    for (const [code, re] of [["daily_limit", /plenty of hellos/], ["already_pending", /already said hi/], ["custom_not_allowed", /low-pressure/], ["cooldown", /a little later/]] as const) {
      await expect(mk(async () => ok({ error: code }, 409)).sendRequest("u", { kind: "question", ref: "q" })).rejects.toMatchObject({ code, message: expect.stringMatching(re) });
    }
    await expect(mk(async () => { throw new Error("offline"); }).listConnections()).rejects.toMatchObject({ status: 503 });
    await expect(mk(async () => ok({}, 401)).accept("r")).rejects.toThrow(/sign in again/);
  });
});
