# Startup Guide

> How to get the Nodwin CRM running on your local machine for the first time.
> Covers the full setup chain: prerequisites, install, Supabase local dev, seed data, and verification.

---

## Prerequisites

| Tool | Minimum version | Install |
|---|---|---|
| **Docker Desktop** (or Docker Engine) | 24+ | https://docs.docker.com/get-docker/ |
| **Node.js** | 20+ | https://nodejs.org |
| **pnpm** | 10+ | `npm i -g pnpm` |
| **Supabase CLI** | 1.x | `brew install supabase/tap/supabase` or `npm i -g supabase` |

**Docker must be running** before any Supabase commands will work. The Supabase local stack runs entirely in containers.

---

## Step 1: Clone and install

```bash
git clone <repo-url>
cd nodwin-sales-crm
pnpm install
```

---

## Step 2: Configure environment variables

The env template lives at `apps/web/.env.example` — copy it to `apps/web/.env.local` (not the repo root):

```bash
cp apps/web/.env.example apps/web/.env.local
```

> **Why `apps/web/.env.local`?** Next.js loads env files relative to the app project root (`apps/web/`), not the monorepo root. A file at the repo root is ignored at runtime.

### Minimum variables to fill in

| Variable | What it needs |
|---|---|
| `SUPABASE_URL` | `http://localhost:54321` (for local Supabase) |
| `NEXT_PUBLIC_SUPABASE_URL` | Same as above |
| `SUPABASE_ANON_KEY` | Printed by `pnpm supabase:start` (see Step 3) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same as anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Printed by `pnpm supabase:start` |
| `GOOGLE_OAUTH_CLIENT_ID` | From Google Cloud Console |
| `GOOGLE_OAUTH_CLIENT_SECRET` | From Google Cloud Console |
| `RESEND_API_KEY` | From Resend dashboard (or Postmark equivalent) |

For local development without AI features, `ANTHROPIC_API_KEY` and others can be left blank — the app will boot with the Ollama fallback (if running locally) or gracefully degrade.

> All required vars are validated at startup by `lib/security/env.ts`. If you miss one, the server logs a clear error on boot.

---

## Step 3: Start local Supabase

```bash
pnpm supabase:start
```

This pulls the Supabase Docker images and starts the local stack. On first run it takes 2–5 minutes.

When it finishes, it prints lines like:

```
Started supabase local development setup.
         API URL: http://localhost:54321
          DB URL: postgresql://postgres:postgres@localhost:54322/postgres
      Studio URL: http://localhost:54323
    Inbucket URL: http://localhost:54324
      anon key: eyJhbGciOiJIUzI1NiIs...
service_role key: eyJhbGciOiJIUzI1NiIs...
```

Copy the **anon key** and **service_role key** into `apps/web/.env.local`.

---

## Step 4: Run migrations

```bash
pnpm db:migrate
```

Applies all SQL migrations in `supabase/migrations/` to your local database. The migrations are ordered (numbered files) and run sequentially.

---

## Step 5: Seed sandbox data

```bash
pnpm db:seed
```

Loads test data from `supabase/seed/seed-test-data.sql` (and `supabase/seed/sandbox.sql` if present). This creates sample accounts, contacts, opportunities, and users so you can explore the app without creating everything from scratch.

> **Never run seed against a production or staging Supabase project.** The seed data includes fake but plausible-looking records that would pollute real pipelines.

---

## Step 6: Start the dev server

```bash
pnpm dev
```

| URL | What it is |
|---|---|
| http://localhost:3000 | App |
| http://localhost:54323 | Supabase Studio (database browser, SQL editor, auth users) |
| http://localhost:54324 | Inbucket (captured email previews for local dev) |

---

## Verification checklist

After completing all steps, confirm:

- [ ] `pnpm dev` starts without env validation errors
- [ ] http://localhost:3000 loads and shows the login page
- [ ] Login with Google OAuth redirects to the app (or, if OAuth is not yet configured, the dev login page appears)
- [ ] Supabase Studio at http://localhost:54323 shows tables with seeded data
- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes

---

## Common commands

```bash
pnpm dev              # Dev server (frontend + supabase if running)
pnpm lint             # ESLint
pnpm typecheck        # TypeScript no-emit check
pnpm test             # Vitest unit + integration
pnpm test:e2e         # Playwright (slow; run before merging significant features)
pnpm db:migrate       # Apply pending migrations
pnpm db:reset         # Nuke local DB + re-apply all migrations + seed
pnpm db:seed          # Load sandbox test data
pnpm db:test          # Run RLS policy test suite (pgTAP)
pnpm rls:check        # Check RLS coverage across all tables
pnpm build            # Production build
```

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| `supabase:start` fails with "Cannot connect to Docker" | Docker is not running | Start Docker Desktop/Engine and retry |
| `pnpm dev` fails with env validation error | Missing or incorrect env var | Check `apps/web/.env.local`; run `pnpm supabase:start` to get anon/service keys |
| `pnpm db:migrate` fails | Supabase local stack not started | Run `pnpm supabase:start` first |
| Auth redirects to localhost | `APP_URL` not set in `.env.local` | Set `APP_URL=http://localhost:3000` |
| Google OAuth returns "redirect_uri_mismatch" | Callback URL not registered | Add `http://localhost:3000/api/auth/callback` to Google Cloud Console OAuth client |
| Seed fails with "relation does not exist" | Migrations not yet applied | Run `pnpm db:migrate` before `pnpm db:seed` |
| App loads but shows 401 on queries | Anon key mismatch | Copy the exact anon key from `pnpm supabase:start` output |
| Build fails after pulling latest | Lockfile or dependency drift | Run `pnpm install` to update lockfile, then `pnpm build` |
| Port 3000 already in use | Another process is using it | Kill the process or set `PORT=3001 pnpm dev` |

---

## Reset everything (clean rebuild)

If your local state gets corrupted:

```bash
pnpm db:reset          # Nuke and re-migrate + re-seed
# or for a truly clean slate:
pnpm supabase:start    # This also resets if already running
pnpm db:migrate
pnpm db:seed
```

---

## Related docs

| Document | What it covers |
|---|---|
| `README.md` | Project overview, stack, architecture, daily commands |
| `docs/deploy-vercel.md` | Vercel deployment for staging/sandbox/production |
| `docs/security.md` | Threat model, RLS, pre-launch checklist |
| `docs/integrations.md` | Auth, email, Slack, Google Workspace, AI, background jobs |
| `docs/data-model.md` | Full schema reference (every table and field) |
| `docs/runbook-incident.md` | Incident response procedures |
