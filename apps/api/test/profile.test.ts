import { describe, expect, it, vi } from "vitest";
import type { FastifyRequest, FastifyReply } from "fastify";
import type { Profile, Interest, PromptDefinition } from "@sp/types";
import { buildApp } from "../src/app";
import { registerProfile } from "../src/profile/plugin";
import { ProfileMediaLimitError, ProfileValidationError, type ProfileStore } from "../src/profile/store";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEDIA_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const INTEREST_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PROMPT_ID = "weekend";

const profile: Profile = {
  userId: USER_ID,
  displayName: "Alex",
  bio: "Learning, building and finding good people to learn with.",
  socialStyles: ["small_group", "text_first"],
  privacy: { discoverable: true, messagePermission: "everyone", storyVisibility: "connections", activityVisibility: "public" },
  onboardingCompleted: false,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  interests: [],
  prompts: [],
  media: [],
};

function makeStore(overrides: Partial<ProfileStore> = {}): ProfileStore {
  return {
    getProfile: vi.fn(async () => profile),
    updateProfile: vi.fn(async () => profile),
    updateInterests: vi.fn(async () => profile),
    updatePrompts: vi.fn(async () => profile),
    completeOnboarding: vi.fn(async () => ({ ...profile, onboardingCompleted: true })),
    listInterests: vi.fn(async (): Promise<Interest[]> => [{ id: INTEREST_ID, name: "Football", category: "Sports", slug: "football", sortOrder: 10 }]),
    listPrompts: vi.fn(async (): Promise<PromptDefinition[]> => [{ id: PROMPT_ID, prompt: "My ideal weekend looks like...", category: "Lifestyle", sortOrder: 10, active: true }]),
    addMedia: vi.fn(async () => ({ id: MEDIA_ID, kind: "avatar" as const, storagePath: `${USER_ID}/x.jpg`, thumbnailPath: `${USER_ID}/x-thumb.jpg`, contentType: "image/jpeg", sizeBytes: 1000, width: 1400, height: 1400, sortOrder: 0, createdAt: "2026-10-01T00:00:00.000Z" })),
    deleteMedia: vi.fn(async () => true),
    ...overrides,
  };
}

function makeAppForTest(store = makeStore()) {
  const app = buildApp();
  const requireAuth = async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.headers.authorization !== "Bearer test-token") return reply.code(401).send({ error: "unauthorized" });
    req.auth = { user: { id: USER_ID, email: "user@example.com", phone: null, status: "active", roles: ["user"], createdAt: new Date(), lastActiveAt: null }, sessionId: "session-1" };
  };
  registerProfile(app, { requireAuth, store });
  return { app, store };
}

const authed = { authorization: "Bearer test-token" };
const json = (res: { json(): unknown }) => res.json() as Record<string, unknown>;

