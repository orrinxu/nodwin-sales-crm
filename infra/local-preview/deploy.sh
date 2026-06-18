#!/bin/bash
set -e

# Manual deploy script for the Nodwin CRM local LAN preview.
# Run this after pulling new changes to deploy a fresh build.
#
# Usage: ./infra/local-preview/deploy.sh

cd "$(dirname "$0")/../.."

# ─── Pre-flight checks ───────────────────────────────────────────
echo "Verifying branch..."
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "ERROR: deploy requires branch 'main', but currently on '$CURRENT_BRANCH'"
  echo "Run: git switch main"
  exit 1
fi
echo "  OK — on main"

# ─── Pull latest ──────────────────────────────────────────────────
echo "Pulling latest changes..."
git pull origin main

# ─── Install + build ──────────────────────────────────────────────
echo "Installing dependencies..."
pnpm install --frozen-lockfile

echo "Building application..."
pnpm build

# ─── DB migrations ────────────────────────────────────────────────
echo "Applying database migrations..."
if command -v supabase &> /dev/null; then
  supabase db push
  echo "  OK — schema pushed"
else
  npx supabase db push
  echo "  OK — schema pushed via npx"
fi

# ─── Restart ──────────────────────────────────────────────────────
echo "Restarting PM2 process..."
pm2 restart nodwin-crm-local-preview

echo ""
echo "Deploy complete. To view logs, run: pm2 logs nodwin-crm-local-preview"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Smoke checks (run manually after deploy):"
echo "    1. curl -s http://localhost:3030/api/health | jq .status"
echo "    2. curl -s -o /dev/null -w '%{http_code}' http://localhost:3030/contacts"
echo "       (expect 200+login redirect — NOT 500)"
echo "    3. curl -s -o /dev/null -w '%{http_code}' http://localhost:3030/pipeline"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
