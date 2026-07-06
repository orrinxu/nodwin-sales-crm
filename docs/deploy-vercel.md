# Vercel Deployment

> How to deploy the Nodwin CRM frontend to Vercel — mirroring the GitHub CI setup for all environments.

---

## Overview

The Nodwin CRM frontend (Next.js, `apps/web/`) deploys to Vercel. Each environment corresponds to a Vercel project linked to the same GitHub repository, differentiated by environment variables:

| Environment | Vercel Project | Supabase Instance | Deploy trigger |
|---|---|---|---|
| Preview (staging) | `nodwin-crm-staging` | Supabase staging project | Automatic — every PR push |
| Sandbox | `nodwin-crm-sandbox` | Supabase sandbox project | Manual — main branch |
| Production | `nodwin-crm-production` | Supabase production project | Manual via GitHub deploy workflow |

---

## Prerequisites

Before connecting to Vercel, the following must be in place:

1. **GitHub repository** — `nodwin-sales-crm` with `main` as the default branch.
2. **Vercel team** — A Vercel team (not personal account) with access to the Nodwin Group billing.
3. **Supabase projects** — Three Supabase projects (staging, sandbox, production) already created and migrated.
4. **Custom domain** (production only) — DNS configured to point at Vercel's edge network.
5. **Google OAuth credentials** — One OAuth 2.0 Client ID per environment (with the correct callback URLs).

---

## Step 1: Create Vercel projects

Create three Vercel projects from the Vercel dashboard or CLI:

| Project name | Framework preset | Root directory | Build command | Output directory |
|---|---|---|---|---|
| `nodwin-crm-staging` | Next.js | `apps/web` | `pnpm build` | `.next` |
| `nodwin-crm-sandbox` | Next.js | `apps/web` | `pnpm build` | `.next` |
| `nodwin-crm-production` | Next.js | `apps/web` | `pnpm build` | `.next` |

All three share the same build configuration:

| Setting | Value |
|---|---|
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

For each Vercel project:

1. In the Vercel dashboard, go to **Settings → Git**.
2. Connect the `nodwin-sales-crm` GitHub repository.
3. Configure branch rules:
   - **Preview (staging):** `git clone` → Vercel auto-creates preview deployments for every PR targeting `main`. No production branch needed.
   - **Sandbox:** Set production branch to `main`. Disable auto-deployment on PR — deploy only on push to `main`.
   - **Production:** Set production branch to `main`. Disable auto-deployment on PR — deploy only via the deploy workflow (manual approval).

> ✅ **GitHub checks integration:** Vercel automatically posts deployment status checks to PRs for the staging project. This integration requires no extra config — Vercel's GitHub app handles it.

---

## Step 3: Configure environment variables

Set environment variables for each Vercel project in **Settings → Environment Variables**. Vercel supports per-environment scoping (Production, Preview, Development).

### Required variables (all environments)

| Variable | Staging | Sandbox | Production | Scope |
|---|---|---|---|---|
| `NEXT_PUBLIC_APP_NAME` | `Nodwin CRM (Staging)` | `Nodwin CRM (Sandbox)` | `Nodwin CRM` | All |
| `NEXT_PUBLIC_API_URL` | `https://staging-app.vercel.app/api` | `https://sandbox-app.vercel.app/api` | `https://crm.nodwingaming.com/api` | All |
| `SUPABASE_URL` | Staging Supabase URL | Sandbox Supabase URL | Production Supabase URL | All |
| `NEXT_PUBLIC_SUPABASE_URL` | Same as `SUPABASE_URL` | Same as `SUPABASE_URL` | Same as `SUPABASE_URL` | All |
| `SUPABASE_ANON_KEY` | Staging anon key | Sandbox anon key | Production anon key | All |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same as `SUPABASE_ANON_KEY` | Same as `SUPABASE_ANON_KEY` | Same as `SUPABASE_ANON_KEY` | All |
| `SUPABASE_SERVICE_ROLE_KEY` | Staging service key | Sandbox service key | Production service key | Production + Preview |
| `APP_URL` | `https://staging-app.vercel.app` | `https://sandbox-app.vercel.app` | `https://crm.nodwingaming.com` | All |
| `POSTMARK_WEBHOOK_SECRET` | Staging secret | Sandbox secret | Production secret | Production + Preview |
| `NEXT_PUBLIC_DEBUG` | `false` | `false` | `false` | All |
| `NEXT_PUBLIC_LOG_LEVEL` | `info` | `info` | `warn` | All |
| `NEXT_PUBLIC_ENV` | `staging` | `sandbox` | `production` | All |

