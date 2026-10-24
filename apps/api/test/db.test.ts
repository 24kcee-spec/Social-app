import { describe, expect, it } from "vitest";
import { poolConfig } from "../src/db";

describe("poolConfig", () => {
  it("uses no TLS for local databases", () => {
    expect(poolConfig("postgresql://u:p@localhost:5432/db").ssl).toBeUndefined();
  });
  it("uses TLS for remote databases and strips sslmode from the URL", () => {
    const c = poolConfig("postgresql://u:p@aws-0-eu.pooler.supabase.com:5432/postgres?sslmode=require");
    expect(c.ssl).toEqual({ rejectUnauthorized: true });
    expect(c.connectionString).not.toContain("sslmode");
  });
  it("cannot disable verification or substitute trust settings in the URL", () => {
    const c = poolConfig("postgresql://u:p@db.example.com/db?sslmode=no-verify&sslrootcert=untrusted.pem&ssl=false&sslcert=x&sslkey=y", "provider CA");
    expect(c.ssl).toEqual({ rejectUnauthorized: true, ca: "provider CA" });
    expect(new URL(c.connectionString!).search).toBe("");
  });
});
