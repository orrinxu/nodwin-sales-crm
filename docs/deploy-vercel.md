# Vercel Deployment

> How to deploy the Nodwin CRM frontend to Vercel — a single production environment.

---

## Overview

The Nodwin CRM frontend (Next.js, `apps/web/`) deploys to Vercel as **one production project** linked to the GitHub repository:

| Environment | Vercel Project | Supabase Instance | Deploy trigger |
|---|---|---|---|
| Production | `nodwin-crm-production` | Supabase production project | On merge to `main` (or manual deploy) |

> **Ephemeral PR previews still exist** — Vercel automatically builds a throwaway preview deployment for each pull request. These are not a managed environment: they spin up and tear down per PR, share the production project's settings, and require no separate project, Supabase instance, or upkeep. See [PR previews](#pr-previews) below.

---

## Prerequisites

Before connecting to Vercel, the following must be in place:

1. **GitHub repository** — `nodwin-sales-crm` with `main` as the default branch.
2. **Vercel team** — A Vercel team (not personal account) with access to the Nodwin Group billing.
3. **Supabase project** — The production Supabase project, already created and migrated.
4. **Custom domain** — DNS configured to point at Vercel's edge network.
5. **Google OAuth credentials** — An OAuth 2.0 Client ID with the correct callback URLs.

---

## Step 1: Create the Vercel project

Create one Vercel project from the Vercel dashboard or CLI:

| Setting | Value |
|---|---|
| **Project name** | `nodwin-crm-production` |
| **Framework preset** | Next.js |
| **Root directory** | `apps/web` |
| **Build command** | `pnpm build` |
| **Output directory** | `.next` |
| **Install command** | `pnpm install --frozen-lockfile` |
| **Node.js version** | 20.x (`engines.node` is `>=20.0.0`) |
| **Package manager** | pnpm `10.33.0` (Vercel auto-detects from the `packageManager` field in the root `package.json`) |

> The monorepo root is the git root; Vercel must know to look in `apps/web`. Setting the root directory to `apps/web` tells Vercel to run `pnpm build` from that subdirectory.

---

## Step 2: Link GitHub repository

1. In the Vercel dashboard, go to **Settings → Git**.
2. Connect the `nodwin-sales-crm` GitHub repository.
3. Set the **production branch** to `main` — merges to `main` deploy to production.

> ✅ **GitHub checks integration:** Vercel automatically posts deployment status checks (and per-PR preview URLs) to pull requests. This requires no extra config — Vercel's GitHub app handles it.

---

## Step 3: Configure environment variables

Set environment variables in **Settings → Environment Variables**. Within the single project, Vercel scopes each variable to **Production**, **Preview**, and/or **Development** — use the **Scope** column below to keep secrets out of untrusted PR previews.

### Required variables

| Variable | Value | Scope |
|---|---|---|
| `NEXT_PUBLIC_APP_NAME` | `Nodwin CRM` | All |
| `NEXT_PUBLIC_API_URL` | `https://crm.nodwingaming.com/api` | All |
| `SUPABASE_URL` | Production Supabase URL | All |
| `NEXT_PUBLIC_SUPABASE_URL` | Same as `SUPABASE_URL` | All |
| `SUPABASE_ANON_KEY` | Production anon key | All |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same as `SUPABASE_ANON_KEY` | All |
| `SUPABASE_SERVICE_ROLE_KEY` | Production service key | **Production only** |
| `APP_URL` | `https://crm.nodwingaming.com` | All |
| `POSTMARK_WEBHOOK_SECRET` | Production secret | **Production only** |
| `NEXT_PUBLIC_DEBUG` | `false` | All |
| `NEXT_PUBLIC_LOG_LEVEL` | `warn` | All |
| `NEXT_PUBLIC_ENV` | `production` | All |

### Secret variables (masked)

The following must be marked **"Encrypt"** (masked in Vercel logs) and scoped to **Production only** so ephemeral PR previews never receive them:

| Variable | Source |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Settings → API |
| `POSTMARK_WEBHOOK_SECRET` | Postmark → Server → Webhooks → HttpHeaders |
| `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` / `DEEPSEEK_API_KEY` / `MOONSHOT_API_KEY` / `OPENAI_COMPATIBLE_API_KEY` | AI provider dashboards — see AI provider variables below |

> **Never** expose `SUPABASE_SERVICE_ROLE_KEY`, `POSTMARK_WEBHOOK_SECRET`, the AI provider keys, or similar secrets to Preview scope. Vercel encrypts environment variables by default — ensure "Encrypt" is checked for all sensitive variables.

### AI provider variables (optional — powers knowledge search, RAG, and AI features)

The AI features (knowledge search / RAG and the admin AI settings, from ORR-634/635) resolve provider credentials **DB-first**: an admin configures providers under **Admin → AI**, and those settings take precedence. As an environment-level fallback, `createAdaptersFromEnv()` (`apps/web/lib/ai/providers/index.ts`) additionally registers **any provider whose API key is present in the environment**. Set the key(s) for the provider(s) you want available without DB configuration — each is optional, and a provider is simply unavailable if its key is unset. The matching `*_MODEL` var overrides that provider's default model.

