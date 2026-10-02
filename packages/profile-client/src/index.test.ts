import { describe, expect, it } from "vitest";
import { createProfileClient, ProfileApiError } from "./index";

const sampleProfile = { userId: "u1", displayName: "Kay", bio: "Hi", socialStyles: ["text_first"], privacy: { discoverable: true, messagePermission: "everyone", storyVisibility: "connections", activityVisibility: "public" }, onboardingCompleted: false, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", interests: [], prompts: [], media: [] };

function client(fetchImpl: typeof fetch) { return createProfileClient({ apiUrl: "http://api/", getAccessToken: async () => "token", fetchImpl }); }

describe("profile client", () => {
  it("loads the signed-in profile with a bearer token", async () => {
    let seen = "";
    const p = client(async (_url, init) => { seen = String((init?.headers as Record<string,string>).authorization); return new Response(JSON.stringify(sampleProfile), { status: 200 }); });
    await expect(p.getProfile()).resolves.toMatchObject({ userId: "u1" });
    expect(seen).toBe("Bearer token");
  });
  it("loads catalogues", async () => {
    let call = 0;
    const p = client(async () => { call++; return new Response(JSON.stringify(call === 1 ? { interests: [{ id: "i1" }] } : { prompts: [{ id: "p1" }] }), { status: 200 }); });
    await expect(p.listInterests()).resolves.toHaveLength(1);
    await expect(p.listPrompts()).resolves.toHaveLength(1);
  });
  it("sends JSON for profile updates", async () => {
    let body = "";
    const p = client(async (_url, init) => { body = String(init?.body); return new Response(JSON.stringify(sampleProfile), { status: 200 }); });
    await p.updateProfile({ displayName: "Kay" });
    expect(body).toBe(JSON.stringify({ displayName: "Kay" }));
  });
  it("sends onboarding JSON", async () => {
    let body = "";
    const p = client(async (_url, init) => { body = String(init?.body); return new Response(JSON.stringify(sampleProfile), { status: 200 }); });
    const payload = { displayName: "Kay", bio: "", socialStyles: ["text_first" as const], privacy: { discoverable: true, messagePermission: "everyone" as const, storyVisibility: "connections" as const, activityVisibility: "public" as const }, interests: [], answers: [] };
    await p.completeOnboarding(payload);
    expect(JSON.parse(body).displayName).toBe("Kay");
  });
  it("explains validation failures that carry no message", async () => {
    const p = client(async () => new Response(JSON.stringify({ error: "validation", fields: { interests: "Array must contain at least 3 element(s)" } }), { status: 400 }));
    await expect(p.completeOnboarding({} as never)).rejects.toThrow(/Interests \(pick 3 to 12\)/);
  });
  it("mentions the status for server errors without a message", async () => {
    const p = client(async () => new Response(JSON.stringify({ error: "internal_error" }), { status: 500 }));
    await expect(p.updateProfile({})).rejects.toThrow(/server error 500/);
  });
  it("returns structured validation errors", async () => {
    const p = client(async () => new Response(JSON.stringify({ error: "validation", fields: { displayName: "Required" } }), { status: 400 }));
    await expect(p.updateProfile({})).rejects.toMatchObject({ code: "validation", status: 400, fields: { displayName: "Required" } });
  });
  it("maps unauthorized responses", async () => {
    const p = client(async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }));
    await expect(p.getProfile()).rejects.toMatchObject({ code: "unauthorized", status: 401 });
  });
  it("maps server failures", async () => {
    const p = client(async () => new Response(JSON.stringify({}), { status: 503 }));
    await expect(p.listInterests()).rejects.toBeInstanceOf(ProfileApiError);
  });
  it("registers media and returns the saved media row", async () => {
    const media = { id: "m1", kind: "avatar", storagePath: "u1/a.jpg", thumbnailPath: "u1/a-thumb.jpg", contentType: "image/jpeg", sizeBytes: 1000, width: 1000, height: 1000, sortOrder: 0, createdAt: "2026-10-01T00:00:00.000Z" };
    const p = client(async () => new Response(JSON.stringify(media), { status: 201 }));
    await expect(p.registerMedia({ kind: "avatar", storagePath: "u1/a.jpg", thumbnailPath: "u1/a-thumb.jpg", contentType: "image/jpeg", sizeBytes: 1000, width: 1000, height: 1000, sortOrder: 0 })).resolves.toMatchObject({ id: "m1" });
  });
  it("deletes media only on a 204 response", async () => {
    let method = "";
    const p = client(async (_url, init) => { method = init?.method ?? ""; return new Response(null, { status: 204 }); });
    await p.deleteMedia("m1");
    expect(method).toBe("DELETE");
  });
  it("turns network errors into service_unavailable", async () => {
    const p = client(async () => { throw new Error("down"); });
    await expect(p.getProfile()).rejects.toMatchObject({ code: "service_unavailable", status: 503 });
  });
});
