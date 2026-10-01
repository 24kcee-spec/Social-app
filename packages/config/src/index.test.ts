import { describe, expect, it } from "vitest";
import { loadApiEnv } from "./index";

describe("loadApiEnv", () => {
  it("applies local defaults", () => {
    const env = loadApiEnv({});
    expect(env).toMatchObject({ APP_ENV: "local", PORT: 4000 });
    expect(env.DATABASE_URL).toBeUndefined();
  });
  it("treats empty strings (from .env.example) as unset", () => {
    expect(loadApiEnv({ PORT: "", DATABASE_URL: "" }).PORT).toBe(4000);
  });
  it("requires DATABASE_URL outside local", () => {
    expect(() => loadApiEnv({ APP_ENV: "production" })).toThrow(/DATABASE_URL/);
  });
  it("requires SUPABASE_URL outside local and validates it is a URL", () => {
    expect(() => loadApiEnv({ APP_ENV: "staging", DATABASE_URL: "x" })).toThrow(/SUPABASE_URL/);
    expect(() => loadApiEnv({ SUPABASE_URL: "not-a-url" })).toThrow(/SUPABASE_URL/);
    expect(loadApiEnv({ SUPABASE_URL: "https://abc.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x" }).SUPABASE_URL).toBe("https://abc.supabase.co");
  });
  it("rejects bad ports and unknown environments", () => {
    expect(() => loadApiEnv({ PORT: "99999" })).toThrow(/PORT/);
    expect(() => loadApiEnv({ APP_ENV: "prod" })).toThrow(/APP_ENV/);
  });
  it("does not leak secret values in errors", () => {
    expect(() => loadApiEnv({ APP_ENV: "staging", PORT: "secret-value-123" })).not.toThrow(/secret-value-123/);
  });
});
