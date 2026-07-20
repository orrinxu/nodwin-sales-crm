#!/usr/bin/env bash
#
# Nodwin CRM — self-hosted Supabase database backup (ORR-780).
#
# Takes a consistent, compressed pg_dump of the self-hosted Postgres from inside
# the supabase-db container, writes it to a local backup directory with a
# timestamped name, optionally ships it OFF-BOX (so a droplet disk loss doesn't
# take the only copy with it), then prunes local dumps older than the retention
# window. Designed to be driven by nodwin-crm-backup.timer (daily) but is safe to
# run by hand for an ad-hoc backup before a risky change.
#
# Custom format (-Fc): compressed and restorable selectively with pg_restore.
#
# Usage: backup-database.sh
#
# Config (env vars — set in the systemd unit or the shell):
#   BACKUP_DIR       local dir for dumps           (default /var/backups/nodwin-crm)
#   DB_CONTAINER     supabase db container name    (default supabase-db)
#   PGUSER           postgres role                 (default postgres)
#   PGDATABASE       database name                 (default postgres)
#   RETENTION_DAYS   delete local dumps older than (default 14)
#   BACKUP_S3_URL    optional off-box target, e.g. s3://nodwin-crm-backups/db
#                    (uploaded with the aws CLI if present, else s3cmd; skipped
#                    with a warning if neither is installed)
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/nodwin-crm}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
BACKUP_S3_URL="${BACKUP_S3_URL:-}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
fail() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ERROR: $*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || fail "docker not found on PATH"
docker inspect "$DB_CONTAINER" >/dev/null 2>&1 || fail "container '$DB_CONTAINER' not found — is the Supabase stack up?"

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%d-%H%M%SZ)"
OUT="$BACKUP_DIR/nodwin-crm-${PGDATABASE}-${STAMP}.dump"
TMP="${OUT}.partial"

log "dumping ${PGDATABASE} from ${DB_CONTAINER} → ${OUT}"
# -Fc custom format, --no-owner/--no-privileges so a restore into a fresh stack
# doesn't fail on roles that don't exist yet. Stream straight out of the
# container to a .partial file, then atomically rename so a crash never leaves a
# truncated file that looks complete.
if ! docker exec "$DB_CONTAINER" pg_dump -U "$PGUSER" -d "$PGDATABASE" \
      -Fc --no-owner --no-privileges > "$TMP"; then
  rm -f "$TMP"
  fail "pg_dump failed — no backup written"
fi

# A valid custom-format dump is never empty; guard against a silent 0-byte file.
if [ ! -s "$TMP" ]; then
  rm -f "$TMP"
  fail "pg_dump produced an empty file — treating as failure"
fi
mv "$TMP" "$OUT"
SIZE="$(du -h "$OUT" | cut -f1)"
log "wrote ${OUT} (${SIZE})"

# Off-box copy (best-effort but LOUD on failure — a backup only on the same
# droplet does not survive the failure mode this exists to protect against).
if [ -n "$BACKUP_S3_URL" ]; then
  DEST="${BACKUP_S3_URL%/}/$(basename "$OUT")"
  if command -v aws >/dev/null 2>&1; then
    log "uploading → ${DEST} (aws)"
    aws s3 cp "$OUT" "$DEST" || fail "off-box upload failed (aws)"
  elif command -v s3cmd >/dev/null 2>&1; then
    log "uploading → ${DEST} (s3cmd)"
    s3cmd put "$OUT" "$DEST" || fail "off-box upload failed (s3cmd)"
  else
    log "WARNING: BACKUP_S3_URL set but neither aws nor s3cmd is installed — dump kept LOCAL ONLY"
  fi
else
  log "WARNING: BACKUP_S3_URL not set — dump is LOCAL ONLY (a droplet disk loss loses it). Configure off-box storage."
fi

# Prune old local dumps.
log "pruning local dumps older than ${RETENTION_DAYS} days"
find "$BACKUP_DIR" -maxdepth 1 -name 'nodwin-crm-*.dump' -type f -mtime "+${RETENTION_DAYS}" -print -delete || true

log "backup complete"
