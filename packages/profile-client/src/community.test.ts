import { describe, expect, it, vi } from "vitest";
import { createCommunityClient } from "./community";

const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });
function setup(response: Response | (() => never)) {
  const fetchImpl = vi.fn(async (..._a: unknown[]) => { if (typeof response === "function") return response(); return response; });
  return { fetchImpl, client: createCommunityClient({ apiUrl: "http://api/", getAccessToken: async () => "tok", fetchImpl: fetchImpl as unknown as typeof fetch }) };
}

describe("community client", () => {
  it("sends the bearer token and builds encoded query strings, skipping empty filters", async () => {
    const { client, fetchImpl } = setup(json(200, { groups: [] }));
    await client.listGroups({ generalArea: "Bulawayo North", activityId: undefined });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api/groups?generalArea=Bulawayo%20North");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });
  it("returns undefined for 204 and unwraps envelopes", async () => {
    expect(await setup(json(204)).client.joinGroup("g1")).toBeUndefined();
    expect(await setup(json(200, { event: { id: "e1" } })).client.getEvent("e1")).toEqual({ id: "e1" });
    expect(await setup(json(200, { status: "waitlisted" })).client.rsvp("e1")).toEqual({ status: "waitlisted" });
  });
  it("turns server errors into friendly messages", async () => {
    await expect(setup(json(409, { error: "full", message: "raw" })).client.joinGroup("g1")).rejects.toMatchObject({ status: 409, code: "full", message: "This one is full." });
    await expect(setup(json(403, { error: "forbidden" })).client.listEventMessages("e1")).rejects.toMatchObject({ code: "forbidden" });
  });
  it("reports an unreachable service plainly", async () => {
    await expect(setup(() => { throw new Error("offline"); }).client.listEvents()).rejects.toMatchObject({ status: 503, code: "service_unavailable" });
  });
  it("sends event chat messages with their client tag and pages with a cursor", async () => {
    const { client, fetchImpl } = setup(json(201, { message: { id: "m1" } }));
    await client.sendEventMessage("e1", "hi", "tag-1");
    expect(JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string)).toEqual({ body: "hi", clientTag: "tag-1" });
    const page = setup(json(200, { messages: [], hasMore: false, nextCursor: null }));
    await page.client.listEventMessages("e1", { limit: 20, before: "2026-10-12 11:00:00+00~abc" });
    expect(page.fetchImpl.mock.calls[0]![0]).toBe("http://api/events/e1/messages?limit=20&before=2026-10-12%2011%3A00%3A00%2B00~abc");
  });
});
