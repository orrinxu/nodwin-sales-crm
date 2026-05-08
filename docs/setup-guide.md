# Setup guide: Google OAuth, Supabase Cloud, and magic link email

> How to configure authentication for the Nodwin CRM from scratch.
> Covers Supabase Cloud project creation, Google OAuth credential setup, magic link configuration, and environment wiring.

---

## Quick start — staging sandbox without a company domain

If you don't have a Nodwin Group domain or Google Workspace access yet, use this abbreviated path to get a working staging sandbox with your own personal accounts. Each step below is a simplified version of the full section listed in parentheses.

1. **Supabase Cloud project** (§1) — create a free-tier Supabase project using your personal email.
2. **Google OAuth** (§2.1) — create a GCP project using your personal Gmail. Set the OAuth consent screen to **External** (not Internal). Add your personal Gmail as a test user. Use `http://localhost:3000` and your Vercel preview URL (e.g. `https://nodwin-crm-git-dev-username.vercel.app`) as authorized origins/redirects. Leave **Authorized domains** empty — External type doesn't require verified domains.
3. **Supabase Auth** (§3) — enable the Google provider. For the domain allowlist, leave it empty during dev so any test email can sign up. Skip the Nodwin domain restrictions.
4. **Magic link email** (§4) — use Supabase's built-in email sender for dev (skip custom SMTP). Or sign up for a free Resend account and use their `onboarding@resend.dev` sender domain — no DNS setup needed.
5. **Env vars** (§5) — use the Supabase Cloud project ref and anon key. Point Google OAuth env vars at your personal GCP client.
6. **Local dev** (§6) — test on `http://localhost:3000`. Sign in with your personal Google account.
7. **Vercel deploy** (§8) — deploy to a free Vercel account. Use the Vercel-subdomain URL (e.g. `nodwin-crm.vercel.app`) as your staging domain. Add it to your GCP OAuth client's authorized origins/redirects.

> **Everything below this point** describes the full production setup with Nodwin Group domains, Google Workspace, SPF/DKIM/DMARC, and the domain allowlist. For a dev/staging sandbox you can skip sections 2.2, 3.2 (domain allowlist), 4.3 (SPF/DKIM/DMARC), and the production Vercel domain setup in §8.

---

## Table of contents

