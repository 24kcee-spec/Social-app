import { describe, expect, it } from "vitest";
import { createApiConfigurationCheck } from "../src/readiness";

const validConfig = {
  DATABASE_URL: "postgresql://localhost:5432/social",
  SUPABASE_URL: "https://example.supabase.co",
};

describe("API configuration readiness", () => {
  it("passes when database and Supabase URLs are configured", async () => {
    await expect(createApiConfigurationCheck(validConfig)()).resolves.toBeUndefined();
  });

  it("fails when the database URL is missing", async () => {
    await expect(createApiConfigurationCheck({ ...validConfig, DATABASE_URL: undefined })()).rejects.toThrow(/DATABASE_URL/);
  });

  it("fails when the Supabase URL is missing", async () => {
    await expect(createApiConfigurationCheck({ ...validConfig, SUPABASE_URL: undefined })()).rejects.toThrow(/SUPABASE_URL/);
  });

  it("does not require a publishable key for asymmetric JWT verification", async () => {
    await expect(createApiConfigurationCheck(validConfig)()).resolves.toBeUndefined();
  });
});
