# Supabase on the VPS — one-time setup & migrations

**Migrations now apply automatically on deploy** (ORR-197). [`deploy.yml`](../.github/workflows/deploy.yml)
copies `supabase/migrations/` to the VPS and runs
[`deploy/apply-migrations.sh`](apply-migrations.sh) — an idempotent runner that
applies any migration not yet in the `public._applied_migrations` ledger, in
order, **before** the new app container starts. You only stand up the Supabase
stack itself by hand (once, per Part 1).

Mental model:

```
Supabase self-host stack  ──(you, manually, once)──►  running Postgres + Auth + REST
app migrations            ──(CI pipeline, every deploy, idempotent)──►  schema
app container             ──(CI pipeline, on merge to main)──►  the CRM
```

**Bootstrapping an existing DB:** the runner tracks applied migrations in
`public._applied_migrations`. On a database whose migrations were applied before
this ledger existed, seed it first so the runner doesn't re-run them:

```sql
CREATE TABLE IF NOT EXISTS public._applied_migrations (
  filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
-- mark every already-applied migration file as done (no ON CONFLICT harm):
INSERT INTO public._applied_migrations(filename)
VALUES ('20250101000000_example.sql'), … ON CONFLICT DO NOTHING;
```

A **fresh** prod DB needs no seeding — the runner applies everything in order on
the first deploy. Part 2 below (`supabase db push`) is now only for local/manual
use; production relies on the pipeline.

If the app boots but pages 500 with "relation does not exist", check the deploy
log's "apply-migrations" step — a failing migration aborts the deploy (ON_ERROR_STOP).

---

## Part 1 — Stand up self-hosted Supabase (once)

On the VPS:

```bash
git clone --depth 1 https://github.com/supabase/supabase
cp supabase/docker/.env.example supabase/docker/.env
cd supabase/docker
```

Edit `.env` and set at minimum:

| Key | Notes |
|---|---|
| `POSTGRES_PASSWORD` | strong, unique — this is your DB superuser password |
| `JWT_SECRET` | 40+ char random secret |
| `ANON_KEY` / `SERVICE_ROLE_KEY` | generate from `JWT_SECRET` (see Supabase self-host docs) |
| `SITE_URL` / `API_EXTERNAL_URL` | your staging app + Supabase URLs |
| `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` | Studio basic-auth |
| `SMTP_*` | if you want auth emails to send |

Then:

```bash
docker compose up -d
docker compose ps        # confirm db, auth, rest, kong all healthy
```

Put the Supabase API (Kong, port 8000) and the app behind your TLS reverse proxy.
This is `STAGING_COMPOSE_DIR` — the same compose file you merge the `app:` service
into (see [`app.service.yml`](./app.service.yml)).

> The `SERVICE_ROLE_KEY` / `ANON_KEY` you set here are the values that go into the
> app's runtime env (`app.env`) and the GitHub build vars — they must match.

---

## Part 2 — Apply the app's migrations (first setup + every schema change)

The migrations live in [`supabase/migrations/`](../supabase/migrations). Push them
from your machine (needs the Supabase CLI) straight at the VPS Postgres:

```bash
# DB_URL points at the self-hosted Postgres. Port is 5432 direct, or 6543 if you
# route through Supavisor/pooler. Password = POSTGRES_PASSWORD from Part 1.
export DB_URL="postgresql://postgres:<POSTGRES_PASSWORD>@<vps-host>:5432/postgres"

supabase db push --db-url "$DB_URL"
```

`supabase db push` is idempotent — it applies only migrations the DB hasn't seen.
Run it **before the first app deploy**, and again **after merging any PR that adds
a migration**.

### Optional: seed the org scaffold + admin login

```bash
psql "$DB_URL" -f supabase/seed/sandbox.sql
```

This loads the Nodwin entities + business units and the Super Admin
(`orrinxu@gmail.com`). **Rotate that password immediately on staging** — it is a
dev default baked into the seed. (`pnpm db:seed` targets the _local_ stack only;
for the VPS use the `psql` line above.)

---

## Part 3 — Order of operations for a fresh staging box

1. Part 1 — bring up Supabase.
2. Part 2 — `supabase db push` (and optionally seed).
3. Wire GitHub vars/secrets + merge the `app:` service ([`DEPLOYMENT.md`](./DEPLOYMENT.md)).
4. Merge to main (or **Actions → Deploy → Run workflow**) → app image rolls out.
5. Verify: `curl -I https://<app-url>/login` → `200`.

After that, routine deploys are just merge-to-main — including migration-bearing
PRs. The deploy pipeline runs [`apply-migrations.sh`](apply-migrations.sh) on the
VPS before each app rollout (ORR-197), so Part 2 is only for the first box or a
manual/local push, never a per-migration chore.