1. [Create a Supabase Cloud project](#1-create-a-supabase-cloud-project)
2. [Configure Google OAuth credentials](#2-configure-google-oauth-credentials)
3. [Wire up Supabase Auth](#3-wire-up-supabase-auth)
4. [Configure magic link email (custom SMTP)](#4-configure-magic-link-email-custom-smtp)
5. [Environment variables](#5-environment-variables)
6. [Verify it works](#6-verify-it-works)
7. [Link Supabase CLI to Cloud and run migrations](#7-link-supabase-cli-to-cloud-and-run-migrations)
8. [Vercel deployment](#8-vercel-deployment)

---

## 1. Create a Supabase Cloud project

Three projects are needed (one per environment). Start with the production project; staging and sandbox follow the same steps.

1. Go to [supabase.com](https://supabase.com) and sign in with the Nodwin Group Google Workspace account.
2. Click **New project**.
3. Fill in:
   - **Name:** `nodwin-crm-<environment>` (e.g. `nodwin-crm-production`)
   - **Database password:** Generate a strong one. Store in 1Password / vault.
   - **Region:** `Singapore` (`ap-southeast-1`) — closest to the East Asia user base.
   - **Pricing plan:** `Pro` (required for custom SMTP, larger DB size, and daily backups).
4. Wait for the project to spin up (~2 minutes).
5. Note the **Project URL**, **Project API keys** (anon + service_role), and **Project ID** from **Project Settings > General**.

> **Repeat** for staging (`nodwin-crm-staging`) and sandbox (`nodwin-crm-sandbox`). Each environment gets its own project and its own set of credentials.

---

## 2. Configure Google OAuth credentials

Auth is restricted to Nodwin Group Google Workspace domains (e.g. `@nodwingroup.com`). A Google Cloud Platform project is needed to create the OAuth 2.0 client.

### 2.1 Create a GCP project (one per CRM environment)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a new project named `Nodwin CRM <environment>`.
2. Navigate to **APIs & Services > OAuth consent screen**.
   - **User type:** Choose based on your stage:
     - **Internal** — production only. Requires a Nodwin Group Google Workspace account. Only workspace users can sign in.
     - **External** — dev/staging without a company domain. Use your personal Gmail. Add test email addresses under **Test users** (up to 100). No verified domain needed.
   - **App name:** `Nodwin CRM (<environment>)`
   - **Support email:** Your GCP project owner email.
   - **Authorized domains:** Leave empty for External (dev) type. For Internal (production), add `nodwingroup.com` and the Vercel deployment domain (e.g. `nodwin-crm.vercel.app`).
   - **Scopes:** Add `openid`, `profile`, `email`. No additional scopes are needed.
3. Navigate to **APIs & Services > Credentials**.
4. Click **Create Credentials > OAuth client ID**.
   - **Application type:** `Web application`
   - **Name:** `Nodwin CRM <environment> web client`
   - **Authorized JavaScript origins:**
     - `http://localhost:3000` (local dev)
     - `https://<your-vercel-preview-domain>.vercel.app` (staging preview)
     - `https://<your-production-domain>.com` (production, e.g. `https://crm.nodwingroup.com`)
   - **Authorized redirect URIs:**
     - `http://localhost:3000/auth/callback` (local dev)
     - `https://<project-ref>.supabase.co/auth/v1/callback` (local dev fallback — see note below)
     - `https://<your-vercel-preview-domain>.vercel.app/auth/callback` (staging)
     - `https://<your-production-domain>.com/auth/callback` (production)
   - Click **Create**.
5. Copy the **Client ID** and **Client Secret**. Store them in 1Password / vault.

> **Why two local redirect URIs?** Next.js can handle the callback on its own route, but during local Supabase testing you may need to point at the Supabase Auth callback directly. Both are harmless to include.

### 2.2 Restrict by domain (optional but recommended)

In the GCP OAuth consent screen settings, under **Test users**, you can add individual test accounts. Once the app is verified (internal apps don't need verification), only your Workspace domain users will be able to sign in. Supabase enforces the domain allowlist on its side (see §3.2), so this GCP restriction is a defence-in-depth measure.

---

## 3. Wire up Supabase Auth

### 3.1 Enable Google provider

1. In the Supabase Dashboard, go to **Authentication > Providers**.
2. Find **Google** and toggle it on.
3. Paste the **Client ID** and **Client Secret** from step 2.1.
4. Under **Authorized domains for sign-ups** (a separate field in some Supabase versions), add your workspace domains (e.g. `nodwingroup.com`).
5. Save.

### 3.2 Configure domain allowlist

> **Dev shortcut:** If you don't have a Nodwin domain yet, leave the domain allowlist empty. Any email can sign up during development. Tighten this before production.

1. Go to **Authentication > Settings**.
2. Under **Auth providers > Additional settings**:
   - **Site URL:** Your frontend URL (e.g. `http://localhost:3000` for dev, `https://crm.nodwingroup.com` for production). This is used as the default redirect after login.
   - **Redirect URLs:** Add the same origins from step 2.1:
     - `http://localhost:3000/**`
     - `https://<your-vercel-preview-domain>.vercel.app/**`
     - `https://<your-production-domain>.com/**`
3. Under **Email > Domain verification**:
   - Leave empty for dev/staging.
   - For production, add `nodwingroup.com` (or whatever the Nodwin Group workspace domain is).
   - Optionally add subsidiary domains (e.g. `unpause.asia`, `trinity-gaming.com`) as they come online.
4. Under **Security > Additional security**:
   - Disable **Allow sign-ups without email confirmation** (we want confirmed accounts or magic links only).
   - Set **Minimum password length** to `12` if password auth is ever enabled.

### 3.3 Enable magic link / email-only auth

1. Go to **Authentication > Providers**.
2. Find **Email** and ensure it is enabled.
3. Under **Email > Settings**:
   - **Confirm email:** On (users must click a confirmation link or magic link to sign in).
   - **Secure email change:** On (requires both old and new email confirmation).
   - **Allow users to sign up without password:** On — this enables magic link flow.
4. Save.

> The CRM uses **magic link only** (no password). Users enter their work email, receive a one-time link, and click it to sign in. This avoids password management entirely. The allowlist in §3.2 restricts sign-ups to Nodwin Group domains.

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

1. Go to **Authentication > Settings > SMTP Settings**.
2. Toggle **Custom SMTP** on.
3. Fill in:
   - **Sender name:** `Nodwin CRM`
   - **Sender email:** `crm@nodwingroup.com` (must match the domain you set up SPF/DKIM/DMARC for)
   - **Host:** `smtp.resend.com` (or your Postmark SMTP host)
   - **Port:** `465` (SSL) or `587` (TLS)
   - **Username:** SMTP username from Resend/Postmark
   - **Password:** SMTP password from Resend/Postmark
4. Click **Save**.
5. Click **Send test email** to verify. The test email should arrive in seconds.

### 4.3 Configure SPF, DKIM, and DMARC

Before sending any real emails, configure DNS for the sending domain (e.g. `nodwingroup.com`):

1. **SPF:** Add a TXT record: `v=spf1 include:spf.resend.com ~all` (or Postmark equivalent). This tells receiving mail servers that Resend is authorised to send on behalf of the domain.
2. **DKIM:** Add the DKIM TXT record from Resend (or Postmark) to the domain's DNS. This cryptographically signs each email so the recipient can verify it wasn't forged.
3. **DMARC:** Add a DMARC TXT record: `v=DMARC1; p=quarantine; rua=mailto:dmarc@nodwingroup.com`. Start with `p=none`, monitor reports for a week, then tighten to `p=quarantine`.

> **Do not send a single user-facing email until SPF/DKIM/DMARC are in place.** Without them, magic link emails land in spam or are rejected. This is a pre-launch blocker (see `docs/security.md`).

---

## 5. Environment variables

All auth-related environment variables are listed here. Copy these into `.env.local` for local development and into the Vercel project dashboard for each environment.

```bash
# --- Supabase ---
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-from-supabase-settings>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-from-supabase-settings>

# --- Google OAuth ---
NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID=<google-oauth-client-id>
GOOGLE_OAUTH_CLIENT_SECRET=<google-oauth-client-secret>

# --- SMTP / Email ---
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=<smtp-username>
SMTP_PASS=<smtp-password>
SMTP_SENDER_EMAIL=crm@nodwingroup.com  # dev: use onboarding@resend.dev or skip SMTP entirely
SMTP_SENDER_NAME=Nodwin CRM

# --- Resend (if using Resend for transactional email) ---
RESEND_API_KEY=<resend-api-key>

# --- App ---
NEXT_PUBLIC_APP_URL=http://localhost:3000  # change per environment
```

> **Security note:** `SUPABASE_SERVICE_ROLE_KEY` and `GOOGLE_OAUTH_CLIENT_SECRET` bypass RLS and can impersonate any user. Never expose them to the browser. They must only appear in server-side code or environment variables prefixed without `NEXT_PUBLIC_`.

### Environment-specific overrides

| Variable | Local | Dev staging | Production |
|---|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | `https://<project>.vercel.app` | `https://crm.nodwingroup.com` |
| Supabase project | dev project | staging project | production project |
| Google OAuth client | dev GCP client (External) | dev GCP client (External) | prod GCP client (Internal) |

Each environment uses a **separate** Supabase project and GCP OAuth client. Do not share credentials across environments.

---

## 6. Verify it works

### 6.1 Local verification

1. Populate `.env.local` with your dev Supabase project credentials and Google OAuth client.
2. Start the app: `pnpm dev`
3. Visit `http://localhost:3000`. You should see a login page.
4. Click **Sign in with Google**. You should be redirected to Google's consent screen.
5. Sign in with a Google account — your personal Gmail for dev, or a Nodwin Group Workspace account for production.
6. After consent, you are redirected back to the app. You should be authenticated.
7. Open the browser's Application/Storage tab and confirm a Supabase session exists in local storage.
8. Try the magic link flow: enter your email on the login page and click **Send magic link**. Check your inbox for the email. Click the link — you should be signed in without a password.

### 6.2 Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `redirect_uri_mismatch` | Redirect URI in GCP OAuth client doesn't match the actual callback URL | Add both the Supabase callback and app callback to the GCP client's authorized redirect URIs (see §2.1 step 4) |
| `Invalid login credentials` | Domain not in Supabase allowlist | Check **Authentication > Settings > Domain verification** in Supabase dashboard |
| Magic link email not arriving | SPF/DKIM not configured, or custom SMTP settings incorrect | Verify DNS records (§4.3), test SMTP from Supabase dashboard (§4.2 step 5) |
| Google login button does nothing | OAuth client ID env var missing or wrong | Check `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` is set correctly in `.env.local` |
| Session doesn't persist on refresh | Cookie/storage config mismatch | Ensure `AUTH_COOKIE_*` config matches the site URL. For local dev, `localhost` cookies must not have `Secure` flag. |

---

## 7. Link Supabase CLI to Cloud and run migrations

Once the Supabase Cloud project exists, link it to the repo so migrations are applied from code, not from the Dashboard UI.

### 7.1 Install Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# Linux (curl)
curl -fsSL https://github.com/supabase/cli/releases/download/v2.20.12/supabase_linux_amd64.deb -o supabase.deb
sudo dpkg -i supabase.deb

# Verify
supabase --version
```

### 7.2 Link to your Supabase Cloud project

```bash
# From the root of the repo
supabase link --project-ref <project-ref>
```

The CLI prompts for your database password. This creates a `supabase/config.toml` with the project reference and connection details.

> If you haven't run `supabase init` yet, do that first: `supabase init`. It creates the `supabase/` directory structure including `migrations/`, `seed.sql`, and `config.toml`.

### 7.3 Run migrations

If there are existing migration files in `supabase/migrations/`:

```bash
# Apply all pending migrations to the linked Cloud project
supabase db push
```

If there are no migrations yet, you can pull the schema from the Cloud project as the starting baseline:

```bash
# Dump the Cloud DB schema into a migration file
supabase db diff --use-migra -f initial_schema

# Apply it locally
supabase migration up
```

If you already have a local Supabase instance with a schema you want to migrate:

```bash
# Step 1: Start local Supabase
supabase start

# Step 2: Diff local vs prod/staging and generate migration
supabase db diff --linked -f migrate_local_to_cloud

# Step 3: Push the migration to the linked Cloud project
supabase db push
```

### 7.4 Seed data (sandbox only)

```bash
supabase db reset --linked
```

This drops, recreates, and seeds the linked (cloud) database. **Never run this against production** — it destroys all data.

### 7.5 Auth config via CLI (alternative to Dashboard)

Auth provider settings can be managed via the Supabase Management API if you prefer code-driven config. For now, the Supabase Dashboard UI (steps in §3) is the recommended path since auth settings are mostly one-time configuration, not iterative code.

### Migration checklist

| Step | Command / Action | Notes |
|---|---|---|
| Install Supabase CLI | `supabase --version` | v2.20+ recommended |
| Init repo structure | `supabase init` | Creates `supabase/` dir |
| Link to Cloud | `supabase link --project-ref <ref>` | Uses DB password |
| Push existing migrations | `supabase db push` | Idempotent — safe to re-run |
| Pull schema baseline | `supabase db diff -f initial_schema` | Only if no migrations exist |
| Apply seed data | `supabase db reset --linked` | Sandbox/staging only |
| Verify auth config | Dashboard > Authentication | One-time via UI |

### 7.6 Local-to-Cloud env var switch

After linking, update `.env.local` to point at the Cloud project instead of the local Supabase instance:

```bash
# Before (local Supabase with Docker):
# NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
# NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-anon-key>

# After (Supabase Cloud):
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<cloud-anon-key>
```

The anon key and project ref are in **Supabase Dashboard > Project Settings > API**.

---

## 8. Vercel deployment

When deploying to Vercel:

1. In the Vercel project dashboard, go to **Settings > Environment Variables**.
2. Add all variables from §5 for each environment (Production, Preview, Development).
3. Go to **Settings > Git** and configure branch-to-environment mapping:
   - `main` → Production
   - `*` → Preview (preview deployments get staging Supabase + staging OAuth)
4. Under **Settings > Functions**:
   - Ensure the function region is set to `Singapore` (`ap-southeast-1`) to match the Supabase region.
5. Trigger a deployment. Check `https://<preview>.vercel.app` — the login page should load and Google OAuth should work.

> **Important:** Each Vercel preview deployment (for a PR branch) gets a unique URL. You must add each preview URL to the GCP OAuth client's **Authorized JavaScript origins** and **Authorized redirect URIs**. To avoid manually adding every preview URL, use a wildcard domain in GCP (not supported) or configure a single preview domain alias in Vercel project settings under **Domains**. A simpler approach: use a shared staging domain (e.g. `staging.nodwin-crm.vercel.app`) pinned to a specific branch and add only that to GCP.

---

## Related docs

- `docs/security.md` — threat model, pre-launch security checklist, SPF/DKIM/DMARC requirements
- `docs/integrations.md` — full integration architecture (Google Workspace, Slack, email)
- `README.md` — stack overview, daily commands, project structure
