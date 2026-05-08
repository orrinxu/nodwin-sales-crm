#!/usr/bin/env bash
set -euo pipefail

# verify-eslint-rules.sh
# Pre-merge gate: ensures every exported custom ESLint rule is:
# 1. Enabled in eslint.config.mjs
# 2. Has a corresponding test case in eslint-safety.test.ts
#
# Exit 0 if all rules are verified.
# Exit 1 with diagnostic output if any rule is missing from config or tests.

PLUGIN_INDEX="apps/web/eslint-plugin-custom/index.js"
ESLINT_CONFIG="apps/web/eslint.config.mjs"
TEST_FILE="apps/web/__tests__/eslint-safety.test.ts"

ERRORS=0

echo "=== ESLint Rule Verification Gate ==="
echo ""

# Extract exported rule names from plugin index
# Looks for "rule-name": identifier in the rules object
RULES=$(grep -oP '"[a-z-]+":' "$PLUGIN_INDEX" | tr -d '":' | sort -u)

if [ -z "$RULES" ]; then
  echo "ERROR: No rules found in $PLUGIN_INDEX"
  exit 1
fi

echo "Rules exported from plugin:"
echo "$RULES" | sed 's/^/  - /'
echo ""

for RULE in $RULES; do
  FULL_RULE="custom/$RULE"
  
  # Check 1: Rule is enabled in eslint.config.mjs
  if ! grep -q "$FULL_RULE" "$ESLINT_CONFIG"; then
    echo "ERROR: Rule '$FULL_RULE' is exported but NOT enabled in $ESLINT_CONFIG"
    ERRORS=$((ERRORS + 1))
  else
    echo "OK: '$FULL_RULE' is enabled in $ESLINT_CONFIG"
  fi
  
  # Check 2: Rule has test coverage in eslint-safety.test.ts
  # We look for a describe block with the rule name (with or without custom/ prefix)
  if ! grep -qE "describe\([\"'].*$RULE.*[\"']" "$TEST_FILE"; then
    echo "ERROR: Rule '$RULE' is exported but has NO test coverage in $TEST_FILE"
    ERRORS=$((ERRORS + 1))
  else
    echo "OK: '$RULE' has test coverage in $TEST_FILE"
  fi
done

echo ""

# Check 3: No extra rules in config that aren't exported (catches typos)
# Only look for rules in the format "custom/rule-name": (inside rules objects, not imports)
CONFIG_RULES=$(grep -oP '"custom/[a-z-]+":' "$ESLINT_CONFIG" | sed 's/"custom\///;s/"://' | sort -u)
for RULE in $CONFIG_RULES; do
  if ! echo "$RULES" | grep -qx "$RULE"; then
    echo "ERROR: Rule 'custom/$RULE' is enabled in $ESLINT_CONFIG but NOT exported from $PLUGIN_INDEX"
    ERRORS=$((ERRORS + 1))
  fi
done

echo ""

# Check 4: No orphan rule files in plugin directory (not exported but exist)
PLUGIN_DIR="apps/web/eslint-plugin-custom"
for RULE_FILE in "$PLUGIN_DIR"/*.js; do
  BASENAME=$(basename "$RULE_FILE" .js)
  # Skip the index file itself
  [ "$BASENAME" = "index" ] && continue
  
  # Check if the file is imported in index.js (handles renamed imports like numeric-coercion -> numericCoercion)
  if ! grep -q "$BASENAME" "$PLUGIN_INDEX"; then
    echo "ERROR: Rule file '$RULE_FILE' exists but is NOT imported/exported in $PLUGIN_INDEX"
    ERRORS=$((ERRORS + 1))
  fi
done

echo ""

if [ "$ERRORS" -gt 0 ]; then
  echo "=== VERIFICATION FAILED: $ERRORS error(s) found ==="
  exit 1
else
  echo "=== VERIFICATION PASSED: All rules exported, enabled, and tested ==="
  exit 0
fi
