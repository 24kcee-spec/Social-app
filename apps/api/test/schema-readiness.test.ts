import { describe, expect, it, vi } from "vitest";
import { createSchemaReadinessCheck } from "../src/schema-readiness";
import type { SqlRunner } from "../src/migrate";

const check = (applied: string[], security = true) => createSchemaReadinessCheck({ query: vi.fn(async (sql: string) => ({ rows: sql.includes("schema_migrations") ? applied.map((name) => ({ name })) : [{ present: security }] })) } as unknown as SqlRunner, ["0001_base.sql", "0002_next.sql"]);
describe("release schema readiness", () => {
  it("requires the complete matching migration ledger and pilot security", async () => {
    await expect(check(["0001_base.sql"])()).rejects.toThrow("migration ledger");
    await expect(check(["0002_next.sql"])()).rejects.toThrow("migration ledger");
    await expect(check(["0001_base.sql", "0002_next.sql", "9999_other.sql"])()).rejects.toThrow("migration ledger");
    await expect(check(["0001_base.sql", "0002_next.sql"], false)()).rejects.toThrow("security SQL");
    await expect(check(["0001_base.sql", "0002_next.sql"])()).resolves.toBeUndefined();
  });
});
