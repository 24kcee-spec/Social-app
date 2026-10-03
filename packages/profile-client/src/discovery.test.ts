import { describe, expect, it } from "vitest";
import { createDiscoveryClient } from "./discovery";
import { ProfileApiError } from "./index";

const mk = (fetchImpl: typeof fetch) => createDiscoveryClient({ apiUrl: "http://api/", getAccessToken: async () => "tok", fetchImpl });
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("discovery client", () => {
  it("loads people with paging and a bearer token", async () => {
    let url = ""; let auth = "";
    const c = mk(async (u, init) => { url = String(u); auth = String((init?.headers as Record<string, string>).authorization); return ok({ people: [{ userId: "u" }], hasMore: true }); });
    const feed = await c.getPeople(10, 20);
    expect(url).toBe("http://api/discovery/people?limit=10&offset=20");
    expect(auth).toBe("Bearer tok");
    expect(feed.hasMore).toBe(true);
  });

  it("explains an unfinished profile in plain words", async () => {
    const c = mk(async () => ok({ error: "onboarding_required", message: "x" }, 403));
    await expect(c.getPeople()).rejects.toMatchObject({ code: "onboarding_required", message: "Finish your profile to start seeing people." });
  });

  it("sends event batches (max 50) and skips empty batches without a request", async () => {
    let calls = 0; let body = "";
    const c = mk(async (_u, init) => { calls++; body = String(init?.body); return ok({ recorded: 2 }, 202); });
    expect(await c.recordEvents([])).toBe(0);
    expect(calls).toBe(0);
    const many = Array.from({ length: 60 }, () => ({ candidateId: "x", type: "impression" as const }));
    expect(await c.recordEvents(many)).toBe(2);
    expect(JSON.parse(body).events).toHaveLength(50);
  });

  it("blocks, lists and unblocks", async () => {
    const seen: string[] = [];
    const c = mk(async (u, init) => { seen.push(`${init?.method} ${String(u).replace("http://api", "")}`); return init?.method === "DELETE" ? new Response(null, { status: 204 }) : init?.method === "GET" ? ok({ blocks: [{ userId: "b", displayName: "B", blockedAt: "t" }] }) : ok({ blocked: true }, 201); });
    await c.block("b");
    expect(await c.listBlocks()).toHaveLength(1);
    await c.unblock("b");
    expect(seen).toEqual(["POST /blocks", "GET /blocks", "DELETE /blocks/b"]);
  });

  it("maps outages and rate limits to friendly errors", async () => {
    await expect(mk(async () => { throw new Error("offline"); }).getPeople()).rejects.toMatchObject({ status: 503 });
    await expect(mk(async () => ok({ error: "rate_limited" }, 429)).recordEvents([{ candidateId: "x", type: "open" }])).rejects.toBeInstanceOf(ProfileApiError);
    await expect(mk(async () => ok({}, 401)).listBlocks()).rejects.toThrow(/sign in again/);
  });
});
