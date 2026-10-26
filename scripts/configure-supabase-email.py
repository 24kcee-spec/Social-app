#!/usr/bin/env python3
"""Inspect SMTP, or apply saved SMTP bindings with --apply. Never sends mail."""
import argparse
import importlib.util
import ipaddress
import json
import os
from pathlib import Path
import re
import sys


def smtp_settings(env):
    names = {
        "smtp_host": "SMTP_HOST", "smtp_port": "SMTP_PORT", "smtp_user": "SMTP_USER",
        "smtp_pass": "SMTP_PASSWORD", "smtp_admin_email": "SMTP_ADMIN_EMAIL",
        "smtp_sender_name": "SMTP_SENDER_NAME",
    }
    missing = [name for name in names.values() if not env.get(name, "").strip()]
    if missing:
        raise ValueError("Missing secure bindings: " + ", ".join(missing))
    values = {key: env[name] if key == "smtp_pass" else env[name].strip() for key, name in names.items()}
    host = values["smtp_host"]
    if not re.fullmatch(r"[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?", host) or "." not in host:
        raise ValueError("SMTP_HOST must be a public provider hostname")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise ValueError("SMTP_HOST must be a provider hostname, not an IP address")
    if host.lower().endswith((".local", ".localhost", ".internal", ".invalid", ".example")):
        raise ValueError("SMTP_HOST must be a public provider hostname")
    if values["smtp_port"] not in ("465", "587"):
        raise ValueError("SMTP_PORT must be 465 or 587 for provider TLS submission")
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", values["smtp_admin_email"]):
        raise ValueError("SMTP_ADMIN_EMAIL must be the provider-verified sender address")
    if any("\r" in value or "\n" in value for key, value in values.items() if key != "smtp_pass"):
        raise ValueError("SMTP settings must not contain line breaks")
    # Enabling production mail must never reopen the legacy auto-confirm bypass.
    return {**values, "mailer_autoconfirm": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    try:
        spec = importlib.util.spec_from_file_location("maintenance", Path(__file__).with_name("supabase-maintenance.py"))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        client = module.Supabase()
        if args.apply:
            settings = smtp_settings(os.environ)
            client.request("/config/auth", "PATCH", settings)
        auth = client.request("/config/auth")
        print(json.dumps({"project": client.project, "custom_smtp_configured": bool(auth.get("smtp_host")),
                          "email_confirmation_required": auth.get("mailer_autoconfirm") is False,
                          "delivery_verified": False}, indent=2))
        if args.apply and (any(str(auth.get(key)) != value for key, value in settings.items() if key not in ("smtp_pass", "mailer_autoconfirm")) or auth.get("mailer_autoconfirm") is not False):
            raise RuntimeError("SMTP read-back did not match; inspect provider state before retrying")
    except (ValueError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
