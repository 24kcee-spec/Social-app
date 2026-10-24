import { describe, expect, it } from "vitest";
import { poolConfig } from "../src/db";
import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";

describe("poolConfig", () => {
  it("ships the authentic, currently valid Supabase root certificate", () => {
    const certificate = new X509Certificate(readFileSync(new URL('../certs/supabase-root-ca.crt', import.meta.url)));
    expect(certificate.fingerprint256).toBe('80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA');
    expect(certificate.ca).toBe(true);
    expect(certificate.verify(certificate.publicKey)).toBe(true);
    expect(Date.parse(certificate.validTo)).toBeGreaterThan(Date.now());
  });
  it("uses no TLS for local databases", () => {
    expect(poolConfig("postgresql://u:p@localhost:5432/db").ssl).toBeUndefined();
  });
  it("uses TLS for remote databases and strips sslmode from the URL", () => {
    const c = poolConfig("postgresql://u:p@aws-0-eu.pooler.supabase.com:5432/postgres?sslmode=require");
    expect(c.ssl).toMatchObject({ rejectUnauthorized: true, ca: expect.any(Array) });
    expect(c.connectionString).not.toContain("sslmode");
  });
  it("adds the official provider root only for genuine Supabase hosts", () => {
    expect(poolConfig("postgresql://u:p@db.example.com/db").ssl).toEqual({ rejectUnauthorized: true });
    expect(poolConfig("postgresql://u:p@db.test.supabase.co.attacker.example/db").ssl).toEqual({ rejectUnauthorized: true });
    expect(poolConfig("postgresql://u:p@db.test.supabase.co/db", "custom CA").ssl).toEqual({ rejectUnauthorized: true, ca: "custom CA" });
  });
  it("cannot disable verification or substitute trust settings in the URL", () => {
    const c = poolConfig("postgresql://u:p@db.example.com/db?sslmode=no-verify&sslrootcert=untrusted.pem&ssl=false&sslcert=x&sslkey=y", "provider CA");
    expect(c.ssl).toEqual({ rejectUnauthorized: true, ca: "provider CA" });
    expect(new URL(c.connectionString!).search).toBe("");
  });
});
