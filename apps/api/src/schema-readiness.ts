import type { SqlRunner } from "./migrate";
import { compareMigrationLedger } from "./migration-status";

export function createSchemaReadinessCheck(db: Pick<SqlRunner, "query">, migrationNames: string[]) {
  return async () => {
    const { rows } = await db.query<{ name: string }>("select name from schema_migrations order by name");
    const status = compareMigrationLedger(migrationNames, rows.map((r) => r.name));
    if (status.pending.length || status.unknownApplied.length || status.outOfOrder) {
      throw new Error("Database migration ledger does not match this API release; run setup-check and review migrations");
    }
    const security = await db.query<{ present: boolean }>("select to_regprocedure('public.has_active_app_session()') is not null as present");
    if (!security.rows[0]?.present) throw new Error("Pilot security SQL has not been applied");
  };
}
