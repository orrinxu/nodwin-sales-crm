#!/usr/bin/env bash
#
# Nodwin CRM — restore the self-hosted Supabase database from a pg_dump (ORR-780).
#
# Restores a custom-format dump produced by backup-database.sh into the
# supabase-db container. This is DESTRUCTIVE: --clean drops and recreates each
# object before loading, so the current contents of the target database are
# replaced by the dump. Requires an explicit confirmation.
#
# Usage: restore-database.sh <dump-file> [db-container]
#   e.g. restore-database.sh /var/backups/nodwin-crm/nodwin-crm-postgres-20260718-030000Z.dump
set -euo pipefail

DUMP="${1:?usage: restore-database.sh <dump-file> [db-container]}"
DB_CONTAINER="${2:-supabase-db}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-postgres}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
fail() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ERROR: $*" >&2; exit 1; }

[ -f "$DUMP" ] || fail "dump file not found: $DUMP"
[ -s "$DUMP" ] || fail "dump file is empty: $DUMP"
command -v docker >/dev/null 2>&1 || fail "docker not found on PATH"
docker inspect "$DB_CONTAINER" >/dev/null 2>&1 || fail "container '$DB_CONTAINER' not found"

echo "⚠️  This will OVERWRITE database '${PGDATABASE}' in container '${DB_CONTAINER}'"
echo "    with the contents of: ${DUMP}"
read -r -p "Type 'RESTORE' to proceed: " confirm
[ "$confirm" = "RESTORE" ] || fail "aborted (confirmation not given)"

log "restoring ${DUMP} → ${DB_CONTAINER}:${PGDATABASE}"
# --clean --if-exists so re-running is deterministic; --no-owner/--no-privileges
# to match how the dump was taken. Errors are surfaced but pg_restore exits
# non-zero on the first hard failure thanks to the pipefail + explicit check.
if ! docker exec -i "$DB_CONTAINER" pg_restore -U "$PGUSER" -d "$PGDATABASE" \
      --clean --if-exists --no-owner --no-privileges < "$DUMP"; then
  fail "pg_restore reported errors — inspect the output above before trusting the DB"
fi

log "restore complete — run the app's pgTAP/RLS checks and a smoke test before serving traffic"
