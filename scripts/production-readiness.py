#!/usr/bin/env python3
"""Read-only production audit. A green deployment does not close external launch gates.

Exit 0: selected gates pass; 1: a deployed service/security check failed;
2: infrastructure passes but external production evidence/configuration is missing.
No provider bodies, user data, SMTP identities or credentials are printed.
"""
import argparse
import hashlib
from datetime import datetime, timedelta, timezone
import importlib.util
import json
from pathlib import Path
import sys
import urllib.parse
import urllib.request


def origin(value):
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
        raise ValueError("Production service URLs must be HTTPS origins without credentials, paths or queries")
    return value.rstrip("/")


def check(name, passed, detail, scope="core", blocked=False):
    return {"name": name, "scope": scope, "status": "pass" if passed else "blocked" if blocked else "fail", "detail": detail}


def timestamp(value):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo is not None else None
    except (AttributeError, TypeError, ValueError):
        return None


def provider_checks(auth, ssl, backups, web_url, now):
    allowlist = {item.strip().rstrip("/") for item in auth.get("uri_allow_list", "").split(",")}
    fresh = lambda value: value is not None and now - timedelta(hours=48) <= value <= now
    completed = any(row.get("status") == "COMPLETED" and fresh(timestamp(row.get("inserted_at"))) for row in backups.get("backups", []))
    physical = backups.get("physical_backup_data") or {}
    try:
        latest = datetime.fromtimestamp(physical["latest_physical_backup_date_unix"], timezone.utc)
        earliest = datetime.fromtimestamp(physical["earliest_physical_backup_date_unix"], timezone.utc)
        completed = completed or (backups.get("walg_enabled") is True and earliest <= latest and fresh(latest))
    except (KeyError, TypeError, ValueError, OverflowError, OSError):
        pass
    return [
        check("email_confirmation", auth.get("mailer_autoconfirm") is False, "Email confirmation must stay enabled."),
        check("password_baseline", auth.get("password_min_length", 0) >= 8 and auth.get("security_update_password_require_reauthentication") is True, "Password minimum and reauthentication are enforced."),
        check("auth_redirects", str(auth.get("site_url", "")).rstrip("/") == web_url and bool({web_url, web_url + "/**"} & allowlist), "Auth site and return origins match the deployed web app."),
        check("database_tls", ssl.get("currentConfig", {}).get("database") is True, "Provider database SSL enforcement is enabled."),
        check("custom_smtp", all(auth.get(name) for name in ("smtp_host", "smtp_user", "smtp_port", "smtp_admin_email", "smtp_sender_name")), "Verified sender and provider SMTP bindings are required.", "email", True),
        check("leaked_password_protection", auth.get("password_hibp_enabled") is True, "Supabase protection requires provider-plan support.", "recovery", True),
        check("recent_recoverable_backup", completed, "A completed backup or provider-reported physical recovery window must be at most 48 hours old; PITR/WAL flags alone are insufficient.", "recovery", True),
    ]


def evidence_checks(evidence, project, web_url, now):
    # This is an operator attestation with a reviewable report, not an automated
    # proof of inbox/device/restore behavior. Never infer it from unit tests.
    bound = isinstance(evidence, dict) and evidence.get("project") == project and evidence.get("web_origin") == web_url
    checks = []
    for name, scope in [("email_delivery", "email"), ("isolated_restore_drill", "recovery"), ("physical_android", "device")]:
        entry = evidence.get(name, {}) if bound else {}
        when = timestamp(entry.get("verified_at")) if isinstance(entry, dict) else None
        passed = bool(when and now - timedelta(days=30) <= when <= now and entry.get("status") == "passed" and isinstance(entry.get("report"), str) and entry["report"].strip())
        checks.append(check(name, passed, "A dated operator report for this project/origin is required (maximum age 30 days).", scope, True))
    return checks


def exit_code(checks):
    return 1 if any(row["status"] == "fail" for row in checks) else 2 if any(row["status"] == "blocked" for row in checks) else 0