describe("profile routes", () => {
  it("protects every Phase 2 route with authentication", async () => {
    const { app } = makeAppForTest();
    const routes: Array<{ method: "GET" | "POST" | "PUT" | "DELETE"; url: string }> = [
      { method: "GET", url: "/interests" },
      { method: "GET", url: "/prompts" },
      { method: "GET", url: "/me/profile" },
      { method: "PUT", url: "/me/profile" },
      { method: "PUT", url: "/me/interests" },
      { method: "PUT", url: "/me/prompts" },
      { method: "PUT", url: "/me/onboarding" },
      { method: "POST", url: "/me/profile/media" },
      { method: "DELETE", url: `/me/profile/media/${MEDIA_ID}` },
    ];
    for (const route of routes) {
      const res = await app.inject(route);
      expect(res.statusCode).toBe(401);
    }
  });

  it("lists active interests", async () => {
    const { app } = makeAppForTest();
    const res = await app.inject({ method: "GET", url: "/interests", headers: authed });
    expect(res.statusCode).toBe(200);
    expect(json(res).interests).toHaveLength(1);
  });

  it("lists active prompts", async () => {
    const { app } = makeAppForTest();
    const res = await app.inject({ method: "GET", url: "/prompts", headers: authed });
    expect(res.statusCode).toBe(200);
    expect(json(res).prompts).toHaveLength(1);
  });

  it("returns only the signed-in user's profile", async () => {
    const store = makeStore();
    const { app } = makeAppForTest(store);
    const res = await app.inject({ method: "GET", url: "/me/profile", headers: authed });
    expect(res.statusCode).toBe(200);
    expect(json(res).userId).toBe(USER_ID);
    expect(store.getProfile).toHaveBeenCalledWith(USER_ID);
  });

  it("updates basic profile data", async () => {
    const store = makeStore();
    const { app } = makeAppForTest(store);
    const res = await app.inject({ method: "PUT", url: "/me/profile", headers: authed, payload: { displayName: "New Name", bio: "New bio" } });
    expect(res.statusCode).toBe(200);
    expect(store.updateProfile).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ displayName: "New Name", bio: "New bio" }));
  });

  it("rejects invalid profile updates", async () => {
    const store = makeStore();
    const { app } = makeAppForTest(store);
    const res = await app.inject({ method: "PUT", url: "/me/profile", headers: authed, payload: { displayName: "x" } });
    expect(res.statusCode).toBe(400);
    expect(json(res).error).toBe("validation");
    expect(store.updateProfile).not.toHaveBeenCalled();
  });

  it("accepts valid interest selections", async () => {
    const store = makeStore();
    const { app } = makeAppForTest(store);
    const res = await app.inject({ method: "PUT", url: "/me/interests", headers: authed, payload: { interests: [{ interestId: INTEREST_ID, strength: 3 }] } });
    expect(res.statusCode).toBe(200);
    expect(store.updateInterests).toHaveBeenCalledWith(USER_ID, { interests: [{ interestId: INTEREST_ID, strength: 3 }] });
  });

  it("rejects duplicate interest selections", async () => {
    const store = makeStore();
    const { app } = makeAppForTest(store);
    const res = await app.inject({ method: "PUT", url: "/me/interests", headers: authed, payload: { interests: [{ interestId: INTEREST_ID }, { interestId: INTEREST_ID }] } });
    expect(res.statusCode).toBe(400);
    expect(store.updateInterests).not.toHaveBeenCalled();
  });

  it("accepts valid prompt answers", async () => {
    const store = makeStore();
    const { app } = makeAppForTest(store);
    const res = await app.inject({ method: "PUT", url: "/me/prompts", headers: authed, payload: { answers: [{ promptId: PROMPT_ID, answer: "A quiet morning and a good book." }] } });
    expect(res.statusCode).toBe(200);
    expect(store.updatePrompts).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ answers: [{ promptId: PROMPT_ID, answer: "A quiet morning and a good book." }] }));
  });

  it("rejects blank prompt answers", async () => {
    const store = makeStore();
    const { app } = makeAppForTest(store);
    const res = await app.inject({ method: "PUT", url: "/me/prompts", headers: authed, payload: { answers: [{ promptId: PROMPT_ID, answer: " " }] } });
    expect(res.statusCode).toBe(400);
    expect(store.updatePrompts).not.toHaveBeenCalled();
  });

  it("completes onboarding through the atomic profile endpoint", async () => {
    const store = makeStore();
    const { app } = makeAppForTest(store);
    const res = await app.inject({ method: "PUT", url: "/me/onboarding", headers: authed, payload: {
      displayName: "Alex", bio: "Builder", socialStyles: ["small_group"],
      privacy: { discoverable: true, messagePermission: "connections", storyVisibility: "connections", activityVisibility: "public" },
      interests: [{ interestId: INTEREST_ID, strength: 2 }, { interestId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", strength: 2 }, { interestId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", strength: 1 }],
      answers: [{ promptId: PROMPT_ID, answer: "Trying new places." }],
    } });
    expect(res.statusCode).toBe(200);
    expect(json(res).onboardingCompleted).toBe(true);
    expect(store.completeOnboarding).toHaveBeenCalledOnce();
  });

  it("rejects onboarding that does not meet the minimum selections", async () => {
    const store = makeStore();
    const { app } = makeAppForTest(store);
    const res = await app.inject({ method: "PUT", url: "/me/onboarding", headers: authed, payload: {
      displayName: "A", bio: "", socialStyles: [], privacy: { discoverable: true, messagePermission: "everyone", storyVisibility: "connections", activityVisibility: "public" }, interests: [], answers: [],
    } });
    expect(res.statusCode).toBe(400);
    expect(store.completeOnboarding).not.toHaveBeenCalled();
  });

  it("registers a valid profile media item", async () => {
    const store = makeStore();
    const { app } = makeAppForTest(store);
    const res = await app.inject({ method: "POST", url: "/me/profile/media", headers: authed, payload: { kind: "avatar", storagePath: `${USER_ID}/a.jpg`, thumbnailPath: `${USER_ID}/a-thumb.jpg`, contentType: "image/jpeg", sizeBytes: 1000, width: 1400, height: 1400, sortOrder: 0 } });
    expect(res.statusCode).toBe(201);
    expect(store.addMedia).toHaveBeenCalledWith(USER_ID, expect.any(Object));
  });

  it("rejects invalid media registration", async () => {
    const store = makeStore();
    const { app } = makeAppForTest(store);
    const res = await app.inject({ method: "POST", url: "/me/profile/media", headers: authed, payload: { kind: "avatar", storagePath: "other/a.jpg", thumbnailPath: `${USER_ID}/a-thumb.jpg`, contentType: "image/gif", sizeBytes: 1, width: 1, height: 1, sortOrder: 0 } });
    expect(res.statusCode).toBe(400);
    expect(store.addMedia).not.toHaveBeenCalled();
  });

  it("returns 409 when the media limit is reached", async () => {
    const store = makeStore({ addMedia: vi.fn(async () => { throw new ProfileMediaLimitError("limit"); }) });
    const { app } = makeAppForTest(store);
    const res = await app.inject({ method: "POST", url: "/me/profile/media", headers: authed, payload: { kind: "avatar", storagePath: `${USER_ID}/a.jpg`, thumbnailPath: `${USER_ID}/a-thumb.jpg`, contentType: "image/jpeg", sizeBytes: 1, width: 1, height: 1, sortOrder: 0 } });
    expect(res.statusCode).toBe(409);
    expect(json(res).error).toBe("media_limit");
  });

  it("returns 400 for business validation errors from the store", async () => {
    const store = makeStore({ updateProfile: vi.fn(async () => { throw new ProfileValidationError("invalid setting"); }) });
    const { app } = makeAppForTest(store);
    const res = await app.inject({ method: "PUT", url: "/me/profile", headers: authed, payload: { bio: "ok" } });
    expect(res.statusCode).toBe(400);
    expect(json(res).message).toBe("invalid setting");
  });

  it("deletes only a valid UUID media id for the signed-in user", async () => {
    const store = makeStore();
    const { app } = makeAppForTest(store);
    const res = await app.inject({ method: "DELETE", url: `/me/profile/media/${MEDIA_ID}`, headers: authed });
    expect(res.statusCode).toBe(204);
    expect(store.deleteMedia).toHaveBeenCalledWith(USER_ID, MEDIA_ID);
  });

  it("returns 404 when the signed-in user cannot delete that media id", async () => {
    const store = makeStore({ deleteMedia: vi.fn(async () => false) });
    const { app } = makeAppForTest(store);
    const res = await app.inject({ method: "DELETE", url: `/me/profile/media/${MEDIA_ID}`, headers: authed });
    expect(res.statusCode).toBe(404);
    expect(json(res).error).toBe("not_found");
  });

  it("rejects malformed media ids", async () => {
    const store = makeStore();
    const { app } = makeAppForTest(store);
    const res = await app.inject({ method: "DELETE", url: "/me/profile/media/not-a-uuid", headers: authed });
    expect(res.statusCode).toBe(400);
    expect(store.deleteMedia).not.toHaveBeenCalled();
  });

  it("maps unavailable interests from the store as a controlled 400", async () => {
    const store = makeStore({ updateInterests: vi.fn(async () => { throw new ProfileValidationError("One or more selected interests are unavailable"); }) });
    const { app } = makeAppForTest(store);
    const res = await app.inject({ method: "PUT", url: "/me/interests", headers: authed, payload: { interests: [{ interestId: INTEREST_ID, strength: 2 }] } });
    expect(res.statusCode).toBe(400);
    expect(json(res).error).toBe("validation");
  });

});
