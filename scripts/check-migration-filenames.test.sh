#!/usr/bin/env bash
#
# check-migration-filenames.test.sh -- Self-tests for check-migration-filenames.sh
#
# Creates temporary migration files with known valid and invalid names,
# then verifies the validator catches exactly what it should.
#
# Usage: ./scripts/check-migration-filenames.test.sh
#

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATOR="$SCRIPT_DIR/check-migration-filenames.sh"
TEMP_DIR=""
FAILED=0
PASSED=0

cleanup() {
  if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
    rm -rf "$TEMP_DIR"
  fi
}
trap cleanup EXIT

setup() {
  TEMP_DIR=$(mktemp -d)
  mkdir -p "$TEMP_DIR/supabase/migrations"
  touch "$TEMP_DIR/supabase/migrations/.gitkeep"
}

run_validator() {
  local output
  local exit_code=0
  output=$(cd "$TEMP_DIR" && bash "$VALIDATOR" 2>&1) || exit_code=$?
  echo "$output"
  return $exit_code
}

assert_fails() {
  local test_name="$1"
  local output
  local exit_code=0

  output=$(run_validator) || exit_code=$?

  if [ $exit_code -ne 0 ]; then
    echo -e "${GREEN}✓ PASS${NC}: $test_name"
    ((PASSED++)) || true
  else
    echo -e "${RED}✗ FAIL${NC}: $test_name -- expected failure but validator passed"
    echo "Output: $output"
    ((FAILED++)) || true
  fi
}

assert_passes() {
  local test_name="$1"
  local output
  local exit_code=0

  output=$(run_validator) || exit_code=$?

  if [ $exit_code -eq 0 ]; then
    echo -e "${GREEN}✓ PASS${NC}: $test_name"
    ((PASSED++)) || true
  else
    echo -e "${RED}✗ FAIL${NC}: $test_name -- expected pass but validator failed"
    echo "Output: $output"
    ((FAILED++)) || true
  fi
}

echo "🧪 Running migration filename validator self-tests..."
echo ""

# ── Test 1: Valid timestamp pattern passes ──
setup
cat > "$TEMP_DIR/supabase/migrations/20260505000000_users.sql" <<'EOF'
SELECT 1;
EOF
assert_passes "Valid timestamp pattern (YYYYMMDDHHMMSS_name.sql)"

# ── Test 2: Valid legacy pattern passes ──
setup
cat > "$TEMP_DIR/supabase/migrations/0001_audit.sql" <<'EOF'
SELECT 1;
EOF
assert_passes "Valid legacy pattern (NNNN_name.sql)"

# ── Test 3: .gitkeep is skipped ──
setup
touch "$TEMP_DIR/supabase/migrations/.gitkeep"
cat > "$TEMP_DIR/supabase/migrations/20260505000000_users.sql" <<'EOF'
SELECT 1;
EOF
assert_passes ".gitkeep is skipped gracefully"

# ── Test 4: No SQL files + .gitkeep = passes ──
setup
assert_passes "No .sql files passes"

# ── Test 5: Missing migrations directory fails ──
setup
rm -rf "$TEMP_DIR/supabase/migrations"
assert_fails "Missing migrations directory"

# ── Test 6: Rejects camelCase name ──
setup
cat > "$TEMP_DIR/supabase/migrations/20260505000000_camelCase.sql" <<'EOF'
SELECT 1;
EOF
assert_fails "Rejects camelCase descriptive name"

# ── Test 7: Rejects PascalCase name ──
setup
cat > "$TEMP_DIR/supabase/migrations/20260505000000_PascalCase.sql" <<'EOF'
SELECT 1;
EOF
assert_fails "Rejects PascalCase descriptive name"

# ── Test 8: Rejects kebab-case name ──
setup
cat > "$TEMP_DIR/supabase/migrations/20260505000000_kebab-case.sql" <<'EOF'
SELECT 1;
EOF
assert_fails "Rejects kebab-case descriptive name"

# ── Test 9: Rejects too-short timestamp (13 digits) ──
setup
cat > "$TEMP_DIR/supabase/migrations/2026050500000_short.sql" <<'EOF'
SELECT 1;
EOF
assert_fails "Rejects 13-digit timestamp (too short)"

