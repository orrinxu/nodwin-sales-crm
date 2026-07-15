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
  `docker compose` stack. **Standing up the Supabase stack is manual (once)** — see
  [`SUPABASE-SETUP.md`](./SUPABASE-SETUP.md) first. **Migrations, once the stack is
  up, apply automatically on every deploy** (ORR-197), so there is no manual
  migration step in routine deploys.
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
| `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` | Google OAuth client id (used by Google sign-in + the Drive Picker import) |
| `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY` | Google Picker API key (Drive → Storage import) |
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
`checks → build image → push ghcr (:latest + :sha-<sha>) → ssh → apply-migrations → compose pull/up app`.
The `apply-migrations` step runs [`apply-migrations.sh`](./apply-migrations.sh) on
the VPS **before** the new container starts, so the app never boots against an
un-migrated schema (a failing migration aborts the deploy).

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

## 7. Voice transcription (Whisper) — optional add-on

Lights up the **"Record a voice note"** option in the account/contact generators
(ORR-741). It's hidden until a transcription endpoint is configured, so this is
what turns it on. Runs as a sibling container on the same compose — see
[`whisper.service.yml`](./whisper.service.yml).

```bash
ssh <user>@<vps-host>
cd <STAGING_COMPOSE_DIR>
```

1. **Add the whisper service** to the same `docker-compose.yml` that holds `app`
   (so they share the internal network): copy the `whisper:` service **and** the
   `whisper-hf-cache` volume from [`whisper.service.yml`](./whisper.service.yml).
2. **Start it** (first run downloads the model, ~1–2 min):
   ```bash
   docker compose up -d whisper
   docker compose logs -f whisper      # wait for "Uvicorn running on ...:8000"
   ```
3. **Point the CRM at it** — no app restart needed. In the app, go to
   **Admin → AI → Transcription endpoint (voice notes)** and set:
   - **Base URL:** `http://whisper:8000/v1`  ← internal compose DNS; the app
     reaches the container by service name
   - **Model:** `Systran/faster-whisper-small` (must match `WHISPER__MODEL`)
   - tick **Voice transcription enabled**, Save.

   (Alternatively, set `TRANSCRIPTION_BASE_URL` / `TRANSCRIPTION_MODEL` in
   `app.env` and `docker compose up -d app` — env is the fallback, the DB setting
   wins.)
4. **Verify.** Reload **Create Contact** → the "Record a voice note" tile now
   appears. Or check the endpoint from the app container:
   ```bash
   docker compose exec app node -e "fetch('http://whisper:8000/v1/models').then(r=>r.text()).then(console.log)"
   ```

**Sizing.** CPU is fine for dictated notes (bursty, not streaming). `small`
needs ~2 GB RAM; drop to `Systran/faster-whisper-base.en` (~1 GB) if the droplet
is tight, updating **both** `WHISPER__MODEL` and the CRM's Model field. Keep the
container **off the public internet** — it has no auth; the app reaches it only
on the internal network.

---

## 8. Troubleshooting

| Symptom | Where to look / fix |
|---|---|
| Voice tile missing after setup | The CRM gates it on `isTranscriptionAvailable()` — Base URL **and** Model must be set and the toggle on. Re-open the Create dialog after saving. |
| `whisper` restarts / OOM | Model too big for the droplet — switch to `base.en`/`tiny.en`. Check `docker compose logs whisper` and `docker stats`. |
| Transcribe says "service is busy" | The endpoint returned 429/5xx or timed out (the seam retries then degrades). Check `docker compose logs whisper`; a cold first request downloads the model. |
| `checks` job red | Open the failed step. gitleaks findings are printed (redacted); lint/typecheck mirror `pnpm lint` / `pnpm typecheck` locally. |
| Deploy step: `docker compose pull` **denied** | The VPS couldn't auth to ghcr. If the package is private, make it public (repo → Packages → package → visibility), or confirm the login step ran. |
| Container keeps restarting | `docker compose logs app` on the VPS. Usually a missing **required** env var in `app.env` (the app throws on boot via `env.ts`). |
| App up but browser can't reach Supabase | Check `NEXT_PUBLIC_SUPABASE_URL` **build var** (baked) and `SUPABASE_URL` in `app.env` (runtime). Both must point at the reachable staging Supabase. |
| Healthcheck `unhealthy` | It fetches `/login` on port 3000 inside the container; confirm the app booted (logs) and `PORT`/`HOSTNAME` weren't overridden. |
| Changed a `NEXT_PUBLIC_*` value | It's baked at build — you must **re-deploy** (rebuild), not just restart. |
