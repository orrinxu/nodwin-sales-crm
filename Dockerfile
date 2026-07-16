# syntax=docker/dockerfile:1
#
# Multi-stage build for the Nodwin CRM Next.js app (apps/web).
# Built ONLY on a GitHub-hosted runner, never on the VPS. Produces a minimal
# image around Next.js standalone output (next.config.ts: output: "standalone",
# outputFileTracingRoot = repo root), so the runtime image carries only the
# traced server + its node_modules — not the full monorepo install.
#
# Node is pinned to 20 to match CI (.github/workflows/ci.yml uses node 20);
# pnpm is pinned to the repo's packageManager (pnpm@10.33.0) via corepack.

# ── Base: Node 20 + pnpm via corepack ───────────────────────────────────────
FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# ── Deps: resolve the workspace from the lockfile (cached until manifests change)
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile

# ── Builder: compile the standalone Next.js output ──────────────────────────
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=4096

# NEXT_PUBLIC_* are inlined into the CLIENT bundle at build time, so they must be
# the real values for the TARGET environment — this image is therefore
# environment-specific (one image per env; see deploy/README.md). Server-only
# vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, POSTMARK_WEBHOOK_SECRET, the AI
# provider keys, ...) are read at RUNTIME via lib/security/env.ts and must NOT be
# baked here — they are injected on the VPS via docker compose.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_NAME="Nodwin CRM"
ARG NEXT_PUBLIC_ENV
ARG NEXT_PUBLIC_DEBUG
ARG NEXT_PUBLIC_LOG_LEVEL
ARG NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID
ARG NEXT_PUBLIC_GOOGLE_PICKER_API_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME \
    NEXT_PUBLIC_ENV=$NEXT_PUBLIC_ENV \
    NEXT_PUBLIC_DEBUG=$NEXT_PUBLIC_DEBUG \
    NEXT_PUBLIC_LOG_LEVEL=$NEXT_PUBLIC_LOG_LEVEL \
    NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID \
    NEXT_PUBLIC_GOOGLE_PICKER_API_KEY=$NEXT_PUBLIC_GOOGLE_PICKER_API_KEY

# Bring in the resolved workspace, then the source, then build.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
RUN pnpm build

# ── Runner: minimal, non-root, standalone server only ───────────────────────
FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

# node:*-slim already ships an unprivileged `node` user (uid 1000).
USER node

# Standalone bundle is traced from the repo root, so the entrypoint lands at
# apps/web/server.js and its static assets at apps/web/.next/static.
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
# public/ holds the PWA assets (manifest icons, sw.js, offline.html); standalone
# output does NOT bundle it automatically, so copy it explicitly (ORR-705).
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
