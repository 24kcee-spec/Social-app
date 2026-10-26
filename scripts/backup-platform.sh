#!/usr/bin/env bash
# Encrypted logical backup. Requires a trusted direct PostgreSQL route, pg_dump and age.
set -euo pipefail
umask 077
: "${DATABASE_URL:?Configure the operator database URL}"
: "${BACKUP_AGE_RECIPIENT:?Configure an age public recipient key}"
: "${BACKUP_DIRECTORY:?Use a private mounted backup directory}"
command -v age >/dev/null
command -v pg_dump >/dev/null
mkdir -p -- "$BACKUP_DIRECTORY"
export PGDATABASE="$DATABASE_URL" PGCONNECT_TIMEOUT=15 PGSSLMODE=verify-full
if [[ -n "${DATABASE_CA_CERT_PATH:-}" ]]; then export PGSSLROOTCERT="$DATABASE_CA_CERT_PATH"; fi
stamp=$(date -u +%Y%m%dT%H%M%SZ)
temporary=$(mktemp "$BACKUP_DIRECTORY/.sidle-backup.XXXXXX")
trap 'rm -f -- "$temporary"' EXIT
pg_dump --format=custom --no-owner --schema=public --schema=app_private --schema=auth --schema=storage | age -r "$BACKUP_AGE_RECIPIENT" > "$temporary"
target="$BACKUP_DIRECTORY/sidle-$stamp.dump.age"
[[ ! -e "$target" ]]
ln -- "$temporary" "$target"
rm -- "$temporary"
(cd -- "$(dirname -- "$target")" && sha256sum -- "$(basename -- "$target")" > "$(basename -- "$target").sha256")
printf 'Encrypted database archive created: %s\n' "$target"
printf 'Storage metadata is included; object bytes and provider secrets need separate encrypted backups.\n'