### Secret variables (masked)

The following must be marked **"Encrypt"** (masked in Vercel logs):

| Variable | Source |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Settings → API |
| `POSTMARK_WEBHOOK_SECRET` | Postmark → Server → Webhooks → HttpHeaders |
| `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` / `DEEPSEEK_API_KEY` / `MOONSHOT_API_KEY` / `OPENAI_COMPATIBLE_API_KEY` | AI provider dashboards — see AI provider variables below |

> **Never** expose `SUPABASE_SERVICE_ROLE_KEY`, `POSTMARK_WEBHOOK_SECRET`, the AI provider keys, or similar secrets in preview deployments for untrusted PRs. Vercel encrypts environment variables by default — ensure "Encrypt" is checked for all sensitive variables.

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

> All `*_API_KEY` values are secrets — mark them **Encrypt** and do not expose them to untrusted preview deployments. If no provider is configured (neither DB settings nor env), AI features degrade gracefully and stay disabled. Note that `OLLAMA_BASE_URL` must be reachable from Vercel's serverless/edge runtime — a `localhost` Ollama on a dev box will not resolve from a Vercel deployment.

---

## Step 4: Environment-specific settings

### Preview (Staging) — for PR previews

| Setting | Value |
|---|---|
| **Production branch** | *(none — disabled)* |
| **Auto-expose system env** | Off |
| **Vercel Authentication** | Enable Vercel Authentication (password gate) for preview deployments |

> Enable **Vercel Authentication** (Settings → Deployment Protection) on the staging project so that preview deployments are not publicly indexable. Only team members with Vercel accounts can view them.

### Sandbox

| Setting | Value |
|---|---|
| **Production branch** | `main` |
| **Auto-expose system env** | Off |

### Production

| Setting | Value |
|---|---|
| **Production branch** | `main` |
| **Auto-expose system env** | Off |
| **Custom domain** | `crm.nodwingaming.com` (or as configured in DNS) |

---

## Step 5: DNS and custom domain (production only)

1. In the Vercel production project dashboard, go to **Settings → Domains**.
2. Add `crm.nodwingaming.com` (or the production domain).
3. Follow Vercel's DNS configuration instructions — typically a `CNAME` record pointing to `cvc.vercel-dns.com`.
4. Wait for DNS propagation (5–30 minutes) and certificate provisioning (automatic via Vercel).

> All sub-environments (staging, sandbox) use `*.vercel.app` subdomains — no custom DNS required.

---

## Step 6: Google OAuth callback URLs

For each environment, add the corresponding callback URL to the Google Cloud Console OAuth 2.0 Client ID:

| Environment | Callback URL |
|---|---|
| Local dev | `http://localhost:3000/api/auth/callback` (port 3000 is the `next dev` default; adjust if you run the dev server on another port, e.g. `-p 3030`) |
| Staging (preview) | `https://<preview-url>.vercel.app/api/auth/callback` |
| Sandbox | `https://sandbox-app.vercel.app/api/auth/callback` |
| Production | `https://crm.nodwingaming.com/api/auth/callback` |

