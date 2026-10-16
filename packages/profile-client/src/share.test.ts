import { describe, expect, it } from "vitest";
import {
  buildDeepLink,
  buildShareUrl,
  createShareClient,
  parseShareUrl,
  validateSafeRedirect,
} from "./share";

describe("Phase 10: Sharing & Deep Linking", () => {
  const TEST_UUID = "11111111-2222-3333-4444-555555555555";

  describe("Deep Link & Web Link Parsing", () => {
    it("parses custom scheme deep links correctly", () => {
      expect(parseShareUrl(`socialapp://group/${TEST_UUID}`)).toEqual({
        targetType: "group",
        id: TEST_UUID,
      });

      expect(parseShareUrl(`socialapp://event/${TEST_UUID}`)).toEqual({
        targetType: "event",
        id: TEST_UUID,
      });

      expect(parseShareUrl(`socialapp://profile/${TEST_UUID}`)).toEqual({
        targetType: "profile",
        id: TEST_UUID,
      });
    });

    it("parses web share URLs correctly", () => {
      expect(parseShareUrl(`https://social-app.local/share/group/${TEST_UUID}`)).toEqual({
        targetType: "group",
        id: TEST_UUID,
      });

      expect(parseShareUrl(`/share/event/${TEST_UUID}`)).toEqual({
        targetType: "event",
        id: TEST_UUID,
      });
    });

    it("rejects malformed or invalid URLs", () => {
      expect(parseShareUrl("")).toBeNull();
      expect(parseShareUrl("invalid://foo")).toBeNull();
      expect(parseShareUrl("socialapp://message/123")).toBeNull(); // messages cannot be publicly shared
      expect(parseShareUrl("socialapp://group/not-a-uuid")).toBeNull();
      expect(parseShareUrl("https://malicious.site/not-share")).toBeNull();
    });
  });

  describe("Link Builders", () => {
    it("builds custom scheme deep links", () => {
      expect(buildDeepLink("group", TEST_UUID)).toBe(`socialapp://group/${TEST_UUID}`);
      expect(buildDeepLink("event", TEST_UUID)).toBe(`socialapp://event/${TEST_UUID}`);
      expect(buildDeepLink("profile", TEST_UUID)).toBe(`socialapp://profile/${TEST_UUID}`);
    });

    it("builds web share URLs with clean origin", () => {
      expect(buildShareUrl("group", TEST_UUID, "https://social.example.com/")).toBe(
        `https://social.example.com/share/group/${TEST_UUID}`
      );
    });
  });

  describe("Open Redirect Protection", () => {
    it("permits safe relative internal paths", () => {
      expect(validateSafeRedirect("/share/event/123")).toBe("/share/event/123");
      expect(validateSafeRedirect("/?tab=community")).toBe("/?tab=community");
      expect(validateSafeRedirect("/discover")).toBe("/discover");
    });

    it("rejects protocol-relative, backslash, external and malformed URLs", () => {
      expect(validateSafeRedirect("//evil.com")).toBeNull();
      expect(validateSafeRedirect("/\\evil.com")).toBeNull();
      expect(validateSafeRedirect("https://evil.com")).toBeNull();
      expect(validateSafeRedirect("javascript:alert(1)")).toBeNull();
      expect(validateSafeRedirect(null)).toBeNull();
      expect(validateSafeRedirect(undefined)).toBeNull();
    });
  });

  describe("Share Client Previews", () => {
    it("fetches preview successfully", async () => {
      const mockFetch = async () =>
        new Response(
          JSON.stringify({
            preview: {
              id: TEST_UUID,
              name: "Hiking Club",
              description: "Weekend hikes",
              generalArea: "North Campus",
              memberCount: 5,
              capacity: 20,
              activities: ["Hiking"],
              isPrivate: false,
              shareUrl: `https://social-app.local/share/group/${TEST_UUID}`,
              deepLink: `socialapp://group/${TEST_UUID}`,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );

      const client = createShareClient({ apiUrl: "http://api.local", fetchImpl: mockFetch as any });
      const preview = await client.getGroupPreview(TEST_UUID);
      expect(preview.name).toBe("Hiking Club");
      expect(preview.id).toBe(TEST_UUID);
    });
  });
});
