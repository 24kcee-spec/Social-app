// `pnpm --filter @sp/api run setup-check` - checks your .env + Supabase setup. Never prints secret values.
import { loadApiEnv } from "@sp/config";
import { makePool } from "./db";
import { loadDotEnv } from "./env";

loadDotEnv();
let bad = 0;
const ok = (m: string) => console.log(`  OK    ${m}`);
const fail = (m: string, hint?: string) => { bad++; console.log(`  FAIL  ${m}${hint ? `\n        -> ${hint}` : ""}`); };

let env: ReturnType<typeof loadApiEnv> | undefined;
try { env = loadApiEnv(process.env); ok(".env loaded and valid"); } catch (e) { fail("Environment invalid", (e as Error).message); }

if (env) {
  env.DATABASE_URL ? ok("DATABASE_URL is set") : fail("DATABASE_URL missing", "Add the Supabase Session pooler connection string to .env");
  env.SUPABASE_URL ? ok("SUPABASE_URL is set") : fail("SUPABASE_URL missing");
  env.SUPABASE_PUBLISHABLE_KEY ? ok("SUPABASE_PUBLISHABLE_KEY is set") : fail("SUPABASE_PUBLISHABLE_KEY missing");

  if (env.DATABASE_URL) {
    const pool = makePool(env.DATABASE_URL);
    try {
      await pool.query("select 1");
      ok("Database reachable");
      const t = await pool.query("select to_regclass('public.users') as users, to_regclass('public.user_sessions') as sessions, to_regclass('public.profiles') as profiles, to_regclass('public.interests') as interests, to_regclass('public.user_interests') as user_interests, to_regclass('public.prompt_catalog') as prompt_catalog, to_regclass('public.prompt_answers') as prompt_answers, to_regclass('public.profile_media') as profile_media");
      const row = t.rows[0] as Record<string, unknown> | undefined;
      const phase1 = Boolean(row?.users && row?.sessions);
      const phase2 = Boolean(row?.profiles && row?.interests && row?.user_interests && row?.prompt_catalog && row?.prompt_answers && row?.profile_media);
      phase1 ? ok("Phase 1 migrations applied (users, user_sessions exist)") : fail("Phase 1 tables missing", "Run: pnpm --filter @sp/api run migrate");
      phase2 ? ok("Phase 2 migrations applied (profile tables exist)") : fail("Phase 2 tables missing", "Run: pnpm --filter @sp/api run migrate");
      const d = await pool.query("select to_regclass('public.user_blocks') as blocks, to_regclass('public.discovery_events') as events");
      const phase3 = Boolean(d.rows[0]?.blocks && d.rows[0]?.events);
      phase3 ? ok("Phase 3 migrations applied (user_blocks, discovery_events exist)") : fail("Phase 3 tables missing", "Run: pnpm --filter @sp/api run migrate");
      if (phase3) {
        const rls3 = await pool.query("select relname from pg_class where relnamespace = 'public'::regnamespace and relname in ('user_blocks','discovery_events') and relrowsecurity");
        rls3.rows.length === 2 ? ok("RLS enabled on Phase 3 tables") : fail("RLS is not enabled on Phase 3 tables", "Run docs/supabase-phase3-security.sql in Supabase SQL Editor");
        const st = await pool.query("select to_regclass('storage.objects') as objects");
        if (st.rows[0]?.objects) {
          const pol = await pool.query("select count(*)::int as count from pg_policies where schemaname='storage' and tablename='objects' and policyname='profile_media_discovery_thumb_select'");
          Number(pol.rows[0]?.count) === 1 ? ok("Discovery thumbnail Storage policy is installed") : fail("Discovery thumbnail Storage policy missing (people's photos will be blank in the feed)", "Run docs/supabase-phase3-security.sql in Supabase SQL Editor");
        }
      }
      if (phase2) {
        const [interestCount, promptCount, rls, storageSchema] = await Promise.all([
          pool.query("select count(*)::int as count from interests where active=true"),
          pool.query("select count(*)::int as count from prompt_catalog where active=true"),
          pool.query("select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname = any($1::text[])", [["users","user_roles","user_sessions","profiles","interests","user_interests","prompt_catalog","prompt_answers","profile_media"]]),
          pool.query("select to_regclass('storage.buckets') as storage_buckets"),
        ]);
        Number(interestCount.rows[0]?.count) >= 40 ? ok("Interest catalogue seeded") : fail("Interest catalogue is incomplete", "Run: pnpm --filter @sp/api run migrate");
        Number(promptCount.rows[0]?.count) >= 6 ? ok("Prompt catalogue seeded") : fail("Prompt catalogue is incomplete", "Run: pnpm --filter @sp/api run migrate");
        const expectedRls = new Set(["users","user_roles","user_sessions","profiles","interests","user_interests","prompt_catalog","prompt_answers","profile_media"]);
        const secured = new Set(rls.rows.filter((r) => Boolean(r.relrowsecurity)).map((r) => String(r.relname)));
        [...expectedRls].every((name) => secured.has(name)) ? ok("RLS enabled on Phase 1 + Phase 2 tables") : fail("RLS is not enabled on all profile/identity tables", "Run docs/supabase-phase2-security.sql in Supabase SQL Editor");
        if (storageSchema.rows[0]?.storage_buckets) {
          const bucket = await pool.query("select id, public, file_size_limit from storage.buckets where id='profile-media'");
          bucket.rows[0]?.id === "profile-media" && bucket.rows[0]?.public === false && Number(bucket.rows[0]?.file_size_limit) <= 5242880 ? ok("Private profile-media Storage bucket is ready") : fail("profile-media Storage bucket is missing or unsafe", "Run docs/supabase-phase2-security.sql in Supabase SQL Editor");
          const policies = await pool.query("select count(*)::int as count from pg_policies where schemaname='storage' and tablename='objects' and policyname in ('profile_media_storage_insert','profile_media_storage_select','profile_media_storage_update','profile_media_storage_delete')");
          Number(policies.rows[0]?.count) === 4 ? ok("Profile-media Storage policies are installed") : fail("Profile-media Storage policies are incomplete", "Run docs/supabase-phase2-security.sql in Supabase SQL Editor");
        } else {
          fail("Supabase Storage schema is unavailable", "Use a Supabase Postgres project and run docs/supabase-phase2-security.sql");
        }
      }
    } catch (e) {
      fail(`Database connection failed: ${(e as Error).message.replace(/:\/\/[^@\s]*@/g, "://***@")}`, "Use the Session pooler string (IPv4) and make sure the password has no special characters");
    } finally { await pool.end(); }
  }

  if (env.SUPABASE_URL) {
    const base = env.SUPABASE_URL.replace(/\/+$/, "");
    try {
      const r = await fetch(`${base}/auth/v1/.well-known/jwks.json`);
      const j = (await r.json()) as { keys?: unknown[] };
      r.ok && j.keys?.length ? ok(`JWT signing: asymmetric (${j.keys.length} public key(s)) - tokens verified locally`) : ok("JWT signing: legacy HS256 - tokens verified via Auth server (needs SUPABASE_PUBLISHABLE_KEY)");
    } catch { fail("Could not reach SUPABASE_URL", "Check the Project URL (https://<ref>.supabase.co)"); }
    if (env.SUPABASE_PUBLISHABLE_KEY) {
      try {
        const r = await fetch(`${base}/auth/v1/settings`, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY } });
        r.ok ? ok("Publishable key accepted by Supabase Auth") : fail(`Supabase Auth rejected the publishable key (HTTP ${r.status})`, "Copy it again from Project Settings > API Keys");
      } catch { fail("Could not call Supabase Auth settings"); }
    }
  }
}
console.log(bad ? `\n${bad} problem(s) found.` : "\nAll checks passed.");
process.exitCode = bad ? 1 : 0;
