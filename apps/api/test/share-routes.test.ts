import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import { registerShare } from "../src/share/plugin";
import { ShareError, type ShareStore } from "../src/share/store";

const VALID_ID = "11111111-2222-3333-4444-555555555555";
const PRIVATE_ID = "22222222-2222-3333-4444-555555555555";
const MISSING_ID = "33333333-2222-3333-4444-555555555555";

function makeStore(over: Partial<ShareStore> = {}): ShareStore {
  return {
    getGroupPreview: vi.fn(async (id: string, origin = "https://social-app.local") => {
      if (id === MISSING_ID) throw new ShareError("not_found", "Group not found or no longer active");
      return {
        id,
        name: "Campus Tech Club",
        description: "Student builders",
        generalArea: "Main Library",
        memberCount: 15,
        capacity: 30,
        activities: ["Coding", "Robotics"],
        isPrivate: false,
        shareUrl: `${origin}/share/group/${id}`,
        deepLink: `socialapp://group/${id}`,
      };
    }),
    getEventPreview: vi.fn(async (id: string, origin = "https://social-app.local") => {
      if (id === MISSING_ID) throw new ShareError("not_found", "Event not found or host account inactive");
      return {
        id,
        groupId: VALID_ID,
        groupName: "Campus Tech Club",
        title: "Hackathon Night",
        description: "Building open source tools",
        generalArea: "Lab 3",
        startsAt: "2026-10-20T18:00:00.000Z",
        endsAt: "2026-10-20T21:00:00.000Z",
        capacity: 20,
        attendeeCount: 12,
        spotsLeft: 8,
        isFull: false,
        shareUrl: `${origin}/share/event/${id}`,
        deepLink: `socialapp://event/${id}`,
      };
    }),
    getProfilePreview: vi.fn(async (id: string, origin = "https://social-app.local") => {
      if (id === MISSING_ID) throw new ShareError("not_found", "Profile not found");
      if (id === PRIVATE_ID) throw new ShareError("private", "This user has disabled public discovery");
      return {
        id,
        displayName: "Sasha",
        bio: "Exploring creative tech",
        interests: ["Design", "Music"],
        verificationLevel: "student_verified",
        shareUrl: `${origin}/share/profile/${id}`,
        deepLink: `socialapp://profile/${id}`,
      };
    }),
    ...over,
  };
}

function makeApp(store = makeStore(), defaultOrigin?: string) {
  const app = buildApp();
  registerShare(app, { store, defaultOrigin });
  return { app, store };
}

describe("Phase 10: Share Routes & Previews", () => {
  describe("GET /share/groups/:id", () => {
    it("returns public group preview without requiring authentication", async () => {
      const { app } = makeApp();
      const res = await app.inject({ method: "GET", url: `/share/groups/${VALID_ID}` });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.preview.name).toBe("Campus Tech Club");
      expect(data.preview.deepLink).toBe(`socialapp://group/${VALID_ID}`);
      expect(res.headers["cache-control"]).toContain("public, max-age=60");
    });

    it("rejects invalid UUIDs with 400 bad_request", async () => {
      const { app } = makeApp();
      const res = await app.inject({ method: "GET", url: "/share/groups/not-a-uuid" });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("bad_request");
    });

    it("returns 404 when group is missing", async () => {
      const { app } = makeApp();
      const res = await app.inject({ method: "GET", url: `/share/groups/${MISSING_ID}` });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("not_found");
    });
  });

  describe("GET /share/events/:id", () => {
    it("returns public event preview with spotsLeft and capacity", async () => {
      const { app } = makeApp();
      const res = await app.inject({ method: "GET", url: `/share/events/${VALID_ID}` });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.preview.title).toBe("Hackathon Night");
      expect(data.preview.spotsLeft).toBe(8);
      expect(data.preview.isFull).toBe(false);
      expect(data.preview.deepLink).toBe(`socialapp://event/${VALID_ID}`);
    });

    it("returns 404 when event is missing", async () => {
      const { app } = makeApp();
      const res = await app.inject({ method: "GET", url: `/share/events/${MISSING_ID}` });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("GET /share/profiles/:id", () => {
    it("returns profile preview for discoverable profile", async () => {
      const { app } = makeApp();
      const res = await app.inject({ method: "GET", url: `/share/profiles/${VALID_ID}` });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.preview.displayName).toBe("Sasha");
      expect(data.preview.interests).toContain("Design");
      expect(data.preview.deepLink).toBe(`socialapp://profile/${VALID_ID}`);
    });

    it("enforces privacy: returns 403 private when user disabled discovery", async () => {
      const { app } = makeApp();
      const res = await app.inject({ method: "GET", url: `/share/profiles/${PRIVATE_ID}` });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("private");
    });

    it("returns 404 for unknown profile", async () => {
      const { app } = makeApp();
      const res = await app.inject({ method: "GET", url: `/share/profiles/${MISSING_ID}` });
      expect(res.statusCode).toBe(404);
    });
  });
});
