# Testing Deployment Quick Start

> The fastest ways to get the Nodwin CRM running for testing.
> For full production deployment, see [`deploy-vercel.md`](deploy-vercel.md).

---

## Option 1: Local testing (fastest — 5 minutes)

Best for: developers, quick feature validation, local debugging.

### Prerequisites

- Docker Desktop running
- Node.js 20+ and pnpm 10+
- Supabase CLI (`npm i -g supabase`)

### Steps

```bash
# 1. Clone and install
git clone <repo-url> && cd nodwin-sales-crm
pnpm install

# 2. Copy env template
cp apps/web/.env.example apps/web/.env.local

# 3. Start local Supabase (prints anon key + service role key)
pnpm supabase:start

# 4. Copy the printed keys into apps/web/.env.local
#    SUPABASE_URL=http://localhost:54321
#    NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
#    SUPABASE_ANON_KEY=<anon-key-from-step-3>
#    NEXT_PUBLIC_SUPABASE_ANON_KEY=<same-as-above>
#    SUPABASE_SERVICE_ROLE_KEY=<service-role-key-from-step-3>

# 5. Run migrations and seed test data
pnpm db:migrate
pnpm db:seed

# 6. Start dev server
pnpm dev
```

| URL | What |
|---|---|
| http://localhost:3000 | App (login page) |
| http://localhost:54323 | Supabase Studio (browse DB) |
| http://localhost:54324 | Inbucket (captured emails) |

> **Skip OAuth for pure local testing:** Set `NEXT_PUBLIC_ENV=local-preview` in `.env.local` to bypass auth and auto-login as admin. **Never use this in staging or production.**

---

## Option 2: Vercel staging preview (for team sharing)

Best for: product demos, stakeholder review, UAT before production.

### What you need

1. A **free Vercel account** (or team)
2. A **free Supabase project** (separate from local dev)
3. A **Google Cloud project** (for OAuth)

### Steps

#### Step 1: Create Supabase staging project

1. Go to [supabase.com](https://supabase.com), sign in, click **New project**
2. Name: `nodwin-crm-staging`
3. Region: `Singapore (ap-southeast-1)`
4. Plan: Free tier is sufficient for testing
5. Note the **Project URL** and **API keys** from Project Settings → API

#### Step 2: Run migrations on staging

```bash
# Link your local repo to the staging project
supabase link --project-ref <project-ref>

# Push all migrations
supabase db push
```

#### Step 3: Set up Google OAuth (simplified)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → **APIs & Services → OAuth consent screen**
   - User type: **External**
   - App name: `Nodwin CRM Staging`
   - Add your email as a **Test user**
3. **Credentials → Create Credentials → OAuth client ID**
   - Application type: `Web application`
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client Secret**

#### Step 4: Wire up Supabase Auth

1. In Supabase Dashboard → **Authentication → Providers**
2. Toggle **Google** on, paste Client ID + Secret
3. **Authentication → Settings → Redirect URLs**
   - Add your staging app URL (from Step 5) + `/auth/callback`

#### Step 5: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com), import the GitHub repo
2. Project settings:
   - **Framework preset:** Next.js
   - **Root directory:** `apps/web`
   - **Build command:** `pnpm build`
   - **Install command:** `pnpm install --frozen-lockfile`
3. **Environment Variables** (add all from `.env.example`, but use staging values):
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = staging anon key
   - `SUPABASE_SERVICE_ROLE_KEY` = staging service role key
   - `APP_URL` = `https://<your-vercel-url>`
4. Deploy

#### Step 6: Verify

- Visit the Vercel URL → login page loads
- Sign in with Google (your test account) → redirects to app
- `pnpm build` succeeds locally before pushing

---

## Quick comparison

| | Local | Vercel Staging |
|---|---|---|
| **Setup time** | ~5 min | ~20 min |
| **Cost** | Free | Free tier |
| **Best for** | Dev, debugging | Demos, team review |
| **Data persists** | Until `db:reset` | Until you delete the project |
| **Public URL** | No (localhost) | Yes (shareable) |
| **OAuth required** | No (if using `local-preview`) | Yes |

---

## One-liner smoke test

After any deployment, run this to confirm the app is healthy:

```bash
# Local
curl -s http://localhost:3000/api/health | jq .

# Staging
curl -s https://<your-staging-url>/api/health | jq .
```

Expected: `{"status":"ok"}`

---

## Related docs

- [`startup-guide.md`](startup-guide.md) — full local dev setup with troubleshooting
- [`deploy-vercel.md`](deploy-vercel.md) — production/sandbox deployment with DNS, custom domains, and approval gates
- [`setup-guide.md`](setup-guide.md) — detailed auth configuration (Google OAuth, magic links, SMTP, SPF/DKIM/DMARC)
