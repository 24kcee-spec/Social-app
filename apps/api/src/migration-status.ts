export interface MigrationLedgerStatus {
  pending: string[];
  unknownApplied: string[];
  outOfOrder: boolean;
}

/**
 * Compares the ordered migration files in this checkout with the read-only
 * schema_migrations ledger from the target database.
 */
export function compareMigrationLedger(
  availableFiles: string[],
  appliedFiles: string[],
): MigrationLedgerStatus {
  const available = [...new Set(availableFiles)].sort();
  const availableSet = new Set(available);
  const applied = new Set(appliedFiles);
  const unknownApplied = [...applied].filter((name) => !availableSet.has(name)).sort();
  const appliedKnown = available.filter((name) => applied.has(name));
  const expectedPrefix = available.slice(0, appliedKnown.length);

  return {
    pending: available.filter((name) => !applied.has(name)),
    unknownApplied,
    outOfOrder: appliedKnown.some((name, index) => name !== expectedPrefix[index]),
  };
}
