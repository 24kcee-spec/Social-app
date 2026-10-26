from datetime import datetime, timedelta, timezone
import importlib.util
from pathlib import Path
import unittest

SCRIPTS = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


audit = load("production-readiness")
smtp = load("configure-supabase-email")
storage_backup = load("backup-storage")
NOW = datetime(2026, 10, 24, tzinfo=timezone.utc)
WEB = "https://app.example.com"


class ProductionChecks(unittest.TestCase):
    def setUp(self):
        self.auth = {"mailer_autoconfirm": False, "password_min_length": 8,
                     "security_update_password_require_reauthentication": True,
                     "site_url": WEB, "uri_allow_list": WEB + "/**", "password_hibp_enabled": True,
                     "smtp_host": "smtp.example.com", "smtp_user": "smtp-user", "smtp_port": "587",
                     "smtp_admin_email": "sender@example.com", "smtp_sender_name": "Sidle"}
        self.backups = {"pitr_enabled": True, "walg_enabled": True, "backups": [
            {"status": "COMPLETED", "inserted_at": NOW.isoformat()}]}

    def checks(self):
        return {row["name"]: row for row in audit.provider_checks(self.auth, {"currentConfig": {"database": True}}, self.backups, WEB, NOW)}

    def test_complete_provider_configuration_passes(self):
        self.assertEqual(audit.exit_code(list(self.checks().values())), 0)

    def test_auto_confirm_is_a_core_security_failure(self):
        self.auth["mailer_autoconfirm"] = True
        self.assertEqual(self.checks()["email_confirmation"]["status"], "fail")

    def test_sender_host_alone_is_not_smtp_ready(self):
        del self.auth["smtp_admin_email"]
        self.assertEqual(self.checks()["custom_smtp"]["status"], "blocked")

    def test_wal_and_pitr_flags_do_not_prove_a_backup(self):
        self.backups["backups"] = []
        self.assertEqual(self.checks()["recent_recoverable_backup"]["status"], "blocked")

    def test_failed_stale_future_and_naive_backups_are_rejected(self):
        for row in [{"status": "FAILED", "inserted_at": NOW.isoformat()},
                    {"status": "COMPLETED", "inserted_at": (NOW-timedelta(hours=49)).isoformat()},
                    {"status": "COMPLETED", "inserted_at": (NOW+timedelta(seconds=1)).isoformat()},
                    {"status": "COMPLETED", "inserted_at": "2026-10-24T00:00:00"},
                    {"status": "COMPLETED", "inserted_at": None}]:
            self.backups["backups"] = [row]
            self.assertEqual(self.checks()["recent_recoverable_backup"]["status"], "blocked")

    def test_recent_provider_physical_window_counts_as_backup_evidence(self):
        self.backups["backups"] = []
        self.backups["physical_backup_data"] = {"earliest_physical_backup_date_unix": int((NOW-timedelta(days=1)).timestamp()), "latest_physical_backup_date_unix": int(NOW.timestamp())}
        self.assertEqual(self.checks()["recent_recoverable_backup"]["status"], "pass")

    def test_redirect_lookalike_and_disabled_protections_fail(self):
        self.auth["uri_allow_list"] = WEB + ".evil/**"
        self.auth["password_hibp_enabled"] = False
        self.assertEqual(self.checks()["auth_redirects"]["status"], "fail")
        self.assertEqual(self.checks()["leaked_password_protection"]["status"], "blocked")

    def test_missing_malformed_stale_or_cross_project_attestations_block(self):
        entry = {"status": "passed", "verified_at": NOW.isoformat(), "report": "docs/delivery-report.md"}
        for evidence in [{}, [], {"project": "wrong", "web_origin": WEB, "email_delivery": entry},
                         {"project": "project", "web_origin": WEB, "email_delivery": []},
                         {"project": "project", "web_origin": WEB, "email_delivery": {**entry, "verified_at": (NOW-timedelta(days=31)).isoformat()}}]:
            self.assertEqual(audit.evidence_checks(evidence, "project", WEB, NOW)[0]["status"], "blocked")

    def test_attestation_is_scoped_to_project_origin_and_time(self):
        evidence = {"project": "project", "web_origin": WEB, "email_delivery": {"status": "passed", "verified_at": NOW.isoformat(), "report": "docs/delivery-report.md"}}
        self.assertEqual(audit.evidence_checks(evidence, "project", WEB, NOW)[0]["status"], "pass")
        self.assertEqual(audit.evidence_checks(evidence, "project", WEB + ".evil", NOW)[0]["status"], "blocked")
        self.assertEqual(audit.evidence_checks(evidence, "project", WEB, NOW)[1]["status"], "blocked")

    def test_unsafe_production_urls_are_rejected(self):
        for value in ["http://app.example.com", "https://user:pass@app.example.com", "https://app.example.com/reset", "https://app.example.com?secret=x"]:
            with self.assertRaises(ValueError): audit.origin(value)


class SMTPConfiguration(unittest.TestCase):
    def setUp(self):
        self.env = {"SMTP_HOST": "smtp.provider.com", "SMTP_PORT": "587", "SMTP_USER": "smtp-user", "SMTP_PASSWORD": "secret-with-spaces ", "SMTP_ADMIN_EMAIL": "sender@example.com", "SMTP_SENDER_NAME": "Sidle"}

    def test_complete_bindings_preserve_password_and_require_confirmation(self):
        result = smtp.smtp_settings(self.env)
        self.assertEqual(result["smtp_pass"], self.env["SMTP_PASSWORD"])
        self.assertIs(result["mailer_autoconfirm"], False)
        self.assertEqual(set(result), {"smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_admin_email", "smtp_sender_name", "mailer_autoconfirm"})

    def test_partial_bindings_and_unsafe_hosts_ports_senders_fail_without_values(self):
        for key, value in [("SMTP_PASSWORD", ""), ("SMTP_HOST", "127.0.0.1"), ("SMTP_HOST", "https://smtp.provider.com"), ("SMTP_HOST", "smtp.local"), ("SMTP_PORT", "25"), ("SMTP_ADMIN_EMAIL", "invalid"), ("SMTP_SENDER_NAME", "Injected\r\nHeader")]:
            with self.assertRaises(ValueError) as error:
                smtp.smtp_settings({**self.env, key: value})
            self.assertNotIn(self.env["SMTP_PASSWORD"], str(error.exception))


class StorageBackupPaths(unittest.TestCase):
    def test_archive_paths_cannot_escape_the_private_bucket_prefix(self):
        for path in ['/absolute', '../secret', 'a/../secret', 'a//b', 'a/./b', 'a\\b', 'a\x00b', '']:
            with self.assertRaises(ValueError): storage_backup.safe_path(path)
        self.assertEqual(storage_backup.safe_path('user/photo.jpg'), 'user/photo.jpg')


if __name__ == "__main__":
    unittest.main()
