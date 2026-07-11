# Supabase Environments

> How the CRM's Supabase instances are managed across environments.
>
> The app runs on a self-hosted stack: a Docker container for the Next.js app and
> **self-hosted Supabase** (via `docker compose`) on a DigitalOcean VPS. We do not
> use Supabase Cloud or Vercel. The canonical deploy docs are in
> [`deploy/`](../deploy/) — this doc is the environment/migration reference.

---

## Environment map

| Environment  | Supabase                                             | Purpose                     | Migration method                    |
| ------------ | ---------------------------------------------------- | --------------------------- | ----------------------------------- |
| **Local**    | Docker via `supabase start`                          | Dev + test + smoke          | `supabase migration up` / `db reset`|
| **Staging**  | Self-hosted (docker compose) on the DigitalOcean VPS | Pre-prod / UAT              | Auto-applied on deploy (ORR-197)    |
| **Production** | Self-hosted on a VPS — **not yet provisioned** (separate ticket) | Live CRM data | Auto-applied on deploy (ORR-197)    |

Standing up self-hosted Supabase is manual (once) — see
[`deploy/SUPABASE-SETUP.md`](../deploy/SUPABASE-SETUP.md). **Migrations, however,
apply automatically on every deploy** (ORR-197): the app deploy pipeline
([`deploy.yml`](../.github/workflows/deploy.yml)) copies `supabase/migrations/` to
the VPS and runs [`deploy/apply-migrations.sh`](../deploy/apply-migrations.sh) — an
idempotent runner tracked by the `public._applied_migrations` ledger — **before**
the new app container starts.

---

## Key environment variables

All environments share the same variables; the values differ:

| Variable                        | Local                                                | Staging (DO VPS)                                     |
| ------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `http://192.168.88.51:54321` (or Tailscale hostname) | `https://<your-supabase-host>` (your own domain)     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | From `supabase status` output (publishable key)      | The `ANON_KEY` from the self-host Supabase `.env`     |
| `SUPABASE_SERVICE_ROLE_KEY`     | From `supabase status` output (secret key)           | The `SERVICE_ROLE_KEY` from the self-host `.env`      |

**Env file locations:**
- Local preview: `apps/web/.env.local` (on the AMD GPU server, port 3030)
- Local dev workstation: `.env.local` at repo root (Next.js resolves from cwd)
- Staging: `app.env` beside the compose file on the VPS (see [`deploy/app.env.example`](../deploy/app.env.example))

**Tailscale note:** If you move the server or access it remotely, use the Tailscale
hostname (e.g., `http://nodwin-server.tailNNNNNN.ts.net:54321`) instead of the LAN IP.

---

## How to switch between environments

### Local

```bash
supabase start                   # if not already running
supabase status                  # copy the publishable + secret keys
# Point NEXT_PUBLIC_SUPABASE_URL at http://192.168.88.51:54321, use those keys
pnpm dev -p 3030
```

### Staging (DO VPS)

Staging runs on the VPS itself — you don't "switch" a local `.env` to it. Deploys
happen via the pipeline (merge to `main`), which applies any pending migrations at
the VPS Postgres before rolling the app. See
[`deploy/DEPLOYMENT.md`](../deploy/DEPLOYMENT.md).

---

## Migration workflow

### Local

1. Edit/add files in `supabase/migrations/`.
2. Run `supabase migration up` (or `supabase db reset` for a clean rebuild + seed).
3. Test: `curl -sf http://localhost:3030/contacts > /dev/null`.

### Staging

Migrations are applied **automatically by the app deploy** (ORR-197): merging a
migration-bearing PR to `main` runs [`deploy/apply-migrations.sh`](../deploy/apply-migrations.sh)
on the VPS before the new app container starts. No manual `supabase db push` step
is needed for routine deploys.

For a first-time box (or a manual/local push), the fallback is:

```bash
supabase db push --db-url "postgresql://postgres:<password>@<vps-host>:5432/postgres"
```

**Golden rule:** never run the dev seed against real data. Full setup + the
optional seed are in [`deploy/SUPABASE-SETUP.md`](../deploy/SUPABASE-SETUP.md).

---

## Seed data

- **Local + fresh staging.** The seed is in `supabase/seed/sandbox.sql` (Nodwin
  entities + business units + a Super Admin login).
- Loaded automatically by `supabase db reset` locally; on the VPS, apply it once
  with `psql "$DB_URL" -f supabase/seed/sandbox.sql`.
- **Rotate the seeded admin password on staging** — it is a dev default.
- **Never load the seed over real production data.**

---

## CI checks

The CI pipeline (`ci.yml`) runs on every PR and includes:

1. **Supabase local stack startup** — starts Dockerized Supabase, applies all migrations.
2. **RLS policy lint** — checks all policies for correctness.
3. **RLS policy coverage** — ensures every table has row-level security enabled.
4. **RLS tests** — runs `pnpm db:test` against the local stack.

Migration-specific checks run on PRs touching `supabase/migrations/**` (see `migration-ci.yml`):
- **Supabase schema lint** (`supabase db lint --local --level error`) — catches schema errors in migrations.
- `supabase db diff` against main (requires a linked project; skipped if not linked).

The cheap checks (lint · typecheck · gitleaks) also run on every push via
[`deploy.yml`](../.github/workflows/deploy.yml).

---

## Pre-deploy checklist

Before deploying or declaring a hosting setup complete, run the 3-check smoke procedure from [smoke-test.md](smoke-test.md):

1. **Branch guard** — confirm you are on `main`.
2. **Schema check** — verify `contacts` and `opportunities` tables exist in the target DB.
3. **Route health check** — `GET /contacts` returns HTTP 200 (not 500).

Additionally:

- [ ] `app.env` / `.env.local` points at the correct Supabase instance (not the wrong env).
- [ ] Supabase migrations are fully applied (the deploy's `apply-migrations` step succeeded — check the deploy log).
- [ ] At least one route under `(crm)/` returns 200 (smoke test pass).
- [ ] Seed data is loaded (local / fresh staging only).
- [ ] RLS is enforced (local mirrors staging policies).

---

## Related documents

- [Deploy runbook](../deploy/DEPLOYMENT.md) — step-by-step DO VPS deploy
- [Supabase VPS setup](../deploy/SUPABASE-SETUP.md) — self-host bring-up + migrations
- [Smoke Test Procedure](smoke-test.md) — 3-check pre-deploy verification
- [Setup Guide](setup-guide.md) — Google OAuth setup for self-hosted Supabase
- [Runbook (Incident)](runbook-incident.md) — escalation when schema/route checks fail
