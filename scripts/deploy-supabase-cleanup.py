#!/usr/bin/env python3
"""Deploy the authenticated cleanup worker and its idle-safe schedule.

Credentials stay in Edge secrets and encrypted Vault. Existing bindings are reused.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import secrets
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("sidle_maintenance", ROOT / "scripts/supabase-maintenance.py")
maintenance = importlib.util.module_from_spec(spec)
spec.loader.exec_module(maintenance)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--provision", action="store_true", help="Provision a new worker credential only when neither binding exists")
    args = parser.parse_args()
    client = maintenance.Supabase()
    vault_exists = client.sql("select count(*) as n from vault.secrets where name='sidle_cleanup_token'")[0]["n"] == 1
    edge_exists = any(secret.get("name") == "SIDLE_CLEANUP_TOKEN" for secret in client.request("/secrets"))
    if not vault_exists or not edge_exists:
        if not args.provision or vault_exists or edge_exists:
            raise RuntimeError("Worker credential bindings are missing or inconsistent; refusing to overwrite an existing binding")
        token = secrets.token_urlsafe(48)
        client.request("/secrets", "POST", [{"name": "SIDLE_CLEANUP_TOKEN", "value": token}])
        client.request("/database/query", "POST", {"query": "select vault.create_secret($1,$2,$3)", "parameters": [token, "sidle_cleanup_token", "Authenticated scheduled Sidle account cleanup"], "read_only": False})
        print("Provisioned worker credential in Edge secrets and encrypted Vault")

    boundary = "sidle-deploy-" + secrets.token_hex(16)
    parts = []
    def add(name, content, filename=None, content_type="application/octet-stream"):
        disposition = 'Content-Disposition: form-data; name="' + name + '"' + ('; filename="' + filename + '"' if filename else '')
        parts.append(("--" + boundary + "\r\n" + disposition + "\r\nContent-Type: " + content_type + "\r\n\r\n").encode() + content + b"\r\n")
    add("metadata", json.dumps({"name": "sidle-account-cleanup", "entrypoint_path": "index.ts", "verify_jwt": False}).encode(), content_type="application/json")
    for name in ("index.ts", "core.ts"):
        add("file", (ROOT / "supabase/functions/sidle-account-cleanup" / name).read_bytes(), name, "application/typescript")
    body = b"".join(parts) + ("--" + boundary + "--\r\n").encode()
    request = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{client.project}/functions/deploy?slug=sidle-account-cleanup",
        data=body, method="POST", headers={"Authorization": "Bearer " + os.environ["SUPABASE_ACCESS_TOKEN"], "Content-Type": "multipart/form-data; boundary=" + boundary},
    )
    try:
        with client.opener.open(request, timeout=55) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError("Worker deployment HTTP " + str(error.code)) from None
    if result.get("slug") != "sidle-account-cleanup" or result.get("verify_jwt") is not False:
        raise RuntimeError("Worker deployment metadata does not match its custom-authentication contract")
    # The schedule is deliberately bound to this application's intended project.
    if client.project != "mdekznpqmadhhsmouuhx":
        raise RuntimeError("Review the schedule target before deploying into a different project")
    client.sql("begin;\n" + (ROOT / "docs/supabase-cleanup-schedule.sql").read_text() + "\ncommit;", False)
    print("Worker deployed:", result.get("status"), "version", result.get("version"))
    print("Schedule installed; existing credential values were not logged or replaced")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
