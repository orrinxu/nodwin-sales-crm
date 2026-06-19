#!/usr/bin/env bash
set -euo pipefail

# verify.sh
# Single verification gate — agents MUST run this and confirm it returns 0
# before marking any ticket "done".

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

step() { echo; echo "── $1 ──"; }

step "1. Migration filename hygiene"
bash scripts/check-migration-filenames.sh

step "2. ESLint custom rule completeness"
bash scripts/verify-eslint-rules.sh

step "3. RLS policy linter"
VRLS_WARNINGS_ARE_ERRORS=1 bash scripts/lint-rls.sh

step "4. RLS policy coverage"
bash scripts/check-rls-coverage.sh

step "5. ESLint"
( cd apps/web && pnpm lint )

step "6. Typecheck"
( cd apps/web && pnpm typecheck )

step "7. Unit tests"
( cd apps/web && pnpm test )

echo
echo "✓ All local verification checks passed."
echo
echo "Reminder: if your work touched supabase/migrations/, you MUST also run"
echo "  supabase db reset --local"
echo "  curl -s http://localhost:3002/dashboard | grep -ciE 'sidebar|<nav|aside'"
echo "and paste both outputs into the ticket's closing comment."
