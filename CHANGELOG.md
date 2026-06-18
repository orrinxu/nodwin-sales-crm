# Changelog

All notable changes to the Nodwin CRM are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- **Accounts — list and detail pages (ORR-466/467):** Companies list page with sidebar nav, bulk delete, and account detail page showing relationships, contacts, opportunities, and linked documents.
- **EntityCombobox component (ORR-542):** Reusable search-or-create picker with server-side search, debounced input, sublabel, and create-on-the-fly support.
- **Opportunity create/edit form (ORR-544/545):** Progressive-disclosure form with EntityCombobox picker, all §4.6 fields, custom fields display, and stage-qualify default.
- **Account Gold Standard fields (ORR-548/549/550):** v1 custom fields seeded (Payment Terms, GST/PAN/VAT/TRN, Main Phone, HQ Address, Credit Risk Flag); progressive-disclosure sections; Gold Standard filter params.
- **Notification engine (ORR-525):** Data access layer, delivery engine (in_app/email/Slack), routing matrix with user overrides, stage_change/deal_won/deal_lost triggers, server action admin UI.
- **Admin — Notifications & Communication UI (ORR-526):** Manage routing (event×channel), email templates with variable interpolation, user overrides, entity comms tracking toggle.
- **Admin — Data Management UI (ORR-529):** Per-entity finance export config (Drive folder, format, schedule) and import/export job history.
- **Admin — Entities, Business Units, Custom Fields, Relationship Types (ORR-507/512):** CRUD admin pages for each, all gated by `requireRole(user, "admin")`. Collapsible Admin sidebar.
- **Admin — Alerts page (ORR-510):** Alert inbox with acknowledge and acknowledge-all actions.
- **Integration config schema (ORR-518):** New DB tables (`integration_settings`, `slack_connections`, `email_settings`, `salesforce_connections`) + admin UI tabs.
- **Financial settings schema (ORR-515):** New DB tables (`reporting_currency_settings`, `fiscal_year_settings`, `approval_thresholds`, `revenue_recognition_defaults`).
- **Entity branding and relationship types (ORR-512):** `entities` branding columns added; `account_relationships.kind` migrated from enum to text FK referencing `relationship_types`.
- **Security compliance — session management (ORR-510):** `admin_sessions` table + `revoke_user_sessions` RPC.
- **Mobile responsive layout (ORR-470):** Mobile sidebar via Sheet; responsive opportunity layout.
- **Setup guide (ORR-408):** `docs/setup-guide.md` — Google OAuth, Supabase Cloud, magic link. Startup guide and OAuth fix. README quick start corrected.
- **Smoke test (ORR-452):** `docs/smoke-test.md` — 3-check pre-deploy procedure (branch guard, schema check, route health). `docs/supabase-environments.md` — local vs production env management.
- **Data model documentation gap-fill (ORR-552):** Account soft-delete `deleted_at` column (§4.4), Opportunity Revenue Schedule (§4.6.4), Currencies Registry (§4.20), FX Rates (§4.21), Admin Alerts (§4.22), and audit log coverage updated. All documented from actual migration SQL — no guessing.

### Changed

- **Opportunity quick-create (ORR-545):** Default stage changed to `qualify`; picker upgraded to EntityCombobox.

### Fixed

- **Mobile rendering (ORR-470):** App shell and opportunities layout fixed for mobile.
- **Security — XSS (ORR-525):** HTML escaping in notification delivery; `NODE_ENV` env schema restored.

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
