#!/usr/bin/env bash
#
# lint-rls.test.sh -- Self-tests for lint-rls.sh
#
# Creates temporary SQL files with known violations and safe patterns,
# then verifies the linter catches exactly what it should.
#
# Usage: ./scripts/lint-rls.test.sh
#

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LINTER="$SCRIPT_DIR/lint-rls.sh"
TEMP_DIR=""
FAILED=0
PASSED=0

# Cleanup function
cleanup() {
  if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
    rm -rf "$TEMP_DIR"
  fi
}
trap cleanup EXIT

# Helper: create a temp test environment
setup() {
  TEMP_DIR=$(mktemp -d)
  mkdir -p "$TEMP_DIR/supabase/migrations"
  mkdir -p "$TEMP_DIR/supabase/policies"
}

# Helper: run linter and capture exit code + output
run_linter() {
  local output
  local exit_code=0
  
  # Run from temp dir so relative paths resolve
  output=$(cd "$TEMP_DIR" && bash "$LINTER" 2>&1) || exit_code=$?
  
  echo "$output"
  return $exit_code
}

# Helper: assert linter fails (finds violations)
assert_fails() {
  local test_name="$1"
  local output
  local exit_code=0
  
  output=$(run_linter) || exit_code=$?
  
  if [ $exit_code -ne 0 ]; then
    echo -e "${GREEN}✓ PASS${NC}: $test_name"
    ((PASSED++)) || true
  else
    echo -e "${RED}✗ FAIL${NC}: $test_name -- expected failure but linter passed"
    echo "Output: $output"
    ((FAILED++)) || true
  fi
}

# Helper: assert linter passes (no violations)
assert_passes() {
  local test_name="$1"
  local output
  local exit_code=0
  
  output=$(run_linter) || exit_code=$?
  
  if [ $exit_code -eq 0 ]; then
    echo -e "${GREEN}✓ PASS${NC}: $test_name"
    ((PASSED++)) || true
  else
    echo -e "${RED}✗ FAIL${NC}: $test_name -- expected pass but linter failed"
    echo "Output: $output"
    ((FAILED++)) || true
  fi
}

# Helper: assert output contains a string
assert_output_contains() {
  local test_name="$1"
  local expected="$2"
  local output
  
  output=$(run_linter) || true
  
  if echo "$output" | grep -q "$expected"; then
    echo -e "${GREEN}✓ PASS${NC}: $test_name"
    ((PASSED++)) || true
  else
    echo -e "${RED}✗ FAIL${NC}: $test_name -- expected output to contain '$expected'"
    echo "Output: $output"
    ((FAILED++)) || true
  fi
}

echo "🧪 Running RLS linter self-tests..."
echo ""

# ── Test 1: Detects USING (true) ──
setup
cat > "$TEMP_DIR/supabase/migrations/0001_bad.sql" <<'EOF'
CREATE POLICY "allow_all" ON accounts FOR SELECT USING (true);
EOF
assert_fails "Detects USING (true)"

# ── Test 2: Detects WITH CHECK (true) ──
setup
cat > "$TEMP_DIR/supabase/policies/users.sql" <<'EOF'
CREATE POLICY "insert_all" ON users FOR INSERT WITH CHECK (true);
EOF
assert_fails "Detects WITH CHECK (true)"

# ── Test 3: Detects USING (1=1) ──
setup
cat > "$TEMP_DIR/supabase/migrations/0002_tautology.sql" <<'EOF'
CREATE POLICY "tautology" ON contacts FOR SELECT USING (1=1);
EOF
assert_fails "Detects USING (1=1)"

# ── Test 4: Detects DISABLE ROW LEVEL SECURITY ──
setup
cat > "$TEMP_DIR/supabase/migrations/0003_disable.sql" <<'EOF'
ALTER TABLE opportunities DISABLE ROW LEVEL SECURITY;
EOF
assert_fails "Detects DISABLE ROW LEVEL SECURITY"

# ── Test 5: Detects USING (false) ──
setup
cat > "$TEMP_DIR/supabase/migrations/0004_false.sql" <<'EOF'
CREATE POLICY "deny_all" ON accounts FOR SELECT USING (false);
EOF
assert_fails "Detects USING (false)"

# ── Test 6: Case insensitive ──
setup
cat > "$TEMP_DIR/supabase/migrations/0005_case.sql" <<'EOF'
CREATE POLICY "case_test" ON accounts FOR SELECT USING (TRUE);
EOF
assert_fails "Case insensitive detection (TRUE)"

# ── Test 7: Safe policy passes ──
setup
cat > "$TEMP_DIR/supabase/policies/opportunities.sql" <<'EOF'
CREATE POLICY "select_own" ON opportunities
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM opportunity_visibility
    WHERE opportunity_id = id AND user_id = auth.uid()
  ));
EOF
assert_passes "Safe policy with proper filtering passes"

# ── Test 8: No SQL files = passes ──
setup
assert_passes "No SQL files means pass"

# ── Test 9: No supabase directory = passes with warning ──
setup
rm -rf "$TEMP_DIR/supabase"
assert_passes "Missing directories handled gracefully"

# ── Test 10: Warning for auth.uid() IS NOT NULL ──
setup
cat > "$TEMP_DIR/supabase/policies/lookup.sql" <<'EOF'
CREATE POLICY "auth_only" ON currencies FOR SELECT
  USING (auth.uid() IS NOT NULL);
EOF
assert_passes "Warning pattern does not fail by default"
# But it should be in the output
assert_output_contains "Warning output contains auth.uid() IS NOT NULL" "auth.uid()"

# ── Test 11: VRLS_WARNINGS_ARE_ERRORS makes warnings fail ──
setup
cat > "$TEMP_DIR/supabase/policies/lookup.sql" <<'EOF'
CREATE POLICY "auth_only" ON currencies FOR SELECT
  USING (auth.uid() IS NOT NULL);
EOF
output=""
exit_code=0
output=$(cd "$TEMP_DIR" && VRLS_WARNINGS_ARE_ERRORS=1 bash "$LINTER" 2>&1) || exit_code=$?
if [ $exit_code -ne 0 ]; then
  echo -e "${GREEN}✓ PASS${NC}: VRLS_WARNINGS_ARE_ERRORS=1 fails on warnings"
  ((PASSED++)) || true
else
  echo -e "${RED}✗ FAIL${NC}: VRLS_WARNINGS_ARE_ERRORS=1 should fail on warnings"
  ((FAILED++)) || true
fi

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
