# Supabase Environments

> How to manage local vs production Supabase instances for the Nodwin Sales CRM.
> This covers the two scopes in the CRM's Supabase landscape:
> local development databases in the monorepo vs the cloud preview application in production.

---

## Environment map

| Environment  | Supabase                     | Purpose                   | Migration method          |
| ------------ | ---------------------------- | ------------------------- | ------------------------- |
| **Local**    | Docker via `supabase start`  | Dev + test + smoke        | `supabase migration up`   |
| **Production** | Supabase Cloud — **not yet provisioned** (create the project, then record its ref + region here) | Live CRM data | `supabase db push --linked` |

---

## Key environment variables

All environments share the same three variables. The values differ:

| Variable                       | Local                                            | Production                                               |
| ------------------------------ | ------------------------------------------------ | -------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`     | `http://192.168.88.51:54321` (or Tailscale hostname)  | `https://<project-ref>.supabase.co`                      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`| From `supabase status` output (publishable key)  | From Supabase Cloud dashboard > Settings > API           |
| `SUPABASE_SERVICE_ROLE_KEY`    | From `supabase status` output (secret key)       | From Supabase Cloud dashboard > Settings > API           |

**Env file locations:**
- Local preview: `apps/web/.env.local` (on the AMD GPU server, port 3030)
- Local dev workstation: `.env.local` at repo root (Next.js resolves from cwd)

**Tailscale note:** If you move the server or access it remotely, use the Tailscale hostname (e.g., `http://nodwin-server.tailNNNNNN.ts.net:54321`) instead of the LAN IP. This is forward-compatible with the planned office move.

---

## How to switch between environments

### Switch to local

```bash
cd /home/orrin/nodwin-sales-crm
supabase start                   # if not already running
supabase status                  # copy the publishable + secret keys
# Point NEXT_PUBLIC_SUPABASE_URL to http://192.168.88.51:54321
# Use the keys from supabase status output
pnpm dev -p 3030                 # or whatever port
```

### Switch to production

```bash
cd /home/orrin/nodwin-sales-crm
supabase login                   # one-time (opens browser)
supabase link --project-ref <project-ref>
# Update .env.local with cloud URL + cloud keys
```

**Never run `supabase db push --linked` against production from a feature branch.** Only push from `main` after merge.

---

## Migration workflow

### Local

1. Edit/add files in `supabase/migrations/`.
2. Run `supabase migration up` to apply.
3. Test: `curl -sf http://localhost:3030/contacts > /dev/null`.

### Production

1. Merge your PR to `main`.
2. Pull the latest `main` locally.
3. Ensure `supabase link` is pointed at the production project.
4. Run `supabase db push --linked`.
5. Smoke test: `curl -sf https://<your-vercel-domain>/contacts > /dev/null`.

**Golden rule:** Production migrations only land via `supabase db push` from `main` after merge. Never push from a feature branch. Never run the dev seed against production.

---

## Seed data

- **Local only.** The seed is in `supabase/seed/sandbox.sql`.
- Seed is automatically loaded when you run `supabase db reset`.
- **Never load seed data on production.** Production contains real CRM data.

---

## CI checks

The CI pipeline (`ci.yml`) runs on every PR and includes:

1. **Supabase local stack startup** — starts Dockerized Supabase, applies all migrations.
2. **RLS policy lint** — checks all policies for correctness.
3. **RLS policy coverage** — ensures every table has row-level security enabled.
4. **RLS tests** — runs `pnpm db:test` against the local stack.

Migration-specific checks run on PRs touching `supabase/migrations/**` (see `migration-ci.yml`):
- **Supabase schema lint** (`supabase db lint --local --level error`) — catches schema errors in migrations.
- `supabase db diff` against main (requires a linked Supabase project; skipped if not linked)

---

## Pre-deploy checklist

Before deploying or declaring a hosting setup complete, run the 3-check smoke procedure from [smoke-test.md](smoke-test.md):

1. **Branch guard** — confirm you are on `main`.
2. **Schema check** — verify `contacts` and `opportunities` tables exist in the target DB.
3. **Route health check** — `GET /contacts` returns HTTP 200 (not 500).

Additionally:

- [ ] `.env.local` points at the correct Supabase instance (not the wrong env).
- [ ] Supabase migrations are fully applied (no pending migrations in `supabase status`).
- [ ] At least one route under `(crm)/` returns 200 (smoke test pass).
- [ ] Seed data is loaded (local only).
- [ ] RLS is enforced (local mirrors production policies).

---

## Related documents

- [Smoke Test Procedure](smoke-test.md) — 3-check pre-deploy verification
- [Setup Guide](setup-guide.md) — full Google OAuth + Supabase Cloud setup walkthrough
- [Deploy (Vercel)](deploy-vercel.md) — Vercel deployment with per-environment Supabase wiring
- [Runbook (Incident)](runbook-incident.md) — escalation when schema/route checks fail
