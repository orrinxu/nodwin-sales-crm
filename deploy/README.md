# Deploy — GitHub-hosted build → DigitalOcean staging VPS

CI/CD for the Nodwin CRM. The image is **built on a GitHub-hosted runner, never
on the VPS**, pushed to ghcr, then rolled out to the staging VPS over SSH.

- Pipeline: [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)
- Image: [`Dockerfile`](../Dockerfile) → `ghcr.io/orrinxu/nodwin-sales-crm`
- App service to merge into the VPS compose: [`app.service.yml`](./app.service.yml)
- Runtime env template: [`app.env.example`](./app.env.example)
- Step-by-step deploy runbook: [`DEPLOYMENT.md`](./DEPLOYMENT.md)
- Supabase stand-up + migrations (not automated): [`SUPABASE-SETUP.md`](./SUPABASE-SETUP.md)

Target for this pipeline is **staging**. Prod is a separate ticket.

## Flow

```
push (any branch) ─▶ checks: lint · typecheck · gitleaks
push to main ──────▶ checks ─▶ build image ─▶ push ghcr (:latest + :sha-<sha>)
                                     └▶ ssh staging ─▶ docker compose pull app
                                                       docker compose up -d app
```

## Build-time vs runtime env (read this first)

Next.js **inlines `NEXT_PUBLIC_*` into the client bundle at build time**. Because
the build runs in CI, those values are passed as `docker build` **build-args**
(sourced from GitHub **vars**) and baked into the image — which makes each image
**environment-specific** (a staging image ≠ a prod image).

Everything else (`SUPABASE_*`, `POSTMARK_WEBHOOK_SECRET`, AI provider keys, …) is
read at **runtime** by `apps/web/lib/security/env.ts` and injected on the VPS via
`app.env`. One overlap: **`NEXT_PUBLIC_API_URL` is needed at both** build (client
inline) and runtime (the server parses it) — set it to the same value in both.

## One-time setup (done by a human — out of scope for the pipeline PR)

### 1. GitHub repo **variables** (Settings → Secrets and variables → Actions → Variables)
Non-secret; they ship in the client bundle:

| Var | Example |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<staging-app-host>/api` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<staging-supabase-host>` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging anon / publishable key |
| `STAGING_COMPOSE_DIR` | absolute path to the compose dir on the VPS |

### 2. GitHub repo **secrets**

| Secret | Purpose |
|---|---|
| `STAGING_SSH_HOST` | staging VPS host / IP |
| `STAGING_SSH_USER` | SSH user (in the `docker` group) |
| `STAGING_SSH_KEY` | private key for that user |
| `STAGING_SSH_PORT` | optional; defaults to 22 |

`GITHUB_TOKEN` (automatic) pushes to ghcr and is forwarded to the VPS just long
enough to `docker login ghcr.io` for the pull — no separate PAT needed.

### 3. On the VPS
1. Merge the `app:` service from [`app.service.yml`](./app.service.yml) into the
   existing Supabase compose file (the one under `STAGING_COMPOSE_DIR`).
2. `cp app.env.example app.env`, fill in real values, `chmod 600 app.env`.
3. Ensure the SSH user can run `docker` / `docker compose`.
4. First rollout can be done manually to verify:
   `docker compose pull app && docker compose up -d app`.

> ghcr note: this repo is public, so the package can be made public (no pull auth
> needed). The workflow logs in anyway, which also covers a private package.

## Rollback

Images are tagged `:latest` **and** `:sha-<full-commit-sha>`. To roll back, pin
the `app` service image to a previous sha tag and re-up:

```yaml
    image: ghcr.io/orrinxu/nodwin-sales-crm:sha-<previous-sha>
```
```bash
docker compose up -d app
```

Old `sha-` tags persist in ghcr as rollback targets (prune policy: later ticket).

## Full runtime env var reference

See [`app.env.example`](./app.env.example). Required to boot: `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `POSTMARK_WEBHOOK_SECRET`,
`NEXT_PUBLIC_API_URL`. Everything else is optional/feature-gated with schema
defaults in `apps/web/lib/security/env-schema.ts`.
```