# ── Test 10: Rejects too-long timestamp (15 digits) ──
setup
cat > "$TEMP_DIR/supabase/migrations/202605050000000_users.sql" <<'EOF'
SELECT 1;
EOF
assert_fails "Rejects 15-digit timestamp (too long)"

# ── Test 11: Rejects no underscore between timestamp and name ──
setup
cat > "$TEMP_DIR/supabase/migrations/20260505000000users.sql" <<'EOF'
SELECT 1;
EOF
assert_fails "Rejects missing underscore between timestamp and name"

# ── Test 12: Rejects non-numeric timestamp prefix ──
setup
cat > "$TEMP_DIR/supabase/migrations/may52025_users.sql" <<'EOF'
SELECT 1;
EOF
assert_fails "Rejects non-numeric prefix"

# ── Test 13: Rejects trailing garbage ──
setup
cat > "$TEMP_DIR/supabase/migrations/20260505000000_users.sql.bak" <<'EOF'
SELECT 1;
EOF
assert_fails "Rejects non-.sql extension"

# ── Test 14: Underscore-only name (no descriptive text) passes ──
setup
cat > "$TEMP_DIR/supabase/migrations/20260505000000_a.sql" <<'EOF'
SELECT 1;
EOF
assert_passes "Single-letter descriptive name passes (valid per pattern)"

# ── Test 15: Duplicate timestamps pass in relaxed mode (warning only) ──
setup
cat > "$TEMP_DIR/supabase/migrations/20260505000000_users.sql" <<'EOF'
SELECT 1;
EOF
cat > "$TEMP_DIR/supabase/migrations/20260505000000_accounts.sql" <<'EOF'
SELECT 1;
EOF
assert_passes "Duplicate timestamps are warnings in relaxed mode"

# ── Test 16: Duplicate timestamps fail in strict mode ──
setup
cat > "$TEMP_DIR/supabase/migrations/20260505000000_users.sql" <<'EOF'
SELECT 1;
EOF
cat > "$TEMP_DIR/supabase/migrations/20260505000000_accounts.sql" <<'EOF'
SELECT 1;
EOF
output=""
exit_code=0
output=$(cd "$TEMP_DIR" && STRICT_MIGRATION_NAMES=1 bash "$VALIDATOR" 2>&1) || exit_code=$?
if [ $exit_code -ne 0 ]; then
  echo -e "${GREEN}✓ PASS${NC}: STRICT_MIGRATION_NAMES=1 fails on duplicate timestamps"
  ((PASSED++)) || true
else
  echo -e "${RED}✗ FAIL${NC}: STRICT_MIGRATION_NAMES=1 should fail on duplicate timestamps"
  ((FAILED++)) || true
fi

# ── Test 17: Multiple unique timestamps passes ──
setup
cat > "$TEMP_DIR/supabase/migrations/20260505000000_users.sql" <<'EOF'
SELECT 1;
EOF
cat > "$TEMP_DIR/supabase/migrations/20260505000001_accounts.sql" <<'EOF'
SELECT 1;
EOF
cat > "$TEMP_DIR/supabase/migrations/20260505000002_currencies.sql" <<'EOF'
SELECT 1;
EOF
assert_passes "Multiple unique timestamps pass"

# ── Test 18: Rejects an empty name (underscore only followed by .sql) ──
setup
cat > "$TEMP_DIR/supabase/migrations/20260505000000_.sql" <<'EOF'
SELECT 1;
EOF
assert_fails "Rejects empty descriptive name"

# ── Test 19: Rejects name starting with number ──
setup
cat > "$TEMP_DIR/supabase/migrations/20260505000000_123users.sql" <<'EOF'
SELECT 1;
EOF
assert_fails "Rejects name starting with digit"

# ── Test 20: Name with multi-digit segments passes ──
setup
cat > "$TEMP_DIR/supabase/migrations/20260505000000_entity_branding_relationship_types.sql" <<'EOF'
SELECT 1;
EOF
assert_passes "Long multi-segment snake_case name passes"

# ── Summary ──
echo ""
echo "────────────────────────────────────────"
if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All ${PASSED} tests passed${NC}"
  exit 0
else
  echo -e "${RED}❌ ${FAILED} test(s) failed, ${PASSED} passed${NC}"
  exit 1
fi
