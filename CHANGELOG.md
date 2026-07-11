# Changelog

All notable changes to the Nodwin CRM are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- Setup guide: `docs/setup-guide.md` — Google OAuth, Supabase Cloud project creation, and magic link email configuration
- `.env.example` with all auth, SMTP, and integration environment variables
- **Startup guide (ORR-408):** `docs/startup-guide.md` — step-by-step local dev setup with environment config, Supabase local stack, seed data, verification checklist, and troubleshooting
- **Setup guide OAuth fix (ORR-408):** Quick start corrected in `docs/setup-guide.md` — OAuth redirect URI now points to `https://<project-ref>.supabase.co/auth/v1/callback` (Supabase is the broker, not the app); free-tier noted as sufficient for dev sandbox; local Supabase listed as alternative to Cloud project. GCP redirect URI documentation fixed in §2.1 and troubleshooting table
- **README:** Quick start corrected to point at `apps/web/.env.example`; `setup-guide.md` and `startup-guide.md` added to project structure listing
- **Smoke test procedure (ORR-452):** `docs/smoke-test.md` — codified 3-check pre-deploy smoke test (branch guard, schema check, route health check + process restart). `docs/runbook-incident.md` updated to reference the smoke procedure in the P-1 response and as a pre-deploy gate.

### Changed

- **Admin settings navigation — grouped sections:** the 14 admin items are regrouped from a single flat list into 5 labelled, expanded-and-collapsible sections (Organization, Access & Security, Data, Automation & AI, Integrations). **Deviation from the original flat-list settings nav:** at 14 items a flat list is hard to scan; grouping foundational → operational sections restores scannability. Presentation-only — same items, routes, and icons; no data-layer change. The grouping is a shared config (`components/layout/admin-nav.ts`) consumed by the sidebar and (next) the admin landing page.
- **Opportunity detail layout rework (ORR-658, T-059):** rebalanced the opportunity detail page so the wide column carries the deal fields and a Communications tab group (Activity/Notes/Calls/Email), and the right rail holds only compact summary cards (Approval, Team, Splits, Stage History, Deal Copilot). The stage progress bar gained a real clickable affordance (hover + tooltip) in place of the "click a stage" caption, and the redundant approval surfacing was trimmed. **Deliberate deviation from T-059:** T-059 specified Documents as a tab alongside Notes/Activity/Call/Email; instead Documents is an **always-visible band** directly under the stage bar (pinned RFP/Proposal/Contract slots + the full grouped list), because deals here are document-centric and burying files in a tab hid the primary artifact. Layout only — no schema, data-layer, or RLS changes.

## 2026-05-08

### Added

- **Vercel deployment guide (ORR-390):** `docs/deploy-vercel.md` — comprehensive setup instructions mirroring the GitHub CI pipeline. Covers project creation, environment variables, DNS, Google OAuth callback configuration, per-environment settings, migration strategy, and troubleshooting. README deployment section updated to link to the new guide.

## 2026-05-06

### Added

- **AI provider adapters (ORR-177):** Five provider adapters shipped — Anthropic (Messages API), Gemini (Generative Language API), DeepSeek, Moonshot/Kimi, and Ollama. Env-driven factory (`createAdaptersFromEnv`) with AbortController + 30s timeout on all providers. Cap enforcement via `lib/ai/cap-enforcement.ts` with per-user/team/company ceilings, tested at $1 cap boundary.
- **Multi-approver vote aggregation (ORR-132):** XState approval state machine supporting `any_one` and `all_required` modes across sequential steps. Handles per-approver voting, skip, rejection.
- **Deal-stage state machine (ORR-178):** XState deal-stage machine with forward/backward/force/reopen transitions and stage history tracking.
- **Security review findings (ORR-177):** Gemini API key moved from URL query param to `x-goog-api-key` header. URL encoding fixes. AbortController + 30s timeout to all providers. `audit.ts` actor_source detection improved.

### Fixed

- **Activities RLS policies tightened (ORR-262):** CEO-reviewed tightening of activities SELECT/INSERT/UPDATE policies.
- **Audit log restricted to admin-only (ORR-273):** Previously any authenticated user could read the full audit trail (IPs, user agents, field diffs). Now restricted via `current_user_role()` check.
- **PM2 config (ORR-133):** Switched to `pnpm --filter web start` for correct workspace compatibility.

### Security

- RLS policies for `activities` and `audit_log` tables hardened against unauthorized read/insert/update.
- External security review findings (Gemini key in URL, missing timeouts, audit source gaps) remediated.

## 2026-05-04

### Added

- Queue Phase 9.5 (MCP server) for post-East-Asia rollout. Add `{ user, source }` parameter requirement to `lib/data/` functions in preparation.
