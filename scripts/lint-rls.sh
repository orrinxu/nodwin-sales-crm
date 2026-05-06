#!/usr/bin/env bash
#
# lint-rls.sh -- Detect permissive Row Level Security policies in SQL files
#
# Scans supabase/migrations/ and supabase/policies/ for RLS policies that are
# overly broad or dangerous. Fails with non-zero exit code if any critical
# violations are found.
#
# Usage: ./scripts/lint-rls.sh
#

set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

EXIT_CODE=0
VIOLATION_COUNT=0
WARNING_COUNT=0

# Directories to scan
POLICY_DIRS=("supabase/migrations" "supabase/policies")

# ── Critical violations: these ALWAYS fail the lint ──
#
# These patterns indicate an RLS policy that grants broad access without
# proper row-level filtering. They are banned in this codebase.
#
# NOTE: USING (true) / WITH CHECK (true) on policies targeting service_role
# are NOT violations because service_role bypasses RLS by design in Supabase.
# The awk-based checker below handles this filtering.
#
declare -a CRITICAL_PATTERNS=(
  # USING (1=1) or similar tautologies
  'USING\s*\(\s*1\s*=\s*1\s*\)'
  
  # WITH CHECK (1=1) or similar tautologies
  'WITH\s+CHECK\s*\(\s*1\s*=\s*1\s*\)'
  
  # USING (false) is technically safe but usually a mistake (denies everything)
  # We flag it as critical because it's almost never intentional in production
  'USING\s*\(\s*false\s*\)'
  
  # Disabling RLS on a table
  'DISABLE\s+ROW\s+LEVEL\s+SECURITY'
  
  # Creating a table without RLS but with policies (dangerous default)
  # This is harder to detect precisely; we check for ALTER TABLE ... FORCE ROW LEVEL SECURITY
  # as a proxy for "this table should have RLS"
)

# ── Warnings: flagged for review but do not fail by default ──
#
# These patterns are often too broad but may be legitimate in specific cases
# (e.g., a read-only lookup table).
#
declare -a WARNING_PATTERNS=(
  # Any authenticated user can access -- lacks row-level filtering
  'auth\.uid\(\)\s+IS\s+NOT\s+NULL'
  
  # Any authenticated role -- same issue as above
  "auth\.role\(\)\s*=\s*'authenticated'"
  
  # FOR ALL without explicit restriction -- very broad policy scope
  'FOR\s+ALL'
)

# Whether warnings should be treated as errors (set VRLS_WARNINGS_ARE_ERRORS=1)
WARNINGS_ARE_ERRORS="${VRLS_WARNINGS_ARE_ERRORS:-0}"

echo "🔍 Scanning for permissive RLS policies..."
echo ""

