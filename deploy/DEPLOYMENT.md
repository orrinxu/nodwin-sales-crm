# How to deploy (staging)

A step-by-step runbook for shipping the Nodwin CRM to the staging DigitalOcean
VPS. The pipeline **builds on GitHub, never on the VPS**, pushes to ghcr, and
rolls the container over SSH.

> Reference (what each piece is): [`README.md`](./README.md).
> One-time setup below is done **once**; after that, deploying is just
> **merge to `main`**.

---

## 0. Prerequisites (once)

- Staging VPS reachable over SSH, running Docker + the Supabase self-host
  `docker compose` stack. **Standing that up + applying migrations is manual and
  not part of the pipeline** — see [`SUPABASE-SETUP.md`](./SUPABASE-SETUP.md) first.
- You're an admin on the `orrinxu/nodwin-sales-crm` GitHub repo.
- You know the two staging URLs:
  - **app URL** — where the CRM will be served, e.g. `https://crm-staging.example`
  - **Supabase URL** — the staging Supabase API, e.g. `https://sb-staging.example`

---

## 1. Add GitHub **variables** (non-secret — baked into the client bundle)

Repo → **Settings → Secrets and variables → Actions → Variables → New variable**:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<app-url>/api` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<supabase-url>` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging anon / publishable key |
| `STAGING_COMPOSE_DIR` | absolute path to the compose dir on the VPS, e.g. `/opt/supabase` |

## 2. Add GitHub **secrets**

Same page → **Secrets** tab. Generate a deploy key on your machine:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/nodwin_staging -N "" -C "gha-deploy-staging"
# add the PUBLIC key to the VPS deploy user:
ssh-copy-id -i ~/.ssh/nodwin_staging.pub <user>@<vps-host>
```

Then create:

| Secret | Value |
|---|---|
| `STAGING_SSH_HOST` | VPS host / IP |
| `STAGING_SSH_USER` | the `<user>` above (must be in the `docker` group) |
| `STAGING_SSH_KEY` | contents of the **private** key `~/.ssh/nodwin_staging` |
| `STAGING_SSH_PORT` | only if not 22 |

`GITHUB_TOKEN` is automatic — no ghcr PAT needed.

## 3. Prepare the VPS (once)

```bash
ssh <user>@<vps-host>
cd <STAGING_COMPOSE_DIR>          # same path you set above
```

1. **Add the app service** to the compose file: copy the `app:` service from
   [`app.service.yml`](./app.service.yml) into your Supabase `docker-compose.yml`
   (under its `services:`). Don't touch the Supabase services.
2. **Create the runtime env file** next to the compose file:
   ```bash
   # paste from deploy/app.env.example, then:
   nano app.env          # fill in real values
   chmod 600 app.env
   ```
   Required: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `POSTMARK_WEBHOOK_SECRET`, `NEXT_PUBLIC_API_URL` (same value as the build var).
3. **Reverse proxy / TLS** (your existing setup): route your app domain to the
   `app` container's port `3000`. (Out of scope for the pipeline; a plain
   `3000:3000` port mapping works for a first smoke test.)

---

## 4. First deploy

Two ways — pick one:

**A. Manual trigger (recommended for the first run)**
GitHub → **Actions → Deploy → Run workflow** on `main`. Watch the
`build-and-deploy` job: it builds, pushes to ghcr, SSHes in, and rolls `app`.

**B. Merge to main**
Open your PR → merge. The push to `main` runs the same job automatically.

Verify:
```bash
ssh <user>@<vps-host> "cd <STAGING_COMPOSE_DIR> && docker compose ps app"
curl -I https://<app-url>/login      # expect HTTP 200
```

---

## 5. Routine deploys

Just **merge to `main`.** Every merge:
`checks → build image → push ghcr (:latest + :sha-<sha>) → ssh → compose pull/up app`.

Cheap `checks` (lint · typecheck · gitleaks) also run on **every push to any
branch**, so you get fast feedback before the PR.

---

## 6. Rollback

Images are tagged `:latest` and `:sha-<commit-sha>`. To revert:

```bash
ssh <user>@<vps-host>
cd <STAGING_COMPOSE_DIR>
# edit the app service image to a known-good sha:
#   image: ghcr.io/orrinxu/nodwin-sales-crm:sha-<previous-sha>
docker compose up -d app
```

Find previous shas under the repo's **Packages** (ghcr) or in the git log.

---

## 7. Troubleshooting

| Symptom | Where to look / fix |
|---|---|
| `checks` job red | Open the failed step. gitleaks findings are printed (redacted); lint/typecheck mirror `pnpm lint` / `pnpm typecheck` locally. |
| Deploy step: `docker compose pull` **denied** | The VPS couldn't auth to ghcr. If the package is private, make it public (repo → Packages → package → visibility), or confirm the login step ran. |
| Container keeps restarting | `docker compose logs app` on the VPS. Usually a missing **required** env var in `app.env` (the app throws on boot via `env.ts`). |
| App up but browser can't reach Supabase | Check `NEXT_PUBLIC_SUPABASE_URL` **build var** (baked) and `SUPABASE_URL` in `app.env` (runtime). Both must point at the reachable staging Supabase. |
| Healthcheck `unhealthy` | It fetches `/login` on port 3000 inside the container; confirm the app booted (logs) and `PORT`/`HOSTNAME` weren't overridden. |
| Changed a `NEXT_PUBLIC_*` value | It's baked at build — you must **re-deploy** (rebuild), not just restart. |
