#!/usr/bin/env bash
# scripts/check-migration-filenames.sh
#
# Migration Filename Validator
# ----------------------------
# Ensures all migration files in supabase/migrations/ follow the naming
# convention and have no duplicate timestamps.
#
# Checks performed:
#   1. Filename pattern validation (timestamp or legacy)
#   2. Duplicate timestamp detection (warnings in relaxed mode, errors in strict)
#   3. Future-dated migrations (date prefix > today UTC)
#   4. .bak files under supabase/migrations/, supabase/seed/, or supabase/policies/
#
# Duplicate timestamps are warnings by default. Set STRICT_MIGRATION_NAMES=1
# to treat them as errors.
#
# Usage:
#   ./scripts/check-migration-filenames.sh                # warnings for dupes
#   STRICT_MIGRATION_NAMES=1 ./scripts/check-migration-filenames.sh  # errors
#
# Exit codes:
#   0 — all checks passed
#   1 — invalid filenames, future-dated migrations, .bak files,
#       or duplicate timestamps in strict mode
#

set -euo pipefail

MIGRATIONS_DIR="supabase/migrations"
EXIT_CODE=0
STRICT="${STRICT_MIGRATION_NAMES:-0}"

# ── Helpers ──────────────────────────────────────────────────────────────────

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

# Validate filename against allowed patterns
# Returns 0 if valid, 1 if invalid
is_valid_filename() {
  local filename="$1"

  [[ "$filename" == ".gitkeep" ]] && return 0

  # Legacy pattern: 4 digits, underscore, snake_case name, .sql
  if [[ "$filename" =~ ^[0-9]{4}_[a-z][a-z0-9_]*\.sql$ ]]; then
    return 0
  fi

  # Timestamp pattern: 14 digits (YYYYMMDDHHMMSS), underscore, snake_case name, .sql
  if [[ "$filename" =~ ^[0-9]{14}_[a-z][a-z0-9_]*\.sql$ ]]; then
    return 0
  fi

  return 1
}

# Extract timestamp prefix (YYYYMMDDHHMMSS) from a timestamp-pattern filename
# Returns empty string if not a timestamp-pattern file
extract_timestamp() {
  local filename="$1"
  if [[ "$filename" =~ ^([0-9]{14})_.+\.sql$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
  fi
}

# ── Main ─────────────────────────────────────────────────────────────────────

echo "════════════════════════════════════════════════"
echo "  Migration Filename Validator"
echo "════════════════════════════════════════════════"
echo ""

if [ ! -d "$MIGRATIONS_DIR" ]; then
  red "ERROR: $MIGRATIONS_DIR not found. Run from repo root."
  exit 1
fi

if [ "$STRICT" = "1" ]; then
  echo "  Mode: strict (duplicate timestamps → error)"
else
  echo "  Mode: relaxed (duplicate timestamps → warning)"
fi
echo ""

# ── Pass 1: Validate all filenames ───────────────────────────────────────────

invalid_count=0

echo "── Filename pattern check ──────────────────────"

shopt -s nullglob

for file in "$MIGRATIONS_DIR"/*; do
  filename=$(basename "$file")

  if [ "$filename" = ".gitkeep" ]; then
    continue
  fi

  if is_valid_filename "$filename"; then
    green "  ✓ $filename"
  else
    red "  ✗ $filename"
    echo "    Expected: YYYYMMDDHHMMSS_descriptive_name.sql"
    echo "           or: NNNN_descriptive_name.sql (legacy)"
    ((invalid_count++)) || true
    EXIT_CODE=1
  fi
done

shopt -u nullglob

echo ""

if [ $invalid_count -gt 0 ]; then
  red "  $invalid_count file(s) with invalid names"
else
  green "  All filenames valid"
fi

echo ""

# ── Pass 2: Check for duplicate timestamps ───────────────────────────────────

echo "── Duplicate timestamp check ───────────────────"

declare -A timestamp_map
dupe_count=0

shopt -s nullglob

for file in "$MIGRATIONS_DIR"/*.sql; do
  filename=$(basename "$file")
  ts=$(extract_timestamp "$filename")

  if [ -n "$ts" ]; then
    if [ -n "${timestamp_map[$ts]:-}" ]; then
      yellow "  ⚠ Timestamp collision: $ts"
      echo "    - ${timestamp_map[$ts]}"
      echo "    - $filename"
      ((dupe_count++)) || true
    else
      timestamp_map[$ts]="$filename"
    fi
  fi
done

shopt -u nullglob

echo ""

if [ $dupe_count -gt 0 ]; then
  if [ "$STRICT" = "1" ]; then
    red "  $dupe_count duplicate timestamp group(s) found → FAIL (strict mode)"
    EXIT_CODE=1
  else
    yellow "  $dupe_count duplicate timestamp group(s) found (warning only)"
    echo "  Set STRICT_MIGRATION_NAMES=1 to treat as errors."
  fi
else
  green "  No duplicate timestamps"
fi

echo ""

# ── Pass 3: Check for future-dated migrations ─────────────────────────────────

echo "── Future-date check ─────────────────────────────"

TODAY=$(date -u +%Y%m%d)
future_count=0

shopt -s nullglob

for file in "$MIGRATIONS_DIR"/*.sql; do
  filename=$(basename "$file")
  ts=$(extract_timestamp "$filename")

  if [ -n "$ts" ]; then
    ts_date="${ts:0:8}"
    if [ "$ts_date" -gt "$TODAY" ]; then
      red "  ✗ Future-dated: $filename (date prefix: $ts_date > today: $TODAY)"
      ((future_count++)) || true
      EXIT_CODE=1
    fi
  fi
done

shopt -u nullglob

echo ""

if [ $future_count -gt 0 ]; then
  red "  $future_count future-dated migration(s) found"
else
  green "  No future-dated migrations"
fi

echo ""

# ── Pass 4: Check for .bak files ──────────────────────────────────────────────

echo "── .bak file check ────────────────────────────────"

bak_count=0

while IFS= read -r bak_file; do
  red "  ✗ .bak file: $bak_file"
  ((bak_count++)) || true
done < <(find supabase/migrations supabase/seed supabase/policies -name '*.bak' 2>/dev/null || true)

if [ $bak_count -gt 0 ]; then
  red "  $bak_count .bak file(s) found — remove before committing"
  EXIT_CODE=1
else
  green "  No .bak files found"
fi

echo ""
echo "════════════════════════════════════════════════"

if [ $EXIT_CODE -eq 0 ]; then
  green "✓ All migration filename checks passed."
else
  red "✗ Migration filename issues found."
fi

exit $EXIT_CODE
