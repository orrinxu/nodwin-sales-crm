#!/usr/bin/env bash
#
# Idempotent migration runner for the self-hosted Supabase database.
#
# Applies every *.sql in <migrations-dir> that is not yet recorded in
# public._applied_migrations, in filename order, inside the supabase-db
# container (local trust auth — the deterministic path; the pooler/CLI is
# avoided because it forces TLS the self-host stack doesn't serve). Records each
# applied file so re-runs are no-ops. ON_ERROR_STOP aborts the deploy on any
# failing migration rather than limping on with a half-applied schema.
#
# Usage: apply-migrations.sh <migrations-dir> [db-container]
set -euo pipefail

MIG_DIR="${1:?usage: apply-migrations.sh <migrations-dir> [db-container]}"
DB_CONTAINER="${2:-supabase-db}"

psql_db() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"
}

# Ledger of applied migrations. Created once; harmless if it already exists.
psql_db -c "CREATE TABLE IF NOT EXISTS public._applied_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);"

applied=0
shopt -s nullglob
for f in $(ls "$MIG_DIR"/*.sql 2>/dev/null | sort); do
  base="$(basename "$f")"
  already="$(psql_db -tAc "SELECT 1 FROM public._applied_migrations WHERE filename = '$base';")"
  if [ "$already" = "1" ]; then
    continue
  fi
  echo "→ applying $base"
  psql_db < "$f"
  psql_db -c "INSERT INTO public._applied_migrations(filename) VALUES ('$base');"
  applied=$((applied + 1))
done

echo "✓ migrations applied this run: $applied"
