# Supabase on the VPS — one-time setup & migrations

**The app deploy pipeline does _not_ manage Supabase.** [`deploy.yml`](../.github/workflows/deploy.yml)
only builds the app image and runs `docker compose pull app && docker compose up -d app`.
Standing up the database and **applying migrations are separate, manual steps** —
this doc covers them.

Mental model:

```
Supabase self-host stack  ──(you, manually, once)──►  running Postgres + Auth + REST
app migrations            ──(you, on first setup + after schema changes)──►  schema
app container             ──(CI pipeline, on merge to main)──►  the CRM
```

If the app boots but pages 500 with "relation does not exist", **migrations were
not applied.** That is the most common first-deploy mistake.

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

After that, routine deploys are just merge-to-main — **except** when a PR adds a
migration, where you must run Part 2 again before/with the deploy. Automating that
is tracked as a follow-up (see the deploy pipeline PR history).
