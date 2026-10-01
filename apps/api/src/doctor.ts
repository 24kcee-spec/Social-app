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
      const t = await pool.query("select to_regclass('public.users') as users, to_regclass('public.user_sessions') as sessions");
      t.rows[0]?.users && t.rows[0]?.sessions ? ok("Migrations applied (users, user_sessions exist)") : fail("Tables missing", "Run: pnpm --filter @sp/api run migrate");
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
