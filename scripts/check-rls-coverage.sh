#!/usr/bin/env bash
# scripts/check-rls-coverage.sh
#
# RLS Policy Coverage Linter
# --------------------------
# Ensures every table with RLS policies in supabase/policies/ has
# corresponding pgTAP tests in supabase/tests/.
#
# Strategy:
#   For each table found in a policy file (ALTER TABLE ... ENABLE ROW LEVEL SECURITY):
#   1. Skip if ALL policies for the table are TO service_role
#      (service_role has BYPASSRLS in Supabase by default, so these policies
#       are purely documentation and don't need test coverage).
#   2. Otherwise, check if ANY test file in supabase/tests/ references the table.
#   3. If no test references the table, check for a SECURITY_REVIEWER_EXEMPT
#      annotation in the policy file.
#   4. If none of the above, the linter fails.
#
# SECURITY_REVIEWER_EXEMPT format (add as a comment in the policy file):
#   -- SECURITY_REVIEWER_EXEMPT
#   -- Reviewer: <agent_id>
#   -- Date: <YYYY-MM-DD>
#   -- Reason: <why this table/policy is exempt from test coverage>
#
# Usage:
#   ./scripts/check-rls-coverage.sh
#
# Exit codes:
#   0 — all policies have tests or valid exemptions
#   1 — one or more policies are missing tests without exemption

set -euo pipefail

POLICIES_DIR="supabase/policies"
TESTS_DIR="supabase/tests"
EXIT_CODE=0

# ── Helpers ──────────────────────────────────────────────────────────────────

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

normalise_table() {
  local t="$1"
  t="${t#public.}"
  t="${t,,}"
  echo "$t"
}

has_exemption() {
  grep -qi 'SECURITY_REVIEWER_EXEMPT' "$1" 2>/dev/null
}

table_has_non_service_role_policies() {
  local file="$1"
  local table="$2"
  local table_key
  table_key=$(printf '%s' "$table" | tr '[:upper:]' '[:lower:]')
  table_key="${table_key#public.}"
  awk -v t="$table_key" '
    BEGIN {
      total = 0
      non_service = 0
      state = "idle"
    }
    {
      line = tolower($0)
    }

    # Detect CREATE POLICY — may have ON on same line or next
    line ~ /^create[[:space:]]+policy/ {
      idx = index(line, " on ")
      if (idx > 0) {
        rest = substr(line, idx + 4)
        gsub(/^public\./, "", rest)
        sub(/[[:space:]]*\(.*/, "", rest)
        if (rest == t) {
          state = "collect"
          has_service = 0
          total++
        } else {
          state = "skip"
        }
      } else {
        state = "nextline_on"
      }
      next
    }

    # Handle ON clause on the line after CREATE POLICY
    state == "nextline_on" && line ~ /^[[:space:]]*on[[:space:]]+/ {
      rest = substr(line, index(line, "on ") + 3)
      gsub(/^public\./, "", rest)
      sub(/[[:space:]]*\(.*/, "", rest)
      if (rest == t) {
        state = "collect"
        has_service = 0
        total++
      } else {
        state = "skip"
      }
      next
    }

    # Inside a policy block matching our target table — track role
    state == "collect" && line ~ /to[[:space:]]+service_role/ { has_service = 1 }

    # Semicolon ends the CREATE POLICY statement
    state == "collect" && line ~ /;/ && line !~ /^[[:space:]]*--/ {
      if (!has_service) non_service++
      state = "idle"
    }

    # Skip until next CREATE POLICY or until we hit a semicolon to reset
    state == "skip" && line ~ /;/ { state = "idle" }

    END { if (total > 0 && non_service == 0) print "true"; else print "false" }
  ' "$file"
}

table_is_tested() {
  local table="$1"
  local pat
  pat=$(printf '%s' "$table" | sed 's/[._-]/\\&/g')
  grep -rqil "$pat" "$TESTS_DIR" --include="*.test.sql" 2>/dev/null
}

# ── Main ─────────────────────────────────────────────────────────────────────

echo "════════════════════════════════════════════════"
echo "  RLS Policy Coverage Linter"
echo "════════════════════════════════════════════════"
echo ""

if [ ! -d "$POLICIES_DIR" ]; then
  red "ERROR: $POLICIES_DIR not found. Run from repo root."
  exit 1
fi

shopt -s nullglob

for policy_file in "$POLICIES_DIR"/*.sql; do
  filename=$(basename "$policy_file")

  [[ "$filename" == _* ]] && continue

  file_exempt=false
  has_exemption "$policy_file" && file_exempt=true

  mapfile -t tables < <(grep -oiP 'ALTER TABLE\s+(public\.)?\w+\s+ENABLE ROW LEVEL SECURITY' "$policy_file" \
    | sed -E 's/ALTER TABLE\s+(public\.)?//i' \
    | sed -E 's/\s+ENABLE ROW LEVEL SECURITY//i' \
    | sort -u)

  if [ ${#tables[@]} -eq 0 ]; then
    continue
  fi

  echo "── $filename ────────────────────────────────"

  all_tested=true
  for raw_table in "${tables[@]}"; do
    table=$(normalise_table "$raw_table")

    if table_has_non_service_role_policies "$policy_file" "$table" | grep -q true; then
      yellow "  ~ $table — service_role-only (bypasses RLS, no test needed)"
      continue
    fi

    if table_is_tested "$table"; then
      green "  ✓ $table"
      continue
    fi

    if [ "$file_exempt" = true ]; then
      yellow "  ⚠ $table — exempted (SECURITY_REVIEWER_EXEMPT)"
      continue
    fi

    red "  ✗ $table — no test coverage found"
    echo "    (no reference in ${TESTS_DIR}/*.test.sql)"
    all_tested=false
    EXIT_CODE=1
  done

  if [ "$all_tested" = true ] && [ ${#tables[@]} -gt 0 ]; then
    echo "  (${#tables[@]} table(s) — all covered)"
  fi
done

shopt -u nullglob

echo ""
echo "════════════════════════════════════════════════"

if [ $EXIT_CODE -eq 0 ]; then
  green "✓ All RLS policies have corresponding tests or valid exemptions."
else
  red "✗ Some RLS policies are missing test coverage."
  echo ""
  echo "To add a SECURITY_REVIEWER_EXEMPT (only with security reviewer approval):"
  echo "  1. Add a comment block to the policy file:"
  echo '     -- SECURITY_REVIEWER_EXEMPT'
  echo '     -- Reviewer: <agent_id>'
  echo '     -- Date: <YYYY-MM-DD>'
  echo '     -- Reason: <why this table/policy is exempt>'
  echo "  2. Commit the exemption after security reviewer approval."
fi

exit $EXIT_CODE
