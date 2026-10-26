#!/usr/bin/env bash
# This script intentionally accepts only an empty, explicitly disposable restore target.
set -euo pipefail
umask 077
: "${RESTORE_DISPOSABLE:?Set RESTORE_DISPOSABLE=true for an isolated scratch database}"
[[ "$RESTORE_DISPOSABLE" == true ]]
: "${SCRATCH_DATABASE_URL:?Configure a separate empty scratch database}"
: "${BACKUP_AGE_IDENTITY_FILE:?Configure a private age identity file}"
: "${1:?Pass the encrypted archive path}"
[[ "$SCRATCH_DATABASE_URL" != "${DATABASE_URL:-}" ]]
export PGDATABASE="$SCRATCH_DATABASE_URL" PGCONNECT_TIMEOUT=15 PGSSLMODE=verify-full
if [[ -n "${DATABASE_CA_CERT_PATH:-}" ]]; then export PGSSLROOTCERT="$DATABASE_CA_CERT_PATH"; fi
count=$(psql -X -A -t -v ON_ERROR_STOP=1 -c "select count(*) from information_schema.tables where table_schema not in('pg_catalog','information_schema') and table_type='BASE TABLE'")
[[ "$count" == 0 ]] || { printf 'Refusing a nonempty restore target.\n' >&2; exit 1; }
# Supabase roles/extensions must already be provisioned in this isolated target.
(cd -- "$(dirname -- "$1")" && sha256sum --check "$(basename -- "$1").sha256")
age -d -i "$BACKUP_AGE_IDENTITY_FILE" "$1" | pg_restore --single-transaction --exit-on-error --no-owner
printf 'Scratch restore completed. Reapply reviewed grants/RLS and run rollback-only probes before any promotion.\n'
