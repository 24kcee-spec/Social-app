import { describe, expect, it } from "vitest";
import { activationQuerySchema, interactionSettingsSchema, introSchema, requestBoxSchema, sendRequestSchema, blockRequestSchema, discoveryEventsRequestSchema, discoveryQuerySchema, interestSelectionsRequestSchema, onboardingSchema, profileMediaRegistrationSchema, profileUpdateSchema, promptAnswersRequestSchema } from "./index";

describe("validation", () => {
  it("accepts standard email", async () => { const { emailSchema } = await import("./index"); expect(emailSchema.parse(" A@Example.com ")).toBe("a@example.com"); });
  it("rejects invalid phone", async () => { const { phoneSchema } = await import("./index"); expect(() => phoneSchema.parse("0771234567")).toThrow(); });
  it("requires display name length", () => { expect(() => profileUpdateSchema.parse({ displayName: "A" })).toThrow(); });
  it("accepts complete profile update", () => { expect(profileUpdateSchema.parse({ displayName: "Kay", bio: "Hello", socialStyles: ["low_pressure"], privacy: { discoverable: true, messagePermission: "everyone", storyVisibility: "connections", activityVisibility: "public" } }).displayName).toBe("Kay"); });
  it("rejects duplicate social styles", () => { expect(() => profileUpdateSchema.parse({ socialStyles: ["low_pressure", "low_pressure"] })).toThrow(); });
  it("rejects duplicate interests", () => { expect(() => interestSelectionsRequestSchema.parse({ interests: [{ interestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, { interestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }] })).toThrow(); });
  it("limits interest count", () => { const interests = Array.from({ length: 13 }, (_, i) => ({ interestId: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`, strength: 2 as const })); expect(() => interestSelectionsRequestSchema.parse({ interests })).toThrow(); });
  it("rejects duplicate prompt ids", () => { expect(() => promptAnswersRequestSchema.parse({ answers: [{ promptId: "one", answer: "a good answer" }, { promptId: "one", answer: "another good answer" }] })).toThrow(); });
  it("requires minimum onboarding data", () => { expect(() => onboardingSchema.parse({ displayName: "Kay", bio: "", socialStyles: ["text_first"], privacy: { discoverable: true, messagePermission: "everyone", storyVisibility: "connections", activityVisibility: "public" }, interests: [{ interestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }], answers: [{ promptId: "p1", answer: "Hello there" }] })).toThrow(); });
  it("accepts complete onboarding payload", () => { const r = onboardingSchema.parse({ displayName: "Kay", bio: "Hello", socialStyles: ["text_first", "low_pressure"], privacy: { discoverable: true, messagePermission: "connections", storyVisibility: "connections", activityVisibility: "public" }, interests: [{ interestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, { interestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }, { interestId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }], answers: [{ promptId: "p1", answer: "Something I enjoy" }] }); expect(r.interests).toHaveLength(3); });
  it("rejects unsupported media type", () => { expect(() => profileMediaRegistrationSchema.parse({ kind: "avatar", storagePath: "u/a.jpg", thumbnailPath: "u/a-thumb.jpg", contentType: "image/gif", sizeBytes: 100, width: 100, height: 100, sortOrder: 0 })).toThrow(); });
  it("rejects media over 5MB", () => { expect(() => profileMediaRegistrationSchema.parse({ kind: "avatar", storagePath: "u/a.jpg", thumbnailPath: "u/a-thumb.jpg", contentType: "image/jpeg", sizeBytes: 5 * 1024 * 1024 + 1, width: 100, height: 100, sortOrder: 0 })).toThrow(); });
  it("rejects unsafe storage paths", () => { expect(() => profileMediaRegistrationSchema.parse({ kind: "avatar", storagePath: "../a.jpg", thumbnailPath: "u/a-thumb.jpg", contentType: "image/jpeg", sizeBytes: 100, width: 100, height: 100, sortOrder: 0 })).toThrow(); });
  it("accepts valid media metadata", () => { const r = profileMediaRegistrationSchema.parse({ kind: "avatar", storagePath: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a.jpg", thumbnailPath: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a-thumb.jpg", contentType: "image/jpeg", sizeBytes: 100, width: 1400, height: 1400, sortOrder: 0 }); expect(r.kind).toBe("avatar"); });
  it("accepts all supported visibility values", () => { expect(profileUpdateSchema.parse({ privacy: { discoverable: false, messagePermission: "nobody", storyVisibility: "private", activityVisibility: "public" } }).privacy?.discoverable).toBe(false); });
  it("rejects onboarding without a social style", () => { expect(() => onboardingSchema.parse({ displayName: "Kay", bio: "", socialStyles: [], privacy: { discoverable: true, messagePermission: "everyone", storyVisibility: "connections", activityVisibility: "public" }, interests: [{ interestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, { interestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }, { interestId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }], answers: [{ promptId: "p1", answer: "Something I enjoy" }] })).toThrow(); });
  it("rejects blank prompt answers", () => { expect(() => promptAnswersRequestSchema.parse({ answers: [{ promptId: "p1", answer: " " }] })).toThrow(); });
});

describe("discovery schemas", () => {
  it("coerces and defaults paging, and rejects out-of-range values", () => {
    expect(discoveryQuerySchema.parse({})).toEqual({ limit: 20, offset: 0 });
    expect(discoveryQuerySchema.parse({ limit: "5", offset: "10" })).toEqual({ limit: 5, offset: 10 });
    expect(discoveryQuerySchema.safeParse({ limit: "51" }).success).toBe(false);
    expect(discoveryQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(discoveryQuerySchema.safeParse({ offset: "201" }).success).toBe(false);
    expect(discoveryQuerySchema.safeParse({ limit: "x" }).success).toBe(false);
  });
  it("accepts 1-50 well-formed events and rejects unknown types and bad ids", () => {
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(discoveryEventsRequestSchema.safeParse({ events: [{ candidateId: id, type: "ignore" }] }).success).toBe(true);
    expect(discoveryEventsRequestSchema.safeParse({ events: [] }).success).toBe(false);
    expect(discoveryEventsRequestSchema.safeParse({ events: [{ candidateId: id, type: "like" }] }).success).toBe(false);
    expect(discoveryEventsRequestSchema.safeParse({ events: [{ candidateId: "1", type: "open" }] }).success).toBe(false);
    expect(discoveryEventsRequestSchema.safeParse({ events: Array.from({ length: 51 }, () => ({ candidateId: id, type: "open" })) }).success).toBe(false);
  });
  it("requires a uuid to block", () => {
    expect(blockRequestSchema.safeParse({ userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }).success).toBe(true);
    expect(blockRequestSchema.safeParse({ userId: "me" }).success).toBe(false);
  });
});

describe("connection schemas", () => {
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  it("accepts each structured intro and a trimmed custom note", () => {
    expect(introSchema.safeParse({ kind: "icebreaker", ref: id }).success).toBe(true);
    expect(introSchema.safeParse({ kind: "question", ref: "q_energy" }).success).toBe(true);
    expect(introSchema.safeParse({ kind: "this_or_that", ref: "t_coffee_tea", choice: "a" }).success).toBe(true);
    expect(introSchema.parse({ kind: "custom", text: "  Hello!  " })).toEqual({ kind: "custom", text: "Hello!" });
  });
  it("rejects incomplete or oversized intros", () => {
    expect(introSchema.safeParse({ kind: "this_or_that", ref: "t" }).success).toBe(false);
    expect(introSchema.safeParse({ kind: "icebreaker", ref: "x" }).success).toBe(false);
    expect(introSchema.safeParse({ kind: "custom", text: "a" }).success).toBe(false);
    expect(introSchema.safeParse({ kind: "custom", text: "a".repeat(241) }).success).toBe(false);
    expect(sendRequestSchema.safeParse({ recipientId: "x", intro: { kind: "question", ref: "q" } }).success).toBe(false);
  });
  it("defaults and validates the inbox box, settings and activation window", () => {
    expect(requestBoxSchema.parse({})).toEqual({ box: "incoming" });
    expect(requestBoxSchema.safeParse({ box: "x" }).success).toBe(false);
    expect(interactionSettingsSchema.safeParse({ lowPressureMode: true }).success).toBe(true);
    expect(interactionSettingsSchema.safeParse({ lowPressureMode: "yes" }).success).toBe(false);
    expect(activationQuerySchema.parse({})).toEqual({ sinceDays: 30 });
    expect(activationQuerySchema.safeParse({ sinceDays: "0" }).success).toBe(false);
  });
});
