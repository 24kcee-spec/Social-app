import { describe, expect, it } from "vitest";
import { compareMigrationLedger } from "../src/migration-status";

describe("migration ledger status", () => {
  it("reports pending migration files in filename order", () => {
    expect(
      compareMigrationLedger(
        ["0002_profiles.sql", "0001_users.sql", "0003_community.sql"],
        ["0001_users.sql"],
      ),
    ).toEqual({
      pending: ["0002_profiles.sql", "0003_community.sql"],
      unknownApplied: [],
      outOfOrder: false,
    });
  });

  it("detects an applied migration after a missing earlier migration", () => {
    expect(
      compareMigrationLedger(
        ["0001_users.sql", "0002_profiles.sql", "0003_community.sql"],
        ["0001_users.sql", "0003_community.sql"],
      ),
    ).toEqual({
      pending: ["0002_profiles.sql"],
      unknownApplied: [],
      outOfOrder: true,
    });
  });

  it("reports ledger entries with no corresponding migration file", () => {
    expect(
      compareMigrationLedger(
        ["0001_users.sql"],
        ["0001_users.sql", "0000_legacy.sql"],
      ),
    ).toEqual({
      pending: [],
      unknownApplied: ["0000_legacy.sql"],
      outOfOrder: false,
    });
  });

  it("accepts an up-to-date ordered migration ledger", () => {
    expect(
      compareMigrationLedger(
        ["0001_users.sql", "0002_profiles.sql"],
        ["0001_users.sql", "0002_profiles.sql"],
      ),
    ).toEqual({ pending: [], unknownApplied: [], outOfOrder: false });
  });
});
