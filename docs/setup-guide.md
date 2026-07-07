# Setup guide: Google OAuth, self-hosted Supabase, and magic link email

> How to configure authentication for the Nodwin CRM from scratch.
> Covers configuring the self-hosted Supabase project, Google OAuth credential setup, magic link configuration, and environment wiring.

## Quick start — a personal test setup without a company domain

If you don't have a Nodwin Group domain or Google Workspace access yet, use this abbreviated path to get a working personal test setup with your own personal accounts. Each step below is a simplified version of the full section listed in parentheses.

1. **Supabase project** (§1) — for a dev setup, use the local Supabase stack via `pnpm supabase:start` (Docker required). For a shared instance, bring up the self-hosted Supabase stack on the VPS per `../deploy/SUPABASE-SETUP.md`.
2. **Google OAuth** (§2.1) — create a GCP project using your personal Gmail. Set the OAuth consent screen to **External** (not Internal). Add your personal email(s) as test users. When registering redirect URIs in GCP, use **only** `https://<your-supabase-host>/auth/v1/callback` — Supabase is the OAuth broker, not the app. The app's own domains (the DO app URL, localhost) belong in **Supabase's** Redirect URLs allowlist (under Authentication > Settings), not in GCP.
3. **Supabase Auth** (§3) — enable the Google provider. In **Authentication > Settings**, add your app URL(s) to **Redirect URLs**. Skip the domain allowlist trigger during dev (see §3.2).
4. **Magic link email** (§4) — use Supabase's built-in email sender for dev (skip custom SMTP). Or create a free Resend account and use their sandbox sender (`onboarding@resend.dev`) — no DNS setup needed.
5. **Env vars** (§5) — use the Supabase host URL and anon key (from the self-host stack's `.env`, or from `pnpm supabase:start` output for local dev).
6. **Local dev** (§6) — test on `http://localhost:3000`. Sign in with your personal Google account.
7. **Deploy** (§8) — deploy the app as a Docker container on the DO VPS (see `../deploy/DEPLOYMENT.md`). Use a stable domain behind your reverse proxy as your app URL (see §2.1). Add the final URL to Supabase's Redirect URLs, not GCP.

> **Everything below this point** describes the full production setup with Nodwin Group domains, Google Workspace, SPF/DKIM/DMARC, and the domain allowlist. For a personal/dev setup you can skip sections 2.1 (stable domain guidance still applies), 2.2, 3.2 (domain allowlist trigger), 4.3 (SPF/DKIM/DMARC), and the production domain setup in §8.

---

## Table of contents

1. [Configure the self-hosted Supabase project](#1-configure-the-self-hosted-supabase-project)
2. [Configure Google OAuth credentials](#2-configure-google-oauth-credentials)
3. [Wire up Supabase Auth](#3-wire-up-supabase-auth)
4. [Configure magic link email (custom SMTP)](#4-configure-magic-link-email-custom-smtp)
5. [Environment variables](#5-environment-variables)
6. [Verify it works](#6-verify-it-works)
7. [Run migrations against the self-hosted database](#7-run-migrations-against-the-self-hosted-database)
8. [Deployment](#8-deployment)

---

## 1. Configure the self-hosted Supabase project

Supabase is **self-hosted** on the DigitalOcean VPS via `docker compose` — there is no Supabase Cloud project. The full bring-up (containers, secrets, domain, TLS) is documented in `../deploy/SUPABASE-SETUP.md`. The dev model is: a local Supabase stack (`pnpm supabase:start`) for individual development, plus one self-hosted staging stack on the VPS. There are no managed cloud environments and no per-PR cloud previews.

1. Bring up the self-hosted Supabase stack on the VPS per `../deploy/SUPABASE-SETUP.md` (or use `pnpm supabase:start` for local dev).
2. Set a strong **Postgres password** in the self-host `.env`. Store it in 1Password / vault.
3. Point the stack at your own domain (e.g. `supabase.crm.nodwingroup.com`) behind your reverse proxy — this is your Supabase host URL, not a `*.supabase.co` URL.
4. Note the **Supabase host URL** and the **API keys** (`ANON_KEY` + `SERVICE_ROLE_KEY`) — these come from the self-host stack's `.env`, not a cloud dashboard.

---

## 2. Configure Google OAuth credentials

Auth is restricted to Nodwin Group Google Workspace domains (e.g. `@nodwingroup.com`). A Google Cloud Platform project is needed to create the OAuth 2.0 client.

### 2.1 Create a GCP project (one per CRM environment)

> **Plan your URLs before creating the OAuth client.** Google does not support wildcards in authorized origins or redirect URIs. Use a **single stable domain** for each environment served off the VPS reverse proxy:
>
> - A custom subdomain like `staging-crm.nodwingroup.com` pointed at the DO VPS via an A/CNAME record and terminated by your reverse proxy.
> - A personal domain subdomain like `nodwin-crm-staging.yourname.dev` — useful for dev sandboxes without company DNS access.
>
> Register only this one stable URL in GCP. The app runs as a single Docker container behind a fixed domain, so there are no ephemeral per-branch URLs to manage.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a new project named `Nodwin CRM <environment>`.
2. Navigate to **APIs & Services > OAuth consent screen**.
   - **User type:** Choose based on your stage:
     - **Internal** — production only. Requires a Nodwin Group Google Workspace account. Only workspace users can sign in.
     - **External** — dev/staging without a company domain. Use your personal Gmail. Add test email addresses under **Test users** (up to 100). No verified domain needed.
   - **App name:** `Nodwin CRM (<environment>)`
   - **Support email:** Your GCP project owner email.
   - **Authorized domains:** Add `nodwingroup.com` and your production domain (e.g. `crm.nodwingroup.com`). Leave empty for External (dev) type.
   - **Scopes:** Add `openid`, `profile`, `email`. No additional scopes are needed.
3. Navigate to **APIs & Services > Credentials**.
4. Click **Create Credentials > OAuth client ID**.
   - **Application type:** `Web application`
   - **Name:** `Nodwin CRM <environment> web client`
   - **Authorized JavaScript origins:** Register only **one stable URL per environment**:
     - `http://localhost:3000` (local dev)
     - `https://<your-stable-staging-domain>` (staging — see callout above)
     - `https://crm.nodwingroup.com` (production)
   - **Authorized redirect URIs:** Register exactly one URI per environment. When Supabase is the OAuth broker (which it is in this setup), Google redirects to Supabase's callback endpoint, not the app's:
      - `https://<your-supabase-host>/auth/v1/callback`
   - **Do not** add app-specific paths like `/auth/callback` here. The app's callback URLs belong in **Supabase's** Redirect URLs (Authentication > Settings), not in GCP.
   - Click **Create**.
5. Copy the **Client ID** and **Client Secret**. Store them in 1Password / vault.

> **One redirect URI per GCP client, period.** Since the Supabase callback URL (`https://<your-supabase-host>/auth/v1/callback`) is the same for all environments served by that Supabase project, you only need one entry. The Supabase project itself redirects to the correct app URL after authentication based on its **Site URL** and **Redirect URLs** settings — configure those per environment in the Supabase dashboard.

### 2.2 Restrict by domain (optional but recommended)

In the GCP OAuth consent screen settings, under **Test users**, you can add individual test accounts. Once the app is verified (internal apps don't need verification), only your Workspace domain users will be able to sign in. The `auth_allowed_domains` table + Auth Hook in §3.2 enforces the domain allowlist on the backend, so this GCP restriction is a defence-in-depth measure.

---

## 3. Wire up Supabase Auth

### 3.1 Enable Google provider

1. In the Supabase Dashboard, go to **Authentication > Providers**.
2. Find **Google** and toggle it on.
3. Paste the **Client ID** and **Client Secret** from step 2.1.
4. Save.

### 3.2 Enforce domain allowlist via `auth_allowed_domains` + Auth Hook

Supabase does not have a built-in dashboard setting to restrict sign-up by email domain. Domain enforcement is **table-driven**: the allowed domains live in the `public.auth_allowed_domains` table, and a Supabase **Auth Hook** Edge Function queries that table on every sign-up attempt and rejects emails whose domain is not present.

The table and its seed rows already exist in the repo — see migration `supabase/migrations/20260504081413_auth_allowed_domains.sql`. It creates:

```sql
create table if not exists public.auth_allowed_domains (
  id         uuid        primary key default gen_random_uuid(),
  domain     text        not null unique,
  created_at timestamptz not null default now()
);
```

RLS is enabled with `service_role`-only policies (the identity the auth-hook Edge Function runs as); `anon` and `authenticated` receive no policies and are blocked. The migration seeds the default permitted domains (`nodwin.com`, `trinitygaming.in`, `maxlevel.gg`).

To change the allowlist, insert/delete rows in `public.auth_allowed_domains` (via a migration or as `service_role`) rather than editing any hand-rolled trigger. Make sure the Auth Hook is enabled and pointed at the sign-up validation Edge Function in **Authentication > Hooks**.

> **Dev shortcut:** Leave the Auth Hook disabled during development so any email domain can sign up. The table is still applied by migrations, but without the hook wired up nothing enforces it.

> **Warning — Site URL per environment:** Each Supabase project's **Site URL** (under **Authentication > Settings**) must point at its own environment's frontend. This URL is used as the redirect target in magic link emails. A staging Supabase project with Site URL set to `https://crm.nodwingroup.com` will send magic links that redirect users to production. Set:
> - Staging project → `https://<your-stable-staging-domain>`
> - Production project → `https://crm.nodwingroup.com`

### 3.3 Enable magic link / email-only auth

The CRM uses **magic link only** (no password). Users enter their work email, receive a one-time link, and click it to sign in.

1. Go to **Authentication > Providers**.
2. Find **Email** and ensure it is enabled.
3. Under **Email > Settings**:
   - **Confirm email:** On (users must confirm their email before signing in).
   - **Secure email change:** On (requires both old and new email confirmation).
4. Save.

There is no Supabase-level toggle to disable password-based sign-in. The application enforces magic-link-only at the UI layer by calling `signInWithOtp()` on the Supabase client (see `components/auth/magic-link-form.tsx`) rather than exposing a password form. To prevent server-side impersonation, also verify the email domain via the `auth_allowed_domains` Auth Hook in §3.2 and ensure the anon key is not abused in client code.

---

## 4. Configure magic link email (custom SMTP)

Supabase's built-in email sender has low deliverability. For a production CRM handling client RFPs and deal data, custom SMTP with proper SPF/DKIM/DMARC is mandatory.

### 4.1 Choose an email provider

Two options, in order of preference:

| Provider | Why | Why not |
|---|---|---|
| **Resend** | SDK-first, great deliverability, simple API, used elsewhere in the stack | Separate vendor to manage |
| **Postmark** | Gold-standard deliverability, used for inbound email parsing | More expensive per email |

> Start with **Resend**. The stack already uses it for transactional email.
>
> **Dev shortcut:** Skip custom SMTP and use Supabase's built-in email sender. Magic links will still work — they just may land in spam. Or create a free Resend account and use their sandbox sender (`onboarding@resend.dev`) — no DNS configuration needed.

### 4.2 Set up custom SMTP in Supabase

1. Go to **Authentication > Settings** (not **Authentication > Providers**).
2. Scroll to the **SMTP Settings** section.
3. Toggle **Custom SMTP** on.
4. Fill in:
   - **Sender name:** `Nodwin CRM`
   - **Sender email:** `crm@nodwingroup.com` (must match the domain you set up SPF/DKIM/DMARC for)
   - **Host:** `smtp.resend.com` (or your Postmark SMTP host)
   - **Port:** `465` (SSL)
   - **Username:** `resend` (literal — Resend uses the string `resend` as the SMTP username)
   - **Password:** Your Resend API key (this is the SMTP password)
5. Click **Save**.
6. Click **Send test email** to verify. The test email should arrive in seconds.

### 4.3 Configure SPF, DKIM, and DMARC

Before sending any real emails, configure DNS for the sending domain (e.g. `nodwingroup.com`):

1. **SPF:** Add a TXT record: `v=spf1 include:spf.resend.com ~all` (or Postmark equivalent). This tells receiving mail servers that Resend is authorised to send on behalf of the domain.
2. **DKIM:** Add the DKIM TXT record from Resend (or Postmark) to the domain's DNS. This cryptographically signs each email so the recipient can verify it wasn't forged.
3. **DMARC:** Start with a monitoring policy and tighten over time:
   - **Week 1:** `v=DMARC1; p=none; rua=mailto:dmarc@nodwingroup.com` — monitor reports only, no enforcement.
   - **Week 2+:** `v=DMARC1; p=quarantine; rua=mailto:dmarc@nodwingroup.com` — quarantine failures.
   - **Eventually:** `v=DMARC1; p=reject; rua=mailto:dmarc@nodwingroup.com` — reject failures outright.

> **Do not send a single user-facing email until SPF/DKIM/DMARC are in place.** Without them, magic link emails land in spam or are rejected. This is a pre-launch blocker (see `docs/security.md`).

---

## 5. Environment variables

All auth-related environment variables are listed here. Copy these into `.env.local` for local development, and into the app's `app.env` on the VPS (plus GitHub Actions build vars for any `NEXT_PUBLIC_*` build-time values) for the deployed environment.

```bash
# --- Supabase ---
SUPABASE_URL=https://<your-supabase-host>
NEXT_PUBLIC_SUPABASE_URL=https://<your-supabase-host>
SUPABASE_ANON_KEY=<anon-key-from-supabase-settings>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-from-supabase-settings>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-from-supabase-settings>

# --- Email (Postmark inbound webhook) ---
POSTMARK_WEBHOOK_SECRET=<postmark-webhook-secret>

# --- App ---
APP_URL=http://localhost:3000  # OAuth callback base URL; change per environment
NEXT_PUBLIC_APP_NAME=Nodwin CRM
NEXT_PUBLIC_API_URL=http://localhost:3001/api  # change per environment
```

> **Google OAuth client secret is Supabase-dashboard-side only.** The app never reads `GOOGLE_OAUTH_CLIENT_SECRET`; the Google client ID/secret are pasted into the Supabase Dashboard (Authentication > Providers > Google, see §3.1) where Supabase brokers the OAuth handshake. Do not add it to the app env block.

> See `apps/web/.env.example` for the full, authoritative list (including optional AI-provider keys). The vars above are the auth/app essentials.

> **What about `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID`?** When using Supabase as the OAuth broker (Google provider configured in Supabase dashboard), the frontend never reads the Google client ID directly — Supabase handles the OAuth handshake. This variable is not needed.
>
> If the app later makes direct Google API calls (Gmail, Drive, Calendar) from the frontend, the Google client ID would be reintroduced for a separate token exchange. That is a future concern.

> **Security note:** `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS and can impersonate any user. Never expose it to the browser — it must only appear in server-side code or environment variables prefixed without `NEXT_PUBLIC_`. (The Google OAuth client secret is likewise sensitive, but it lives in the Supabase Dashboard, not the app env — see above.)

### Environment-specific overrides

| Variable | Local | Staging (DO VPS) | Production (future) |
|---|---|---|---|
| `APP_URL` | `http://localhost:3000` | `https://staging-crm.nodwingroup.com` | `https://crm.nodwingroup.com` |
| Supabase | local stack | self-hosted stack on the VPS | future/separate self-hosted stack |
| Google OAuth client | dev GCP client | staging GCP client | production GCP client |

Staging is the DO VPS. There are no managed cloud environments and no per-PR cloud previews. Local dev uses its own local Supabase Docker stack and may use a separate dev GCP client. Keep the service-role key server-side only (in `app.env` on the VPS), never in the browser bundle.

> **SMTP and Resend:** Magic link emails are sent by Supabase using the SMTP credentials configured in the Supabase Dashboard (see §4.2). The app does not set SMTP env vars — those credentials live in the Supabase project itself. If the app sends its own transactional email independently (e.g. notifications, alerts), it uses the Resend SDK via `RESEND_API_KEY`. For now, magic link delivery is handled entirely by Supabase SMTP.

---

## 6. Verify it works

### 6.1 Local verification

1. Populate `.env.local` with your dev Supabase project credentials.
2. Start the app: `pnpm dev`
3. Visit `http://localhost:3000`. You should see a login page.
4. Click **Sign in with Google**. You should be redirected to Google's consent screen.
5. Sign in with a Google account — your personal Gmail for dev, or a Nodwin Group Workspace account for production.
6. After consent, you are redirected back to the app. You should be authenticated.
7. The app uses `@supabase/ssr` (`createBrowserClient` from `@supabase/ssr`), so the session is stored in **cookies**, not `localStorage`. Check the browser's Application > Cookies tab for a `sb-<project-ref>-auth-token` cookie.
8. Try the magic link flow: enter your email on the login page and click **Send magic link**. Check your inbox for the email. Click the link — you should be signed in without a password.

### 6.2 Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `redirect_uri_mismatch` | Redirect URI in GCP OAuth client doesn't match the actual callback URL | Verify the authorized redirect URI in GCP points to `https://<your-supabase-host>/auth/v1/callback`, not to the app. Then check that the app's URL is listed in Supabase **Authentication > Settings > Redirect URLs** |
| `Invalid login credentials` | Domain not in the allowlist, or user not found | Check the `auth_allowed_domains` table and that the Auth Hook is enabled (see §3.2). If the hook isn't wired up, any domain can sign up |
| Magic link email not arriving | SPF/DKIM not configured, or custom SMTP settings incorrect | Verify DNS records (§4.3), test SMTP from Supabase dashboard (§4.2 step 6) |
| Google login button does nothing | Google provider not fully configured in Supabase dashboard, or wrong credentials | Check **Authentication > Providers > Google** has correct Client ID and Secret |
| Session doesn't persist on refresh | Cookie config mismatch with `@supabase/ssr` | Ensure `APP_URL` matches the actual origin. For local dev, `localhost` cookies must not have `Secure` flag |

---

## 7. Run migrations against the self-hosted database

Migrations are applied from code against the self-hosted Postgres by passing its connection string with `--db-url` — there is no Supabase Cloud project to `link`. See `../deploy/SUPABASE-SETUP.md` for the canonical bring-up + migration flow.

### 7.1 Install Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# Linux — download the latest release
# See https://github.com/supabase/cli/releases for the current version
curl -fsSL https://github.com/supabase/cli/releases/download/v2.20.12/supabase_linux_amd64.deb -o supabase.deb
sudo dpkg -i supabase.deb

# Verify
supabase --version
```

<!-- VERIFY: v2.20.12 is the pinned version. Update the URL when the pinned version changes. -->

### 7.2 Point the CLI at the self-hosted database

Migrations target whatever database you name via `--db-url`. Keep the VPS Postgres connection string handy (from the self-host `.env`):

```bash
export SUPABASE_DB_URL="postgresql://postgres:<password>@<vps-host>:5432/postgres"
```

> If you haven't run `supabase init` yet, do that first: `supabase init`. It creates the `supabase/` directory structure including `migrations/`, `seed.sql`, and `config.toml`.

### 7.3 Run migrations

If there are existing migration files in `supabase/migrations/`:

```bash
# Apply all pending migrations to the self-hosted VPS Postgres
supabase db push --db-url "$SUPABASE_DB_URL"
```

If there are no migrations yet, you can diff the self-hosted DB as the starting baseline:

```bash
# Dump the DB schema into a migration file (migra is the default differ)
supabase db diff --db-url "$SUPABASE_DB_URL" -f initial_schema

# Apply it locally
supabase migration up
```

If you already have a local Supabase instance with a schema you want to migrate:

```bash
# Step 1: Start local Supabase
supabase start

# Step 2: Diff local vs the VPS Postgres and generate a migration
#         (db diff needs a target DB URL — pass the VPS connection string)
supabase db diff --db-url "$SUPABASE_DB_URL" -f migrate_local_to_vps

# Step 3: Push the migration to the VPS Postgres
supabase db push --db-url "$SUPABASE_DB_URL"
```

### 7.4 Seed data (sandbox only)

```bash
supabase db reset --db-url "$SUPABASE_DB_URL"
```

> **⚠️ This command drops ALL data and recreates the database from scratch.** Running it against the wrong DB URL is catastrophic — it destroys data irreversibly.
>
> **Safeguards:**
> - Never put the production DB URL in your local `.env` or `config.toml`. Keep it in a password manager and paste it only when needed for one-off operations.
> - Consider adding a guard script that checks the DB URL before running destructive commands:
>   ```bash
>   # bin/guard-db-url.sh
>   if printf '%s' "$SUPABASE_DB_URL" | grep -q '<production-host>'; then
>     echo "FATAL: Production DB URL detected. Aborting." >&2
>     exit 1
>   fi
>   ```

### 7.5 Auth config via CLI (alternative to Dashboard)

Auth provider settings can be managed via the Supabase Management API if you prefer code-driven config. For now, the Supabase Dashboard UI (steps in §3) is the recommended path since auth settings are mostly one-time configuration, not iterative code.

### Migration checklist

| Step | Command / Action | Notes |
|---|---|---|
| Install Supabase CLI | `supabase --version` | v2.20+ recommended |
| Init repo structure | `supabase init` | Creates `supabase/` dir |
| Push existing migrations | `supabase db push --db-url "$SUPABASE_DB_URL"` | Idempotent — safe to re-run |
| Pull schema baseline | `supabase db diff --db-url "$SUPABASE_DB_URL" -f initial_schema` | Only if no migrations exist |
| Apply seed data | `supabase db reset --db-url "$SUPABASE_DB_URL"` | Sandbox only. **Guard against the production DB URL** |
| Deploy domain allowlist table | `supabase db push --db-url "$SUPABASE_DB_URL"` (includes `20260504081413_auth_allowed_domains.sql`) | Enable the Auth Hook too — see §3.2 |

### 7.6 Local-to-VPS env var switch

To point `.env.local` at the self-hosted VPS Supabase instead of the local Supabase stack:

```bash
# Before (local Supabase with Docker):
# NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
# NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-anon-key>

# After (self-hosted Supabase on the VPS):
NEXT_PUBLIC_SUPABASE_URL=https://<your-supabase-host>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-from-self-host-env>
```

The anon key and host URL come from the self-host stack's `.env` (see `../deploy/SUPABASE-SETUP.md`).

---

## 8. Deployment

The app deploys as a Docker container on a single DigitalOcean VPS, alongside the self-hosted Supabase stack. Follow the canonical guides:

- `../deploy/DEPLOYMENT.md` — step-by-step VPS provisioning, env wiring, DNS/TLS, and the deploy pipeline.
- `../deploy/SUPABASE-SETUP.md` — bringing up the self-hosted Supabase stack and applying migrations.

The short version:

1. Set runtime env vars from §5 in the app's `app.env` on the VPS. Provide any build-time `NEXT_PUBLIC_*` values as GitHub Actions build vars/secrets.
2. Merges to `main` trigger GitHub Actions (`.github/workflows/deploy.yml`): build the image, push to `ghcr.io`, SSH to the VPS, then `docker compose pull app && docker compose up -d app`. Cheap checks (lint/typecheck/gitleaks) run on every push.
3. Serve the app behind your reverse proxy on a **stable domain** (see §2.1 callout) — not a per-branch URL. Register that domain in Supabase's Redirect URLs.
4. After the deploy, check your staging URL — the login page should load and Google OAuth should work.

---

## Related docs

- `docs/security.md` — threat model, pre-launch security checklist, SPF/DKIM/DMARC requirements
- `docs/integrations.md` — full integration architecture (Google Workspace, Slack, email)
- `README.md` — stack overview, daily commands, project structure
