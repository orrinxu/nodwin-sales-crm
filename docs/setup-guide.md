# Setup guide: Google OAuth, Supabase Cloud, and magic link email

> How to configure authentication for the Nodwin CRM from scratch.
> Covers Supabase Cloud project creation, Google OAuth credential setup, magic link configuration, and environment wiring.

## Quick start — staging sandbox without a company domain

If you don't have a Nodwin Group domain or Google Workspace access yet, use this abbreviated path to get a working staging sandbox with your own personal accounts. Each step below is a simplified version of the full section listed in parentheses.

1. **Supabase project** (§1) — create a **free-tier** Supabase Cloud project using your personal email, or use the local Supabase stack via `pnpm supabase:start` (Docker required). Free tier is sufficient for a dev sandbox.
2. **Google OAuth** (§2.1) — create a GCP project using your personal Gmail. Set the OAuth consent screen to **External** (not Internal). Add your personal email(s) as test users. When registering redirect URIs in GCP, use **only** `https://<project-ref>.supabase.co/auth/v1/callback` — Supabase is the OAuth broker, not the app. The app's own domains (Vercel URLs, localhost) belong in **Supabase's** Redirect URLs allowlist (under Authentication > Settings), not in GCP.
3. **Supabase Auth** (§3) — enable the Google provider. In **Authentication > Settings**, add your app URL(s) to **Redirect URLs**. Skip the domain allowlist trigger during dev (see §3.2).
4. **Magic link email** (§4) — use Supabase's built-in email sender for dev (skip custom SMTP). Or create a free Resend account and use their sandbox sender (`onboarding@resend.dev`) — no DNS setup needed.
5. **Env vars** (§5) — use the Supabase project ref and anon key (from Cloud dashboard or from `pnpm supabase:start` output).
6. **Local dev** (§6) — test on `http://localhost:3000`. Sign in with your personal Google account.
7. **Vercel deploy** (§8) — deploy to a free Vercel account. Use a stable domain alias as your staging URL (see §2.1). Add the final URL to Supabase's Redirect URLs, not GCP.

> **Everything below this point** describes the full production setup with Nodwin Group domains, Google Workspace, SPF/DKIM/DMARC, and the domain allowlist. For a dev/staging sandbox you can skip sections 2.1 (stable domain guidance still applies), 2.2, 3.2 (domain allowlist trigger), 4.3 (SPF/DKIM/DMARC), and the production Vercel domain setup in §8.

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

Two projects are needed (one per environment). Start with the production project; staging follows the same steps.

