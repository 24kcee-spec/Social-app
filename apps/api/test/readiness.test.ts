import { describe, expect, it } from "vitest";
import { createApiConfigurationCheck } from "../src/readiness";

const validConfig = {
  DATABASE_URL: "postgresql://localhost:5432/social",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
};

describe("API configuration readiness", () => {
  it("passes when all required API settings are present", async () => {
    await expect(createApiConfigurationCheck(validConfig)()).resolves.toBeUndefined();
  });

  it("fails when the database URL is missing", async () => {
    await expect(createApiConfigurationCheck({ ...validConfig, DATABASE_URL: undefined })()).rejects.toThrow(/DATABASE_URL/);
  });

  it("fails when the Supabase URL is missing", async () => {
    await expect(createApiConfigurationCheck({ ...validConfig, SUPABASE_URL: undefined })()).rejects.toThrow(/SUPABASE_URL/);
  });

  it("fails when the Supabase publishable key is missing", async () => {
    await expect(createApiConfigurationCheck({ ...validConfig, SUPABASE_PUBLISHABLE_KEY: undefined })()).rejects.toThrow(/SUPABASE_PUBLISHABLE_KEY/);
  });
});
