# CHANGELOG

Human-readable record of significant changes to the Nodwin CRM build plan and agent rules.
For code changes, see git history and individual PR descriptions.

---

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

## 2026-05-07

### Added

- **Phase 4 Core CRM UI (ORR-345 / ORR-350):** Full opportunity management — create form, edit form, kanban board (dnd-kit), list view (TanStack Table), quick-create, stage history timeline, activity composer and timeline, opportunity splits editor, team editor, document list, and custom fields display.
- **Contacts UI (ORR-345):** Contact list view, detail page, create/edit form with multi-account linking, custom fields display and editing.
- **Document upload (ORR-352 / T-079):** Document upload dialog with Google Drive file creation, document list component with metadata, integration with opportunity detail page.
- **Rich text editor (ORR-353):** Lexical-based rich text editor for opportunity descriptions and activity notes, with display component and test coverage.
- **Login page and auth shell (ORR-321 / T-036):** Google OAuth login flow, session manager, and authenticated CRM shell layout.
- **Sandbox seed data (ORR-312):** `sandbox.sql` seed configuration for demo/training environment.

### Fixed

- **Opportunity data layer (ORR-345):** Resolved type errors across opportunity forms, tests, and data layer. Added missing runtime dependencies.
- **Rich text editor review items (ORR-353):** Addressed CTO review blockers — type safety, test coverage, and dependency hygiene.

---

## 2026-05-06

### Added

- **Database schema — Phase 2/4 foundation (ORR-306 to ORR-311):**
  - `entities` and `business_units` tables with RLS policies and pgTAP tests (ORR-306)
  - `contacts` and `contact_account_links` tables with RLS (ORR-307 / T-022)
  - `documents` table with RLS policies and tests (ORR-308 / T-027)
  - `approval_workflows`, `approval_steps`, `approval_instances` tables (ORR-309 / T-028)
  - `custom_field_definitions` table with validation (ORR-310)
  - `drive_config` table for per-entity Drive folder configuration (ORR-311)
- **AI provider adapters (ORR-177):** Five provider adapters shipped — Anthropic (Messages API), Gemini (Generative Language API), DeepSeek, Moonshot/Kimi, and Ollama. Env-driven factory (`createAdaptersFromEnv`) with AbortController + 30s timeout on all providers. Cap enforcement via `lib/ai/cap-enforcement.ts` with per-user/team/company ceilings, tested at $1 cap boundary.
- **Multi-approver vote aggregation (ORR-132):** XState approval state machine supporting `any_one` and `all_required` modes across sequential steps. Handles per-approver voting, skip, rejection.
- **Deal-stage state machine (ORR-178):** XState deal-stage machine with forward/backward/force/reopen transitions and stage history tracking.
- **Security review findings (ORR-177):** Gemini API key moved from URL query param to `x-goog-api-key` header. URL encoding fixes. AbortController + 30s timeout to all providers. `audit.ts` actor_source detection improved.

### Fixed

- **Activities RLS policies tightened (ORR-262):** CEO-reviewed tightening of activities SELECT/INSERT/UPDATE policies.
- **Audit log restricted to admin-only (ORR-273):** Previously any authenticated user could read the full audit trail (IPs, user agents, field diffs). Now restricted via `current_user_role()` check.
- **PM2 config (ORR-133):** Switched to `pnpm --filter web start` for correct workspace compatibility.
- **RLS policy linter and exemptions (ORR-266 / ORR-297):** Added `.rls-allowlist` exemption mechanism, tightened `currencies` policies with `current_user_role()`, resolved linter warnings and false positives, added test coverage for `no-float-math-in-money-layer` ESLint rule.

### Security

- RLS policies for `activities` and `audit_log` tables hardened against unauthorized read/insert/update.
- External security review findings (Gemini key in URL, missing timeouts, audit source gaps) remediated.

---

## 2026-05-04

### Added

- Queue Phase 9.5 (MCP server) for post-East-Asia rollout. Add `{ user, source }` parameter requirement to `lib/data/` functions in preparation.