# ── Helper: check for USING (true) / WITH CHECK (true) that are NOT in service_role blocks ──
check_using_true_non_service_role() {
  local file="$1"
  local dir="$2"
  local basename_file=$(basename "$file")
  local matches=""
  
  # Use awk to track CREATE POLICY blocks and skip service_role ones
  while IFS= read -r line; do
    matches+="$line"$'\n'
  done < <(awk '
    BEGIN {
      state = "idle"
      is_service_role = 0
      block_start = 0
      pending = ""
    }
    
    # Detect CREATE POLICY start
    tolower($0) ~ /^create[[:space:]]+policy/ {
      state = "in_policy"
      is_service_role = 0
      block_start = NR
      pending = ""
      next
    }
    
    # Inside a policy block
    state == "in_policy" {
      pending = pending $0 "\n"
      
      # Check for service_role
      if (tolower($0) ~ /to[[:space:]]+service_role/) {
        is_service_role = 1
      }
      
      # Check for USING (true) or WITH CHECK (true)
      # Only report if NOT service_role
      if (!is_service_role) {
        if (tolower($0) ~ /using\s*\(\s*true\s*\)/) {
          print NR ":" $0
        }
        if (tolower($0) ~ /with[[:space:]]+check\s*\(\s*true\s*\)/) {
          print NR ":" $0
        }
      }
      
      # Semicolon ends the CREATE POLICY statement
      if ($0 ~ /;/ && $0 !~ /^[[:space:]]*--/) {
        state = "idle"
        is_service_role = 0
        pending = ""
      }
      next
    }
    
    # Reset on blank lines or other DDL that shouldnt be in a policy
    state == "in_policy" && tolower($0) ~ /^(drop|create|alter|insert|update|delete|select)[[:space:]]/ {
      state = "idle"
      is_service_role = 0
      pending = ""
    }
  ' "$file" || true)
  
  if [ -n "$matches" ]; then
    echo -e "${RED}❌ CRITICAL${NC} in ${dir}/${basename_file}:"
    echo "$matches" | sed 's/^/     /'
    echo ""
    ((VIOLATION_COUNT++)) || true
    EXIT_CODE=1
  fi
}

for dir in "${POLICY_DIRS[@]}"; do
  if [ ! -d "$dir" ]; then
    echo "  ⚠️  Directory '$dir' does not exist, skipping"
    continue
  fi

  # Find all .sql files, sorted for deterministic output
  while IFS= read -r -d '' file; do
    # Extract the basename for cleaner output
    basename_file=$(basename "$file")
    
    # ── Critical check: USING (true) / WITH CHECK (true) outside service_role ──
    check_using_true_non_service_role "$file" "$dir"
    
    # ── Other critical checks ──
    for pattern in "${CRITICAL_PATTERNS[@]}"; do
      matches=""
      while IFS= read -r line; do
        matches+="$line"$'\n'
      done < <(grep -inE "$pattern" "$file" || true)
      
      if [ -n "$matches" ]; then
        echo -e "${RED}❌ CRITICAL${NC} in ${dir}/${basename_file}:"
        echo "$matches" | sed 's/^/     /'
        echo ""
        ((VIOLATION_COUNT++)) || true
        EXIT_CODE=1
      fi
    done
    
    # ── Warning checks ──
    for pattern in "${WARNING_PATTERNS[@]}"; do
      matches=""
      while IFS= read -r line; do
        matches+="$line"$'\n'
      done < <(grep -inE "$pattern" "$file" || true)
      
      if [ -n "$matches" ]; then
        echo -e "${YELLOW}⚠️  WARNING${NC} in ${dir}/${basename_file}:"
        echo "$matches" | sed 's/^/     /'
        echo ""
        ((WARNING_COUNT++)) || true
        if [ "$WARNINGS_ARE_ERRORS" = "1" ]; then
          EXIT_CODE=1
        fi
      fi
    done
    
  done < <(find "$dir" -maxdepth 1 -name '*.sql' -print0 | sort -z)
done

# ── Summary ──
echo "────────────────────────────────────────"
if [ $EXIT_CODE -eq 0 ] && [ $WARNING_COUNT -eq 0 ]; then
  echo -e "${GREEN}✅ No permissive RLS policies detected.${NC}"
elif [ $EXIT_CODE -eq 0 ] && [ $WARNING_COUNT -gt 0 ]; then
  echo -e "${YELLOW}⚠️  ${WARNING_COUNT} warning(s) found (not treated as errors).${NC}"
  echo "   Set VRLS_WARNINGS_ARE_ERRORS=1 to fail on warnings."
else
  echo -e "${RED}❌ ${VIOLATION_COUNT} critical violation(s) found.${NC}"
  if [ $WARNING_COUNT -gt 0 ]; then
    echo -e "   ${YELLOW}${WARNING_COUNT} warning(s) also found.${NC}"
  fi
  echo ""
  echo "   Fix the violations above before merging."
  echo "   See AGENTS.md §5.3 and §6 for RLS policy rules."
fi

exit $EXIT_CODE