def http_check(opener, url, headers=None):
    request = urllib.request.Request(url, headers=headers or {})
    with opener.open(request, timeout=45) as response:
        return response.status, response.headers, response.read(2_000_000)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--web-url", default="https://social-platform-web-two.vercel.app")
    parser.add_argument("--api-url", default="https://social-app-bh1h.onrender.com")
    parser.add_argument("--scope", choices=["core", "all"], default="all")
    parser.add_argument("--evidence", type=Path, help="Reviewed operator attestations; see docs/production-release.md")
    args = parser.parse_args()
    checks = []
    try:
        web, api = origin(args.web_url), origin(args.api_url)
        now = datetime.now(timezone.utc)
        spec = importlib.util.spec_from_file_location("maintenance", Path(__file__).with_name("supabase-maintenance.py"))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        client = module.Supabase()
        auth, ssl, backups = client.request("/config/auth"), client.request("/ssl-enforcement"), client.request("/database/backups")
        checks.extend(provider_checks(auth, ssl, backups, web, now))
        names = [file.name for file in client.local_files()]
        checks.append(check("migration_ledger", client.ledger() == names, "Live migrations exactly match this checkout, in order."))
        product_files = sorted((Path(__file__).resolve().parents[1] / 'supabase/migrations').glob('*.sql'))
        product_ledger = client.sql('select name,sha256 from app_private.product_migrations order by name')
        expected = [{'name': file.name, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()} for file in product_files]
        checks.append(check('product_migration_ledger', product_ledger == expected, 'Independent product migration names and checksums match this release.'))
        state = client.sql("""select
          (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity) as no_rls,
          (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef) as privileged,
          (select count(*) from pg_policies where schemaname='public' and policyname='app_active_session' and permissive='RESTRICTIVE') as guards,
          (select count(*) from public.account_cleanup_jobs where completed_at is null and created_at < now()-interval '15 minutes') as overdue""")[0]
        checks.append(check("database_security", state["no_rls"] == 0 and state["privileged"] == 0 and state["guards"] == 8, "RLS, private helpers and session guards are installed."))
        scheduled = client.sql("select to_regclass('cron.job') is not null as installed")[0]["installed"]
        jobs = client.sql("select active,schedule from cron.job where jobname='sidle-account-cleanup'") if scheduled else []
        checks.append(check("cleanup_schedule", len(jobs) == 1 and jobs[0]["active"] is True and jobs[0]["schedule"] == "* * * * *" and state["overdue"] == 0, "Cleanup is scheduled and has no jobs overdue by 15 minutes."))
        for category in ("security", "performance"):
            lints = client.request("/advisors/" + category).get("lints", [])
            failures = [row for row in lints if row.get("level") in ("WARN", "ERROR") and row.get("name") != "auth_leaked_password_protection"]
            checks.append(check(category + "_advisor", not failures, "No unhandled provider advisor warnings/errors."))
        for name, url in [("api_readiness", api + "/ready"), ("web_deployment", web)]:
            try:
                status, headers, body = http_check(client.opener, url, {"Origin": web})
                passed = status == 200
                if name == "api_readiness":
                    data = json.loads(body)
                    passed = passed and data.get("status") == "ready" and all(data.get("checks", {}).get(key) == "ok" for key in ("configuration", "database", "schema")) and headers.get("Access-Control-Allow-Origin") == web
                else:
                    passed = passed and "text/html" in headers.get("Content-Type", "") and b"Sidle" in body and headers.get("X-Content-Type-Options") == "nosniff" and headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
                checks.append(check(name, passed, "HTTPS deployment, readiness/CORS or web security headers match."))
            except Exception:
                checks.append(check(name, False, "Service transport, response or required configuration failed; response contents withheld."))
        evidence = json.loads(args.evidence.read_text()) if args.evidence else {}
        checks.extend(evidence_checks(evidence, client.project, web, now))
        selected = [row for row in checks if args.scope == "all" or row["scope"] == "core"]
        print(json.dumps({"project": client.project, "scope": args.scope, "checks": selected, "result": "pass" if exit_code(selected) == 0 else "fail" if exit_code(selected) == 1 else "blocked"}, indent=2))
        return exit_code(selected)
    except Exception:
        print("Production audit could not complete; check secure bindings, evidence file and provider connectivity. Response contents withheld.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
