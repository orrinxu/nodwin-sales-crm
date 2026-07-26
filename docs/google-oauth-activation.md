# Activating Google OAuth (Calendar + Gmail) — Operator Runbook

**Ticket:** ORR-823 · **Audience:** operator with access to the Google Cloud
Console for the Nodwin org and the staging VPS environment.

The per-user Google OAuth engine (ORR-773, children ORR-817–822), Calendar
two-way sync (ORR-774 / ORR-829), and Gmail two-way sync (ORR-775, children
ORR-830–836) are **code-complete, merged, and deployed to staging**. All Google
env vars are optional, so the app boots without them — the integrations simply
stay dormant until the steps below are done.

This runbook is the **external/ops** activation. It requires a human Google
identity (OAuth consent cannot be automated), which is why it is not done in
code.

---

## Step 1 — Create the Google Cloud OAuth 2.0 Web client

1. Open <https://console.cloud.google.com/> and select (or create) the project
   for the Nodwin CRM.
2. **APIs & Services → Enabled APIs & services → + Enable APIs**: enable
   **Google Calendar API** and **Gmail API** (and **Google Drive API** if you
   intend to exercise the per-user Drive verify path).
3. **APIs & Services → OAuth consent screen**:
   - User type **External** (or **Internal** for a Workspace-only org).
   - Add these scopes:
     - `https://www.googleapis.com/auth/calendar.events`
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/gmail.send`
     - `https://www.googleapis.com/auth/drive.readonly`
   - While the app is in **Testing**, add each user who will connect as a
     **Test user**.
4. **APIs & Services → Credentials → + Create credentials → OAuth client ID →
   Web application**:
   - **Authorized redirect URI** (exact, no trailing slash):
     `https://nodwin-crm-staging.orrinxu.com/api/integrations/google/callback`
   - Create, then copy the **Client ID** and **Client secret**.

---

## Step 2 — Set the staging environment variables

The server reads these exact names (see `apps/web/lib/security/env-schema.ts`):

| Variable | Value |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | from Step 1 |
| `GOOGLE_OAUTH_CLIENT_SECRET` | from Step 1 |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://nodwin-crm-staging.orrinxu.com/api/integrations/google/callback` |
| `GOOGLE_TOKEN_ENC_KEY` | a 32-byte base64 key — **generate your own**, see below |

Generate the encryption key (do **not** commit it anywhere):

```bash
openssl rand -base64 32
```

> **`GOOGLE_TOKEN_ENC_KEY` encrypts stored refresh tokens at rest.** Rotating it
> later invalidates every stored connection — all users must reconnect. Store it
> as a secret, never in git.

Add the four variables to the staging environment (compose env / secrets) and
restart the staging app container so they load.

---

## Step 3 — Live smoke test

1. Open <https://nodwin-crm-staging.orrinxu.com/settings> → **Connect Google**
   → complete the consent flow.
2. Call `GET https://nodwin-crm-staging.orrinxu.com/api/integrations/google/verify`
   (authenticated) → confirm it reports your connected account and that
   auto-refresh works. (See `docs/integrations.md` §6.5.5.)
3. In **Settings**, toggle Calendar **Sync now**, then Gmail **Sync now** →
   confirm meetings / emails appear as activities.

When Step 3 passes, **ORR-823 is done** and Calendar + Gmail are live end-to-end
against real Google data.

---

## Step 4 — Periodic sync (follow-up, no human identity needed)

The "Sync now" buttons pull on demand. For continuous sync, an out-of-repo
scheduler must POST the drain routes on an interval:

- `POST /api/jobs/calendar-sync` — header `x-cron-secret: <CALENDAR_SYNC_CRON_SECRET>`
- `POST /api/jobs/gmail-sync` — header `x-cron-secret: <GMAIL_SYNC_CRON_SECRET>`

Set those two secrets in the staging env alongside the OAuth vars, then point a
scheduler (cron container / platform scheduler) at both routes. This step does
**not** require a Google identity and can be wired by an engineer once the
secrets exist.

---

## Reference

- OAuth engine: `apps/web/lib/integrations/google/` (token-store, oauth-client,
  oauth-state, verify)
- Calendar: `apps/web/lib/integrations/calendar/` + `apps/web/app/api/jobs/calendar-sync/`
- Gmail: `apps/web/lib/integrations/gmail/` + `apps/web/app/api/jobs/gmail-sync/`
- End-to-end verify walkthrough: `docs/integrations.md` §6.5.5