| Provider | Required var(s) | Optional model override | Notes |
|---|---|---|---|
| Anthropic (Claude) | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` (default `claude-sonnet-4-6`) | Secret |
| Google (Gemini) | `GOOGLE_API_KEY` | `GEMINI_MODEL` | Secret |
| DeepSeek | `DEEPSEEK_API_KEY` | `DEEPSEEK_MODEL` | Secret |
| Moonshot (Kimi) | `MOONSHOT_API_KEY` | `MOONSHOT_MODEL` | Secret |
| OpenAI-compatible | `OPENAI_COMPATIBLE_API_KEY` + `OPENAI_COMPATIBLE_BASE_URL` | `OPENAI_COMPATIBLE_MODEL` | Secret; base URL targets any OpenAI-compatible endpoint |
| Ollama (self-hosted) | `OLLAMA_BASE_URL` | `OLLAMA_MODEL` | No API key; the URL must be network-reachable from Vercel's runtime |

> All `*_API_KEY` values are secrets — mark them **Encrypt** and scope them to **Production only**. If no provider is configured (neither DB settings nor env), AI features stay inert: the knowledge-search endpoint returns a handled "not configured" error and the rest of the app is unaffected. Note that `OLLAMA_BASE_URL` (and any self-hosted endpoint) must be reachable from Vercel's serverless/edge runtime — a `localhost` or LAN address on a dev box will not resolve from a Vercel deployment.

---

## Step 4: Production project settings

| Setting | Value |
|---|---|
| **Production branch** | `main` |
| **Auto-expose system env** | Off |
| **Custom domain** | `crm.nodwingaming.com` (or as configured in DNS) |
| **Deployment Protection** | Enable **Vercel Authentication** on Preview deployments so PR previews are not publicly indexable |

---

## Step 5: DNS and custom domain

1. In the Vercel project dashboard, go to **Settings → Domains**.
2. Add `crm.nodwingaming.com` (or the production domain).
3. Follow Vercel's DNS configuration instructions — typically a `CNAME` record pointing to `cvc.vercel-dns.com`.
4. Wait for DNS propagation (5–30 minutes) and certificate provisioning (automatic via Vercel).

> PR previews use dynamic `*.vercel.app` subdomains — no custom DNS required.

---

## Step 6: Google OAuth callback URLs

Add the callback URLs to the Google Cloud Console OAuth 2.0 Client ID:

| Environment | Callback URL |
|---|---|
| Local dev | `http://localhost:3000/api/auth/callback` (port 3000 is the `next dev` default; adjust if you run the dev server on another port, e.g. `-p 3030`) |
| Production | `https://crm.nodwingaming.com/api/auth/callback` |

> **PR previews** get a dynamic URL (`<project>-<hash>-<scope>.vercel.app`), which can't be pre-registered with Google (web origins don't support wildcards). Previews are gated by Vercel Authentication and are for visual review, not full OAuth sign-in. If you need working Google login on a preview, add that specific preview URL to the OAuth client temporarily, or test auth against production / local dev.

---

## Step 7: Deploy workflow

### Production

Merging a PR to `main` triggers a production deployment on the connected Vercel project. If you require a human approval gate, use a `.github/workflows/deploy.yml` with `workflow_dispatch` + a GitHub environment approval (or Vercel's deployment gate) so production ships only on explicit approval.

> **Board (human) only.** No agent or automated process may deploy to production. See `BOARD_RUNBOOK.md` for the human-in-the-loop deploy procedure.

### PR previews

Every push to a PR targeting `main` triggers an automatic, ephemeral Vercel preview deployment, posted as a GitHub check. Nothing to manage — the preview is destroyed when the PR closes. URL format:
```
https://nodwin-crm-production-git-<branch>-<scope>.vercel.app
```

---

## Step 8: Migrations on deploy

Supabase migrations run separately from Vercel deploys. They are **not** part of the Vercel build step.

Apply migrations to the production Supabase project **before or alongside** the production deploy — manually via `supabase db push --linked` (pointed at the production project) as part of the deploy approval flow.

> If a migration fails, **halt the deploy** and surface the error to the board. Vercel will keep serving the previous successful build. Do not deploy a frontend that expects schema that does not exist.

---

## Verification checklist

Before considering the production environment operational:

- [ ] `pnpm build` succeeds locally for `apps/web`.
- [ ] Vercel project is connected to the correct GitHub repo.
- [ ] Root directory is set to `apps/web`.
- [ ] Build command is `pnpm build` with `pnpm install --frozen-lockfile`.
- [ ] Node.js version is 20.x.
- [ ] All required environment variables are set and scoped correctly.
- [ ] Secret variables are marked encrypted and scoped **Production only**.
- [ ] AI provider key(s) set — or admin AI settings configured — if knowledge search / RAG is in use (optional otherwise).
- [ ] Google OAuth callback URL is registered for production.
- [ ] Supabase RLS policies pass for the production Supabase project.
- [ ] Production domain resolves and SSL certificate is active.
- [ ] PR previews are password-gated via Vercel Authentication (not publicly accessible).

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| Build fails with "Command not found" | Root directory not set to `apps/web` | Verify **Root Directory** in Vercel project settings |
| Build fails with "module not found" | `pnpm install` step omitted or lockfile mismatch | Set install command to `pnpm install --frozen-lockfile` |
| Auth redirects to localhost | `APP_URL` not set for production | Set `APP_URL` in Vercel environment variables |
| 401 on Supabase queries | `SUPABASE_SERVICE_ROLE_KEY` missing or scoped wrong | Check the variable is set and scoped to Production |
| Blank page on custom domain | DNS not propagated or SSL not provisioned | Wait 30 min; check Vercel Domains panel for status |
| Preview deployment returns 404 | Build output dir not set | Verify **Output Directory** is `.next` |
| RLS errors after deploy | Migrations not applied to production Supabase | Run `supabase db push --linked` against the production project |
