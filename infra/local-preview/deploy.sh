#!/bin/bash
set -e

# Manual deploy script for the Nodwin CRM local LAN preview.
# Run this after pulling new changes to deploy a fresh build.
#
# Usage: ./infra/local-preview/deploy.sh

cd "$(dirname "$0")/../.."

echo "Pulling latest changes..."
git pull origin main

echo "Installing dependencies..."
pnpm install --frozen-lockfile

echo "Building application..."
pnpm build

echo "Restarting PM2 process..."
pm2 restart nodwin-crm-local-preview

echo ""
echo "Deploy complete. To view logs, run: pm2 logs nodwin-crm-local-preview"
