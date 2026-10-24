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
    const policies = await db.query<{ guards: string; storage: string; unsafe: string }>(`select
      count(*) filter (where schemaname = 'public' and tablename in ('profiles','user_interests','prompt_answers','profile_media','conversations','conversation_members','messages','reports') and policyname = 'app_active_session' and permissive = 'RESTRICTIVE')::text as guards,
      count(*) filter (where schemaname = 'storage' and tablename = 'objects' and policyname = 'app_active_storage_session' and permissive = 'RESTRICTIVE')::text as storage,
      count(*) filter (where schemaname = 'public' and policyname in ('profiles_self_insert','profiles_self_update','reports_reporter_insert','reports_admin_update'))::text as unsafe
      from pg_policies`);
    if (policies.rows[0]?.guards !== "8" || policies.rows[0]?.storage !== "1" || policies.rows[0]?.unsafe !== "0") throw new Error("Pilot security policies are incomplete or older permissive policies were restored");
  };
}
