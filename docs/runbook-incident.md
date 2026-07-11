# Incident Response Runbook

> Owner: Tech Writer
> Last updated: 2026-07-11

## Scope

This runbook covers incident response procedures for the Nodwin CRM running on the production stack (a Docker container on a DigitalOcean VPS + self-hosted Supabase + AI providers + Postmark/Resend email + Google Workspace + Slack).

## Pre-Deploy Smoke Check

Before declaring any deploy complete, run the [3-Check Smoke Procedure](smoke-test.md):

1. **Branch check** — assert the checked-out branch is `main`
2. **Schema check** — verify migrations are applied and expected tables exist
3. **Route health check** — curl a `(crm)/` route expecting HTTP 200
4. **Process restart** — on the production VPS this is `docker compose up -d app` (the container, not PM2); the PM2 restart in `smoke-test.md` applies to the **local-preview** deployment only

If any check fails, do not mark the deploy as done. Follow the failure procedures in
`docs/smoke-test.md` or escalate per the severity table below.

---

## Pre-Launch Requirements

Per the [Pre-Launch Security Checklist](security.md#84-pre-launch-security-checklist):

- [ ] On-call rotation defined and published
- [ ] Escalation contacts documented
- [ ] Alert channels configured (#crm-alerts, PagerDuty or equivalent)
- [ ] Backup and restore procedure documented and tested
- [ ] Data deletion / offboarding procedure documented
- [ ] GDPR / DPDP / regional privacy procedures documented

## Severity Levels

| Severity | Definition | Response Time | Examples |
|---|---|---|---|
| **Critical** | Data breach, service unavailable, data loss | Immediate (< 1 hour) | RLS misconfiguration leaks client data; Supabase production DB down; AI key compromise allows unbounded spend; inbound email forgery confirmed |
| **High** | Feature broken for multiple users, AI cost spike | Within 4 hours | AI costs exceeding daily cap by >50%; single entity's data not loading (*forward-looking, once built:* Gmail send failing for all users; Drive permission sync stuck) |
| **Medium** | Single-user issue, cosmetic bug | Within 24 hours | Rep can't log activity; incorrect currency formatting; Slack notifications not delivering to one channel |
| **Low** | Question, feature request, minor UI glitch | Next business day | Typo in UI text; slow kanban load on large pipelines; feature request |

## Communication

1. **Declare** the incident in #crm-alerts with severity level and affected scope.
2. **Notify** Orrin Xu (project lead) via Slack DM for Critical / High incidents.
3. **Update** the incident channel every 30 minutes (Critical) or 2 hours (High) until resolved.
4. **Post-mortem** within 48 hours of resolution for any Critical incident.

## Response Procedures

### P-1: Service Down (DO VPS / Supabase)

**Symptoms:** App returns 5xx, blank page, or "Application error". Supabase Studio unreachable.

**Steps:**

0. **Run the [3-Check Smoke Procedure](smoke-test.md)** to rule out branch mismatch, unapplied schema, or stale process — the most common causes of "service down" on local preview deployments. If all 3 checks pass, proceed to infrastructure-level diagnosis.

1. **Check the app on the VPS:** SSH in and run `docker compose ps` and `docker compose logs app`. Also check the latest **GitHub Actions Deploy run** (`.github/workflows/deploy.yml`). Is the app container up and healthy?
   - If the deploy job failed: check the Actions build logs. Common causes: TypeScript error, missing env var, failed migration.
   - If deploy succeeded but app is down: check the DigitalOcean status page (https://status.digitalocean.com).
2. **Check the self-hosted Supabase containers** on the VPS with `docker compose ps` — verify the Supabase services (db, auth, rest, storage, realtime) are up. If a container is unhealthy, check its logs with `docker compose logs`.
3. **Check DB health:** confirm the Postgres container is accepting connections (e.g. `docker compose exec db pg_isready`).
4. **Check recent migrations:** `supabase db diff --db-url "postgresql://postgres:<password>@<vps-host>:5432/postgres"` to confirm schema matches expected state. A failed migration can leave the DB in an inconsistent state.
5. **Rollback a bad deploy:** re-point the app service image to a previous `:sha-<sha>` tag and run `docker compose up -d app` on the VPS (see `../deploy/DEPLOYMENT.md`).
6. **Restore from backup** — see [Restore from Backup](#restore-from-backup) below. ⚠️ **TODO:** the self-hosted VPS has no managed backup UI; the concrete backup/restore mechanism (pg_dump cron vs. volume/DO snapshots) is not yet defined — do not assume a one-click restore exists.

### P-2: Data Breach / RLS Leak

**Symptoms:** User reports seeing data they shouldn't (wrong account contacts, deals from other entities); or automated alert from pg_tap test failure on RLS policies.

**Steps:**

1. **IMMEDIATELY** disable the affected table's suspect RLS policy via SQL:
   ```sql
   -- Disable only the suspect policy, NOT RLS entirely
   DROP POLICY IF EXISTS <suspect_policy_name> ON <table_name>;
   ```
   Then verify the denylist policy (authenticated users see nothing) takes effect. Do NOT disable RLS on the table — this would leak everything.
2. **Identify scope** of exposure: query `audit_log` for recent reads/writes by the affected user(s). Check Supabase Logs for `table_access` events on the affected table.
3. **Notify** Orrin Xu immediately. Determine if affected users / entities need to be notified per DPDP/GDPR obligations.
4. **Fix** the policy body, write a migration, run pg_tap tests for all three personas, and deploy.
5. **Post-mortem:** why did CI not catch this? Was a test missing? Update RLS tests.

### P-3: AI Cost Runaway

**Symptoms:** AI provider dashboard (Anthropic Console, Google AI Studio) shows spend well above expected daily rate. Or application-level cap logs show a user hitting their cap unusually early (indicating aggressive agent usage).

**Steps:**

1. **Identify the source** — query `ai_usage` for the top spender in the last hour:
   ```sql
   SELECT user_id, provider, model, SUM(cost) as total_cost, COUNT(*) as call_count
   FROM ai_usage WHERE created_at > now() - interval '1 hour'
   GROUP BY user_id, provider, model ORDER BY total_cost DESC;
   ```
2. **Cut off the source** — disable the specific provider for that user via admin panel, or if the global cap is breached, force degraded/Ollama mode by setting the company-scope cap to $0: update the `ai_daily_caps` row where `scope_kind='company'` to a $0 daily cap (via the admin panel or SQL). This routes all traffic to the Ollama fallback.
3. **Check for abuse** — do the `ai_usage` rows show a single automated agent or script? Check `mcp_calls` table if the MCP server is live.
4. **Tighten caps** — reduce per-user daily cap, or switch the offending feature to a cheaper provider (DeepSeek / Ollama).
5. **Notify** Orrin Xu of any cost overrun > $100.

### P-4: Inbound Email Forgery Suspicions

**Symptoms:** Activity appears in the CRM that the user says they did not send; or a client complains about receiving a forged CRM-linked email.

**Steps:**

1. **Check `activities` table** — identify the suspect activity. Note the `created_at`, `user_id`, and `source_metadata`.
2. **Verify DKIM pass/fail** — check the inbound email payload's DKIM status in the dead-letter table or the activity's raw metadata. If DKIM failed and the email was still accepted, this is a Critical bug in the inbound pipeline.
3. **Check `inbound_email_deadletter` table** — are there other recent entries from the same sender or with similar headers?
4. **Revoke the inbound address** — sender matching keys off `users.crm_inbound_email`; clear or rotate the affected user's `crm_inbound_email` value so the old address no longer maps to them, then issue a new one.
5. **Mitigate** — if DKIM verification is not working, stop accepting inbound mail at the source (disable the Postmark inbound config). Note the inbound handler (`lib/email/inbound.ts`) is library-only and is not mounted to any HTTP route, so there is no live endpoint to take down and no `INBOUND_EMAIL_DISABLED` env var.
6. **Notify** Orrin Xu and the affected user's manager.

### P-5: API Key Leak (GitHub / Public Exposure)

**Symptoms:** Gitleaks alert in CI, GitHub secret scanning alert, or unexpected provider activity (e.g., AI calls from unknown IPs).

**Steps:**

1. **Rotate the leaked key** immediately at the provider dashboard (Anthropic Console, Google Cloud, DeepSeek, Resend/Postmark, Slack).
2. **Update the environment variable** in `app.env` on the VPS (and in the self-hosted Supabase `.env` if it's a Supabase-side secret), then `docker compose up -d` to pick it up. If it's a build-time `NEXT_PUBLIC_*` var, rebuild the image via the GitHub Actions pipeline.
3. **Revoke the old key** at the provider after confirming the new key works.
4. **Check for unauthorized usage** — query `ai_usage` for calls made with the old key. If the leak is to GitHub, check repo forks / clones.
5. **If the leak is in git history:** run `git filter-branch` to purge the secret from history, force-push, and notify the team to rebase. Consider rotating all secrets as a precaution.

### P-6: Webhook Endpoint Receiving Forged Events

**Symptoms:** Unexpected Slack messages posted, CRM data changing without corresponding UI action, or inbound activities appearing without an email being sent.

**Steps:**

1. **Test webhook signature verification** — send a forged request to the webhook endpoint (e.g., with Postman) and confirm it's rejected with 401. Reference `lib/webhooks/verify.ts` and `lib/webhooks/postmark.test.ts`.
2. **If signature verification is failing** — check that the `POSTMARK_WEBHOOK_SECRET` env var matches the provider's secret. Check for expired or rotated secrets that haven't been updated.
3. **If signature verification was bypassed** — this is Critical. The verification/handler code lives in `lib/webhooks/postmark.ts` (verification helper in `lib/webhooks/verify.ts`) and `lib/email/inbound.ts`; note no HTTP route is mounted for these yet, so mitigation is at the code/config layer (or the Postmark inbound config) rather than removing a route. Investigate the code path.
4. **Audit** any data changes made during the window the forged events were accepted.

### P-7: OAuth Token Theft / Suspicious Auth Activity

**Symptoms:** User reports CRM activity they didn't perform. Supabase Auth logs show logins from unexpected IPs / locations.

**Steps:**

1. **Revoke the user's session** in Supabase Auth: `SELECT supabase_auth.admin.delete_user_sessions(user_id);`
2. **Force passwordless re-authentication** — user must re-authenticate via Google OAuth, which will issue a new session.
3. **Check `audit_log`** for operations performed under the compromised session. Notify affected account owners if client data was accessed.
4. **If Google OAuth token was stolen** (not just Supabase session) — instruct the user to revoke the CRM app's OAuth grant at https://myaccount.google.com/permissions. Re-grant on next login.
5. **Notify** Orrin Xu.

### P-8: Google Workspace API Quota Exhaustion

> **Forward-looking / not yet built.** The Google Workspace integration is not implemented: Drive is an unwired stub that throws "not configured", and there is no Gmail send path. Treat this procedure as a placeholder for when those features ship — the examples below do not apply to the current system.

**Symptoms:** Drive file creation fails, Gmail send returns 403, Calendar events fail. Google Cloud Console shows quota exhausted.

**Steps:**

1. **Identify the consuming feature** — check `audit_log` for drive/gmail/calendar operations in the last hour. Which feature is making the most API calls?
2. **Temporarily disable the feature** via feature flag.
3. **Request quota increase** in Google Cloud Console (IAM & Admin → Quotas). Common limits: Drive API 5 requests/sec/user, Gmail API 250 requests/sec/user.
4. **Implement backoff** if not already present — ensure API calls use exponential backoff (the `googleapis` library does this by default).
5. **If quota is consistently exhausted,** the feature needs redesign (batch operations, caching, or rate limiting).

### P-9: Slack Notification Failure

**Symptoms:** Stage advances, deal closures, approval requests not appearing in Slack channels.

**Steps:**

1. **Check Slack app status** (https://status.slack.com). If Slack is degraded, wait.
2. **Check Slack delivery logs** in the app container logs (`docker compose logs app` on the VPS). Slack delivery is a raw `fetch` to `chat.postMessage` with the `SLACK_BOT_TOKEN` in `lib/notifications/delivery.ts` (no `@slack/bolt` dependency); failures log the HTTP status. A revoked/rotated token typically surfaces as a non-200 status — update `SLACK_BOT_TOKEN` if so.
3. **Re-install the Slack app** from the Slack API dashboard if the token cannot be recovered.
4. **Check channel membership** — the bot may have been removed from a channel. Re-invite via `/invite @NodwinCRM`.

### P-10: Migration Failure

**Symptoms:** the deploy's **apply-migrations** step fails (`deploy/apply-migrations.sh`, which the pipeline runs on the VPS before starting the app) — the deploy aborts before the new container comes up. Schema mismatch between local and production.

**Steps:**

1. **Do not deploy** — a failed migration blocks the deploy and must be resolved manually.
2. **Check the failing migration SQL** — does it reference a table or column that doesn't exist yet? Does it depend on a migration that hasn't run?
3. **Fix forward** — write a new migration that resolves the issue. Do NOT edit or delete the existing migration file on the `main` branch (migrations are append-only).
4. **If production is in a broken state** — see [Restore from Backup](#restore-from-backup) (mechanism is a TODO on self-host — coordinate with Orrin Xu before attempting).
5. **Test locally first** — run `pnpm db:reset` on a clean local environment to verify the full migration chain works.

## Escalation Contacts

| Role | Name | Contact |
|---|---|---|
| Project Lead / Board | Orrin Xu | Slack DM, [phone redacted] |
| Operational Sponsor | Akshat Rathee | Slack DM |
| Operational Sponsor | Mickael Piantchenko | Slack DM |
| Stakeholder (Trinity) | Abhishek Aggarwal | Slack DM |
| DigitalOcean Support | — | https://www.digitalocean.com/support |
| Supabase (self-hosted / community) | — | https://github.com/supabase/supabase |
| Anthropic Billing | — | support@anthropic.com |
| Google Cloud Support | — | https://cloud.google.com/support |
| Postmark Support | — | https://postmarkapp.com/support |

## Recovery Procedures

### Restore from Backup

> ⚠️ **TODO — procedure not yet defined for the self-hosted stack.** The steps
> below described **Supabase Cloud** (managed dashboard → Backups → Restore →
> new project), which does **not** exist on the self-hosted DigitalOcean VPS.
> Postgres runs in the `db` container with data on a Docker volume; there is no
> managed backup UI. Before this section can be trusted in a real incident, the
> team must decide and document the actual mechanism, e.g.:
>
> - a scheduled `pg_dump`/`pg_basebackup` job on the VPS (define location + retention), restored with `pg_restore`/`psql` into the `db` container, **or**
> - DigitalOcean volume/droplet snapshots (define cadence + restore steps).
>
> Until then: **do not attempt an ad-hoc restore — escalate to Orrin Xu.**

Provisional outline once a mechanism exists:

1. Stop the app container so nothing writes during restore: `docker compose stop app`.
2. Restore the database from the chosen backup source into the `db` container.
3. Re-run any migrations from the backup point forward (the deploy runner is idempotent — see [`deploy/apply-migrations.sh`](../deploy/apply-migrations.sh)).
4. `docker compose up -d app` and verify data integrity: spot-check a sample of accounts + opportunities.

### Manual Rollback of a Deploy

1. On the VPS, identify the last known-good image tag (`:sha-<sha>` in `ghcr.io`).
2. Re-point the app service image to that tag in the compose config (or override).
3. Run `docker compose up -d app` to roll back (see `../deploy/DEPLOYMENT.md`).
4. Verify the app loads and all core flows (login, pipeline view, activity logging) work.

## Post-Incident

1. **Update the runbook** with any gaps discovered during response.
2. **File a follow-up ticket** for any permanent fix, monitoring addition, or test gap.
3. **Critical incidents** require a written post-mortem within 48 hours, shared with Orrin Xu and operational sponsors.