> For **Vercel Preview deployments**, the preview URL is dynamic (`<project>-<hash>-<scope>.vercel.app`). To avoid updating OAuth for every preview, either:
> - Use a wildcard in the redirect URI if Google Cloud Console supports it (it does not for web origins), or
> - Configure a **separate staging OAuth client** with the static staging deployment URL (e.g. the production branch of the staging project), and use that in preview environments.
>
> **Recommendation:** Create three separate Google OAuth Client IDs — one per environment — with static callback URLs. The staging client accepts the staging project's main deployment URL (e.g. `nodwin-crm-staging.vercel.app`). Preview deployments inherit the staging client's env vars.

---

## Step 7: Deploy workflow

### Automatic — PR previews (staging)

Every push to a PR targeting `main` triggers a Vercel preview deployment. This is automatic once the Git integration is configured.

The preview deployment URL is posted as a GitHub check. The URL format:
```
https://nodwin-crm-staging-git-<branch>-<scope>.vercel.app
```

### Manual — sandbox

Deploy to sandbox by pushing to `main` on the sandbox project. Since auto-deploy is enabled on `main` for the sandbox project, any merge to `main` triggers a sandbox redeploy.

### Manual — production (with approval gate)

Production deploys require a human in the loop. The `.github/workflows/deploy.yml` workflow handles this:

1. A PR merges to `main`.
2. The deploy workflow triggers (or is triggered manually via `workflow_dispatch`).
3. The workflow pauses for **manual approval** (Vercel deployment gate or GitHub environment approval).
4. On approval, Vercel deploys the production project.

> **Board (human) only.** No agent or automated process may deploy to production. See `BOARD_RUNBOOK.md` for the human-in-the-loop deploy procedure.

---

## Step 8: Migrations on deploy

Supabase migrations run separately from Vercel deploys. They are **not** part of the Vercel build step.

| Environment | Migration trigger |
|---|---|
| Staging / sandbox | `supabase db push` — on merge to `main` (CI step) |
| Production | Manual — `supabase db push --linked` pointed at the production project, as part of the deploy approval flow |

> If a migration fails, **halt the deploy** and surface the error to the board. Vercel will deploy the previous successful build. Do not deploy a frontend that expects schema that does not exist.

---

## Verification checklist

Before considering a Vercel environment operational:

- [ ] `pnpm build` succeeds locally for `apps/web`.
- [ ] Vercel project is connected to the correct GitHub repo.
- [ ] Root directory is set to `apps/web`.
- [ ] Build command is `pnpm build` with `pnpm install --frozen-lockfile`.
- [ ] Node.js version is 20.x.
- [ ] All required environment variables are set and scoped correctly.
- [ ] Secret variables are marked encrypted.
- [ ] AI provider key(s) set — or admin AI settings configured — if knowledge search / RAG is in use (optional otherwise).
- [ ] Google OAuth callback URL is registered for the environment.
- [ ] Supabase RLS policies pass for the linked Supabase instance.
- [ ] Production domain resolves and SSL certificate is active.
- [ ] Staging preview deployments are password-gated (not publicly accessible).

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| Build fails with "Command not found" | Root directory not set to `apps/web` | Verify **Root Directory** in Vercel project settings |
| Build fails with "module not found" | `pnpm install` step omitted or lockfile mismatch | Set install command to `pnpm install --frozen-lockfile` |
| Auth redirects to localhost | `APP_URL` not overridden per environment | Set `APP_URL` in Vercel environment variables |
| 401 on Supabase queries | `SUPABASE_SERVICE_ROLE_KEY` scoped to wrong environment | Check variable scope (Production vs Preview vs Development) |
| Blank page on custom domain | DNS not propagated or SSL not provisioned | Wait 30 min; check Vercel Domains panel for status |
| Preview deployment returns 404 | Build output dir not set | Verify **Output Directory** is `.next` |
| RLS errors on sandbox | Seed data stale or migrations not applied | Run `supabase db push --linked` against the sandbox project |