1. Go to [supabase.com](https://supabase.com) and sign in with the Nodwin Group Google Workspace account.
2. Click **New project**.
3. Fill in:
   - **Name:** `nodwin-crm-<environment>` (e.g. `nodwin-crm-production`)
   - **Database password:** Generate a strong one. Store in 1Password / vault.
   - **Region:** `Singapore` (`ap-southeast-1`) — closest to the East Asia user base.
   - **Pricing plan:** `Pro` (required for custom SMTP, larger DB size, and daily backups). For a dev sandbox, the **Free** tier is sufficient.
4. Wait for the project to spin up (~2 minutes).
5. Note the **Project URL**, **Project API keys** (anon + service_role), and **Project ID** from **Project Settings > General**.

> **Repeat** for staging (`nodwin-crm-staging`). Each environment gets its own project and its own set of credentials.

---

## 2. Configure Google OAuth credentials

Auth is restricted to Nodwin Group Google Workspace domains (e.g. `@nodwingroup.com`). A Google Cloud Platform project is needed to create the OAuth 2.0 client.

### 2.1 Create a GCP project (one per CRM environment)

> **Plan your URLs before creating the OAuth client.** Google does not support wildcards in authorized origins or redirect URIs. Vercel generates a unique hostname per branch/commit (e.g. `project-git-feature-xyz.vercel.app`), so you cannot register every preview URL individually. You must use a **single stable domain alias** for each non-production environment:
>
> - A custom subdomain like `staging-crm.nodwingroup.com` pointed at Vercel via a CNAME record.
> - A personal domain subdomain like `nodwin-crm-staging.orrinxu.com` — useful for dev sandboxes without company DNS access.
> - Or a Vercel-pinned alias: in the Vercel project dashboard under **Deployments**, find the staging branch deployment, click **Domains**, and add an alias bound to that specific deployment. This gives you a fixed URL like `staging-crm.vercel.app`.
>
> Register only this one stable URL in GCP. Do not commit to managing individual preview URLs — every new branch would break OAuth.

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
      - `https://<project-ref>.supabase.co/auth/v1/callback`
   - **Do not** add app-specific paths like `/auth/callback` here. The app's callback URLs belong in **Supabase's** Redirect URLs (Authentication > Settings), not in GCP.
   - Click **Create**.
5. Copy the **Client ID** and **Client Secret**. Store them in 1Password / vault.

> **One redirect URI per GCP client, period.** Since the Supabase callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`) is the same for all environments served by that Supabase project, you only need one entry. The Supabase project itself redirects to the correct app URL after authentication based on its **Site URL** and **Redirect URLs** settings — configure those per environment in the Supabase dashboard.

### 2.2 Restrict by domain (optional but recommended)

In the GCP OAuth consent screen settings, under **Test users**, you can add individual test accounts. Once the app is verified (internal apps don't need verification), only your Workspace domain users will be able to sign in. The Postgres trigger in §3.2 enforces the domain allowlist on the backend, so this GCP restriction is a defence-in-depth measure.

---

## 3. Wire up Supabase Auth

### 3.1 Enable Google provider

1. In the Supabase Dashboard, go to **Authentication > Providers**.
2. Find **Google** and toggle it on.
3. Paste the **Client ID** and **Client Secret** from step 2.1.
4. Save.

### 3.2 Enforce domain allowlist via Postgres trigger

Supabase does not have a built-in dashboard setting to restrict sign-up by email domain. Instead, create a Postgres trigger on `auth.users` that rejects sign-ups from non-allowed domains.

Create a new migration file in `supabase/migrations/` (e.g. `supabase/migrations/20250508000001_domain_allowlist.sql`):

```sql
-- Restrict sign-ups to approved email domains
CREATE OR REPLACE FUNCTION auth.check_email_domain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.email NOT LIKE '%@nodwingroup.com'
     AND NEW.email NOT LIKE '%@trinitygaming.in'
     AND NEW.email NOT LIKE '%@maxlevel.gg'
  THEN
    RAISE EXCEPTION 'Email domain is not allowed: %', split_part(NEW.email, '@', 2);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION auth.check_email_domain();
```

> **Dev shortcut:** Skip deploying this migration during development. Without it, any email domain can sign up.

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

There is no Supabase-level toggle to disable password-based sign-in. The application enforces magic-link-only at the UI layer by calling `signInWithOtp()` on the Supabase client (see `components/auth/magic-link-form.tsx`) rather than exposing a password form. To prevent server-side impersonation, also verify the email domain via the Postgres trigger in §3.2 and ensure the anon key is not abused in client code.

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

All auth-related environment variables are listed here. Copy these into `.env.local` for local development and into the Vercel project dashboard for each environment.

```bash
# --- Supabase ---
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-from-supabase-settings>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-from-supabase-settings>

# --- Google OAuth (server-side only) ---
GOOGLE_OAUTH_CLIENT_SECRET=<google-oauth-client-secret>

# --- App ---
NEXT_PUBLIC_APP_URL=http://localhost:3000  # change per environment
```

> **What about `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID`?** When using Supabase as the OAuth broker (Google provider configured in Supabase dashboard), the frontend never reads the Google client ID directly — Supabase handles the OAuth handshake. This variable is not needed.
>
> If the app later makes direct Google API calls (Gmail, Drive, Calendar) from the frontend, the Google client ID would be reintroduced for a separate token exchange. That is a future concern.

> **Security note:** `SUPABASE_SERVICE_ROLE_KEY` and `GOOGLE_OAUTH_CLIENT_SECRET` bypass RLS and can impersonate any user. Never expose them to the browser. They must only appear in server-side code or environment variables prefixed without `NEXT_PUBLIC_`.

### Environment-specific overrides

| Variable | Local | Staging | Production |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | `https://<stable-staging-domain>` | `https://crm.nodwingroup.com` |
| Supabase project | dev project | staging project | production project |
| Google OAuth client | dev GCP client | staging GCP client | production GCP client |

Each environment uses a **separate** Supabase project and GCP OAuth client. Do not share credentials across environments.

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
| `redirect_uri_mismatch` | Redirect URI in GCP OAuth client doesn't match the actual callback URL | Verify the authorized redirect URI in GCP points to `https://<project-ref>.supabase.co/auth/v1/callback`, not to the app. Then check that the app's URL is listed in Supabase **Authentication > Settings > Redirect URLs** |
| `Invalid login credentials` | Domain not in the allowlist trigger, or user not found | Check the Postgres trigger in `supabase/migrations/` (see §3.2). If the trigger isn't deployed, any domain can sign up |
| Magic link email not arriving | SPF/DKIM not configured, or custom SMTP settings incorrect | Verify DNS records (§4.3), test SMTP from Supabase dashboard (§4.2 step 6) |
| Google login button does nothing | Google provider not fully configured in Supabase dashboard, or wrong credentials | Check **Authentication > Providers > Google** has correct Client ID and Secret |
| Session doesn't persist on refresh | Cookie config mismatch with `@supabase/ssr` | Ensure `NEXT_PUBLIC_APP_URL` matches the actual origin. For local dev, `localhost` cookies must not have `Secure` flag |

---

## 7. Link Supabase CLI to Cloud and run migrations

Once the Supabase Cloud project exists, link it to the repo so migrations are applied from code, not from the Dashboard UI.

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
# Dump the Cloud DB schema into a migration file (migra is the default differ)
supabase db diff -f initial_schema

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

> **⚠️ This command drops ALL data and recreates the database from scratch.** Running it against the wrong project ref is catastrophic — it destroys production data irreversibly.
>
> **Safeguards:**
> - Never put the production project ref in your local `.env` or `config.toml`. Keep it in a password manager and paste it only when needed for one-off operations.
> - Consider adding a guard script that checks the project ref before running destructive commands:
>   ```bash
>   # bin/guard-ref.sh
>   if grep -q '<production-project-ref>' supabase/config.toml 2>/dev/null; then
>     echo "FATAL: Production project ref detected. Aborting." >&2
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
| Link to Cloud | `supabase link --project-ref <ref>` | Uses DB password |
| Push existing migrations | `supabase db push` | Idempotent — safe to re-run |
| Pull schema baseline | `supabase db diff -f initial_schema` | Only if no migrations exist |
| Apply seed data | `supabase db reset --linked` | Staging only. **Guard against production ref** |
| Deploy domain allowlist trigger | `supabase db push` (includes the trigger migration) | See §3.2 for the SQL |

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
   - **Caveat:** Non-default function regions require Vercel's **Pro** plan or above. Edge Functions ignore the region setting entirely and run at the edge. If you are on a lower-tier plan, you may not be able to set a Singapore region — the functions will default to `iad1` (US East).
5. Configure a **stable domain alias** for staging (see §2.1 callout). Do not rely on per-branch preview URLs for OAuth.
6. Trigger a deployment. Check your staging URL — the login page should load and Google OAuth should work.

---

## Related docs

- `docs/security.md` — threat model, pre-launch security checklist, SPF/DKIM/DMARC requirements
- `docs/integrations.md` — full integration architecture (Google Workspace, Slack, email)
- `README.md` — stack overview, daily commands, project structure
