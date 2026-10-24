#!/usr/bin/env python3
"""Scoped HTTPS database maintenance; credentials are read only from the environment.

Default: inspect. Writes require an explicit operation flag. Run from any directory.
"""
import argparse
import json
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Supabase:
    def __init__(self):
        hostname = urllib.parse.urlsplit(os.environ.get("SUPABASE_URL", "")).hostname or ""
        match = re.fullmatch(r"([a-z0-9]{20})\.supabase\.co", hostname)
        if not match:
            raise RuntimeError("SUPABASE_URL must identify the intended Supabase project")
        self.project = match.group(1)
        self.token = os.environ.get("SUPABASE_ACCESS_TOKEN")
        if not self.token:
            raise RuntimeError("SUPABASE_ACCESS_TOKEN is missing; use the secure environment binding")
        self.opener = urllib.request.build_opener(NoRedirect())

    def request(self, path, method="GET", body=None):
        request = urllib.request.Request(
            f"https://api.supabase.com/v1/projects/{self.project}{path}",
            data=None if body is None else json.dumps(body).encode(), method=method,
            headers={"Authorization": "Bearer " + self.token, "Content-Type": "application/json"},
        )
        try:
            with self.opener.open(request, timeout=55) as response:
                raw = response.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:
            raise RuntimeError(f"Supabase Management HTTP {error.code}; inspect state before retrying a write") from None
        except (urllib.error.URLError, TimeoutError):
            raise RuntimeError("Supabase Management transport failed; inspect state before retrying a write") from None

    def sql(self, query, read_only=True):
        return self.request("/database/query", "POST", {"query": query, "read_only": read_only})

    def ledger(self):
        return [row["name"] for row in self.sql("select name from public.schema_migrations order by name")]

    def local_files(self):
        files = sorted((ROOT / "apps/api/migrations").glob("*.sql"))
        if any(not re.fullmatch(r"[0-9]{4}_[a-z0-9_]+\.sql", file.name) for file in files):
            raise RuntimeError("Invalid local migration filename")
        return files

    def apply(self):
        files, applied = self.local_files(), self.ledger()
        names = [file.name for file in files]
        if applied != names[:len(applied)]:
            raise RuntimeError("Live ledger is not an exact prefix of local migrations; refusing to guess")
        for file in files[len(applied):]:
            query = (
                "begin; set local lock_timeout='5s'; set local statement_timeout='40s'; "
                "select pg_advisory_xact_lock(hashtext('sidle_schema_migrations'));\n"
                + file.read_text(encoding="utf-8-sig")
                + f"\ninsert into public.schema_migrations(name) values ('{file.name}'); commit;"
            )
            self.sql(query, False)
            if file.name not in self.ledger():
                raise RuntimeError("Migration persistence could not be verified")
            print("Applied and verified:", file.name)
        if not files[len(applied):]:
            print("No pending numbered migrations")

    def security(self):
        self.sql("begin; set local lock_timeout='5s'; set local statement_timeout='40s';\n"
                 + (ROOT / "docs/supabase-pilot-security.sql").read_text()
                 + "\ncommit;", False)
        print("Applied final pilot security SQL")

    def verify_rls(self):
        result = self.sql((ROOT / "scripts/verify-supabase-rls.sql").read_text(), False)
        if not any(str(row.get("result", "")).startswith("PASS:") for row in result):
            raise RuntimeError("Live RLS checks did not return a verified result")
        print(result[0]["result"])

    def status(self):
        names, applied = [file.name for file in self.local_files()], self.ledger()
        pending = [name for name in names if name not in applied]
        unknown = [name for name in applied if name not in names]
        security = self.sql("""select
          (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity) as public_tables_without_rls,
          (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef) as public_privileged_rpcs,
          (select count(*) from pg_policies where schemaname='public' and policyname='app_active_session' and permissive='RESTRICTIVE') as active_session_guards""")[0]
        auth = self.request("/config/auth")
        ssl = self.request("/ssl-enforcement")
        advisors = {}
        for category in ("security", "performance"):
            lints = self.request("/advisors/" + category).get("lints", [])
            advisors[category] = [{"name": lint.get("name"), "level": lint.get("level")} for lint in lints if lint.get("level") in ("ERROR", "WARN")]
        queue = self.sql("select count(*) filter(where completed_at is null) as pending, count(*) filter(where completed_at is null and created_at < now() - interval '15 minutes') as overdue, count(*) filter(where completed_at is not null) as completed from public.account_cleanup_jobs")[0]
        schedule = []
        if self.sql("select to_regclass('cron.job') is not null as installed")[0]["installed"]:
            schedule = self.sql("select jobname,schedule,active from cron.job where jobname='sidle-account-cleanup'")
        print(json.dumps({"project": self.project, "applied_migrations": len(applied), "pending": pending, "unknown": unknown,
                          "database": security, "ssl_enforced": ssl.get("currentConfig", {}).get("database"),
                          "email_confirmation_required": not auth.get("mailer_autoconfirm", True),
                          "custom_smtp_configured": bool(auth.get("smtp_host")), "cleanup_queue": queue, "cleanup_schedule": schedule, "advisors": advisors}, indent=2))
        if pending or unknown or applied != names or security["public_tables_without_rls"] or security["public_privileged_rpcs"] or security["active_session_guards"] != 8:
            raise RuntimeError("Database release/security checks failed")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Apply ALL pending numbered migrations after reviewing them")
    parser.add_argument("--security", action="store_true", help="Apply the final pilot security SQL after earlier security scripts")
    parser.add_argument("--verify-rls", action="store_true", help="Run live rollback-only security probes")
    args = parser.parse_args()
    try:
        client = Supabase()
        if args.apply:
            client.apply()
        if args.security:
            client.security()
        if args.verify_rls:
            client.verify_rls()
        client.status()
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
