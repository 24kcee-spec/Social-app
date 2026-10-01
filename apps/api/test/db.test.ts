import { describe, expect, it } from "vitest";
import { poolConfig } from "../src/db";

describe("poolConfig", () => {
  it("uses no TLS for local databases", () => {
    expect(poolConfig("postgresql://u:p@localhost:5432/db").ssl).toBeUndefined();
  });
  it("uses TLS for remote databases and strips sslmode from the URL", () => {
    const c = poolConfig("postgresql://u:p@aws-0-eu.pooler.supabase.com:5432/postgres?sslmode=require");
    expect(c.ssl).toEqual({ rejectUnauthorized: false });
    expect(c.connectionString).not.toContain("sslmode");
  });
});
