# BUILD_TICKETS.md

> The ordered ticket list for the Nodwin CRM build.
> Read this alongside `AGENTS.md`, `README.md`, and `BOARD_RUNBOOK.md`.
> Tickets are worked top-to-bottom unless dependencies dictate otherwise.

---

## How to read this file

Each ticket has:

- **ID** — short identifier, e.g. `T-001`. Reference this in commits and PR titles.
- **Title** — what the ticket is.
- **Phase** — which build phase it belongs to (Foundation, Core, Integrations, etc.).
- **Depends on** — tickets that must be complete first.
- **Estimated size** — XS / S / M / L / XL. Rough indicator of complexity, not time.
- **Files in scope** — what the agent is allowed to touch.
- **Acceptance criteria** — explicit "this is done when..." conditions.
- **Approval level** — who has to approve the PR.
  - `cto` — CTO agent reviews and approves
  - `board` — human board (you) personally approves
  - `cto + board` — both
  - `cto + security` — CTO agent plus the security review agent
- **Notes** — anything the agent needs to know that isn't obvious.

If a ticket touches a high-risk file (`AGENTS.md` §6), approval level is at minimum `cto + board`. Some are also `+ security`.

---

## Phase summary

| Phase | Tickets | Approx weeks |
|---|---|---|
| 0. Pre-flight | T-001 to T-005 | 1 |
| 1. Safety primitives | T-006 to T-018 | 2 |
| 2. Schema and RLS | T-019 to T-035 | 2 |
| 3. Auth and shell | T-036 to T-042 | 1 |
| 4. Core CRM | T-043 to T-068 | 4 |
| 5. Integrations | T-069 to T-088 | 3 |
| 6. P&L and approvals | T-089 to T-097 | 2 |
| 7. Dashboards | T-098 to T-108 | 2 |
| 8. Migration and UAT | T-109 to T-118 | 2 |
| 9. Hardening and audit | T-119 to T-126 | 2 |

Total: roughly 126 tickets across 21 weeks. Realistic timeline accounting for rework, security findings, and surprises: 22–24 weeks before East Asia parallel run.

---

# Phase 0 — Pre-flight

These tickets establish the repo skeleton. Nothing else can start until these are done.

---

### T-001 — Initialise project skeleton

- **Phase:** Pre-flight
- **Depends on:** none
- **Size:** S
- **Files in scope:** `package.json`, `tsconfig.json`, `tsconfig.base.json`, `pnpm-workspace.yaml`, `.gitignore`
- **Approval:** `board`
- **Acceptance:**
  - Next.js 15+ with App Router, TypeScript strict mode, React 19+
  - pnpm workspaces configured
  - `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test` commands all work (even if no-op)
  - All dependencies pinned to specific versions (no `^` or `~`)
  - `.gitignore` covers `node_modules`, `.next`, `.env*`, OS junk
- **Notes:** Use `create-next-app` as starting point but strip the bundled example code. Use shadcn/ui CLI to initialise, but do not add any components yet — that's later tickets.

---

### T-002 — Configure ESLint with safety rules

- **Phase:** Pre-flight
- **Depends on:** T-001
- **Size:** S
- **Files in scope:** `.eslintrc.cjs`, `package.json`
- **Approval:** `cto + board`
- **High-risk file change:** yes (eslintrc)
- **Acceptance:**
  - ESLint configured with `eslint-config-next` and TypeScript support
  - Custom rule banning `Number()`, `parseFloat`, `parseInt`, `+` coercion for any variable matching `/amount|cost|revenue|margin|price|fee|budget/i`
  - Custom rule banning direct `fetch()` to `*.anthropic.com`, `*.googleapis.com/v1`, `api.openai.com`, `api.deepseek.com`, `api.moonshot.cn` from anywhere except `lib/ai/router.ts`
  - Custom rule requiring `lib/security/auth.ts` import in any file that performs auth checks
  - `pnpm lint` passes on the empty starter
  - At least one unit test confirms a violating snippet would be caught
- **Notes:** Without these rules from day one, agents will introduce violations that are painful to fix later.

---

### T-003 — Configure CI pipeline

- **Phase:** Pre-flight
- **Depends on:** T-001, T-002
- **Size:** M
- **Files in scope:** `.github/workflows/ci.yml`, `.github/workflows/secret-scan.yml`
- **Approval:** `cto + board`
- **High-risk file change:** yes (workflows)
- **Acceptance:**
  - `ci.yml` runs on every PR: install, lint, typecheck, vitest, RLS test runner (placeholder for now), build
  - `secret-scan.yml` runs gitleaks on every PR
  - Branch protection on `main`: PRs required, all CI checks must pass
  - CI runs in <5 min on the empty repo
- **Notes:** Branch protection is configured by the board in GitHub Settings, not in code. Surface a board reminder when this ticket completes.

---

### T-004 — Set up Supabase local dev environment

- **Phase:** Pre-flight
- **Depends on:** T-001
- **Size:** M
- **Files in scope:** `supabase/config.toml`, `package.json` scripts (`supabase:start`, `db:migrate`, `db:reset`, `db:seed`)
- **Approval:** `cto`
- **Acceptance:**
  - Local Supabase stack starts via `pnpm supabase:start`
  - Local URL is `http://localhost:54321` (Supabase) and Studio at `54323`
  - `db:migrate` applies migrations from `supabase/migrations/`
  - `db:reset` nukes and re-applies + seeds
  - Documentation in `README.md` updated with prerequisites (Docker)
- **Notes:** Use the Supabase CLI. Do not commit any actual API keys to `config.toml`.

---

### T-005 — Convert SOW to markdown and split into reference docs

- **Phase:** Pre-flight
- **Depends on:** T-001
- **Size:** M
- **Files in scope:** `docs/SOW.md`, `docs/data-model.md`, `docs/integrations.md`, `docs/security.md`, `docs/runbook-incident.md`
- **Approval:** `board`
- **Acceptance:**
  - Full SOW available as `docs/SOW.md` (markdown, agent-readable)
  - Section 4 of the SOW (data model) extracted to `docs/data-model.md` with detailed field-by-field documentation
  - Section 6 (integrations) to `docs/integrations.md`
  - Section 8 (security) to `docs/security.md`, plus a placeholder `docs/runbook-incident.md`
  - Cross-links between docs work
- **Notes:** Agent should preserve all SOW content and add nothing — this is a format conversion, not a rewrite. Board provides the .docx; agent does the conversion.

---

# Phase 1 — Safety primitives

Every ticket in this phase touches high-risk files. **Every one requires `cto + board` approval.** The board personally reviews these PRs. Take your time on these; nothing else proceeds until they're solid.

---

### T-006 — Environment variable validation

- **Phase:** Safety primitives
- **Depends on:** T-001
- **Size:** S
- **Files in scope:** `lib/security/env.ts`, `.env.example`
- **Approval:** `cto + board`
- **High-risk file change:** yes
- **Acceptance:**
  - Zod schema validates all required env vars at process startup
  - Missing required vars cause a fatal error with a clear message naming the missing var
  - Optional vars have explicit defaults
  - Server-only vars (e.g. `SUPABASE_SERVICE_ROLE_KEY`) are exported only from server modules
  - Client-safe vars (`NEXT_PUBLIC_*`) are separately exported
  - Tests confirm validation fails for missing vars, malformed URLs, malformed keys
  - `.env.example` lists every variable with a comment explaining what it's for
- **Notes:** Without this, agents will scatter `process.env.X` across the codebase with inconsistent fallbacks. Centralising forces correctness.

---

### T-007 — Money primitive

- **Phase:** Safety primitives
- **Depends on:** T-001, T-002
- **Size:** M
- **Files in scope:** `lib/money.ts`, `lib/money.test.ts`
- **Approval:** `cto + board + security`
- **High-risk file change:** yes
- **Acceptance:**
  - Wraps `dinero.js` with helpers: `money()`, `add()`, `subtract()`, `multiply()`, `allocate()`, `format()`, `toMinorUnits()`, `fromMinorUnits()`, `parse()`, `serialize()` for storage, `deserialize()` for retrieval
  - Supports all currencies in `iso-4217` plus admin-defined custom currencies (e.g. `USDT`) via a registry
  - All operations preserve precision; never converts to JS `number`
  - Currency mismatch in `add()`/`subtract()` throws — never silently coerces
  - Serialisation format is `{ amount: string, currency: string, scale: number }` for storage in JSONB or as separate columns
  - `parse('1,234.56', 'USD')` works for user input
  - `format(money(1234.56, 'USD'))` returns `'$1,234.56'` — locale-aware
  - Test coverage: every helper has tests including currency-mismatch rejection, edge cases (zero, negative, very large numbers), parsing variations (commas, decimals, parens for negative)
- **Notes:** This is the foundation that all amount handling depends on. Get it right. Use `dinero.js` v2 (which uses bigint internally). The custom currency registry has to support adding new ISO-style codes from the admin panel later.

---

### T-008 — AI provider router

- **Phase:** Safety primitives
- **Depends on:** T-006
- **Size:** L
- **Files in scope:** `lib/ai/router.ts`, `lib/ai/providers/*.ts`, `lib/ai/router.test.ts`, `lib/ai/types.ts`
- **Approval:** `cto + board + security`
- **High-risk file change:** yes
- **Acceptance:**
  - Single entry point `aiCall({ feature, user, prompt, ... })` for all AI calls
  - Provider adapters for: Anthropic, Google Gemini, Moonshot Kimi, DeepSeek, Ollama (self-hosted)
  - Provider selection logic: per-feature preference → per-user override → admin global override → fallback chain
  - **Cap enforcement BEFORE the call:** check per-user daily soft/hard cap, per-team daily cap, per-company daily cap. Reject (or downgrade to Ollama) if hard cap would be breached.
  - Per-request token cap (default 8K input / 4K output) prevents runaway prompts
  - Every call writes to `ai_usage` table: user_id, provider, model, input_tokens, output_tokens, cost_usd, feature, request_id, started_at, finished_at, status
  - Provider errors fall back to next provider in chain; if all fail, return clear error to caller
  - Tests cover: cap enforcement (set $1 cap, 11th call rejects), fallback chain (mock primary failing), token cap (oversized prompt rejected), usage logging (every call writes a row)
- **Notes:** Provider API keys come from `lib/security/env.ts`. The `feature` parameter is an enum: `search`, `summarise_deal`, `draft_email`, `next_best_action`, etc. New features need explicit registration. The Ollama URL is configurable; if unreachable, treat as provider failure.

---

### T-009 — Webhook signature verification

- **Phase:** Safety primitives
- **Depends on:** T-006
- **Size:** M
- **Files in scope:** `lib/webhooks/verify.ts`, `lib/webhooks/slack.ts`, `lib/webhooks/postmark.ts`, `lib/webhooks/google.ts`, `lib/webhooks/*.test.ts`
- **Approval:** `cto + board + security`
- **High-risk file change:** yes
- **Acceptance:**
  - `verifySlackWebhook(req)` using `@slack/bolt`'s built-in verification
  - `verifyPostmarkWebhook(req)` using Postmark's documented HMAC method
  - `verifyGoogleWebhook(req)` for Drive change notifications
  - Each verifier returns `{ verified: true, payload }` or throws `WebhookVerificationError`
  - Each handler in `app/api/webhooks/*` calls verification as the **first line** before any business logic
  - Tests for each verifier: valid signature passes, tampered payload fails, missing signature fails, replay (old timestamp) fails
  - **Test specifically:** a request with the body modified after signing must reject
- **Notes:** Use the official SDKs for verification. Do not implement HMAC-SHA256 by hand. The replay protection (timestamp tolerance) defaults to 5 minutes — configurable per webhook source.

---

### T-010 — Inbound email pipeline (parser + sender verification)

- **Phase:** Safety primitives
- **Depends on:** T-009
- **Size:** L
- **Files in scope:** `lib/email/inbound.ts`, `lib/email/inbound.test.ts`, `app/api/webhooks/inbound-email/route.ts`
- **Approval:** `cto + board + security`
- **High-risk file change:** yes
- **Acceptance:**
  - Webhook endpoint receives Postmark Inbound POSTs, verifies signature first (T-009)
  - Parses email: from, to, cc, subject, body, attachments, in-reply-to, message-id
  - **Sender verification:** the From header must match a known email belonging to the user identified by the inbound token address. Mismatch → write to dead-letter table, alert admin, do not create activity.
  - **DKIM verification status from Postmark must be `Pass`.** If not, dead-letter.
  - Account matching: parse other recipients' domains, look up Account.email_domains, attach if exactly one match
  - Opportunity matching: if subject contains `[OPP-{id}]` pattern, attach to that opportunity (after RLS check that user can write to it)
  - Multi-match or no-match: create unassigned Activity for user to assign in UI
  - Attachments under 25MB upload to the matched Drive folder (uses Drive integration from later ticket — for now, store metadata and TODO marker)
  - Tests: forged sender (different From) → rejected, replay attack (same message-id twice) → second is dropped, account match by domain works, no-match creates unassigned activity, oversized attachment is skipped with note, DKIM fail goes to dead-letter
- **Notes:** This is one of the highest-risk components in the system. A compromised inbound parser lets attackers inject fabricated client communications. Test the adversarial cases. The dead-letter table is `inbound_email_deadletter` (created in schema phase).

---

### T-011 — Auth helpers and Google OAuth setup

- **Phase:** Safety primitives
- **Depends on:** T-006
- **Size:** M
- **Files in scope:** `lib/security/auth.ts`, `lib/security/auth.test.ts`, `app/api/auth/callback/route.ts`, `supabase/functions/auth-hook/index.ts`
- **Approval:** `cto + board + security`
- **High-risk file change:** yes
- **Acceptance:**
  - `requireUser(req)` returns the authenticated Supabase user or throws `UnauthorisedError`
  - `requireRole(user, role)` checks role from `users` table
  - Domain allow-list enforced via Supabase Auth Hook: rejects sign-up from non-allowlisted domains
  - Domain allow-list is a config table (`auth_allowed_domains`) editable from admin panel — not hardcoded
  - Google OAuth flow works end-to-end in local dev with a test Google Workspace account
  - Tests: allowlisted domain succeeds, non-allowlisted domain rejected, malformed JWT rejected, expired JWT rejected
- **Notes:** Default allow-list seeded with `nodwin.com`, `trinitygaming.in`, `maxlevel.gg`. Other domains added later from admin panel. Auth Hook is server-side, runs on every sign-up.

---

### T-012 — Rate limiting middleware

- **Phase:** Safety primitives
- **Depends on:** T-006, T-011
- **Size:** S
- **Files in scope:** `lib/security/rate-limit.ts`, `lib/security/rate-limit.test.ts`
- **Approval:** `cto + board`
- **High-risk file change:** yes
- **Acceptance:**
  - Rate limiter using Upstash Redis (or Supabase native if Upstash not provisioned)
  - Configurable per-route limits: e.g. `/api/ai/*` is 5/min unauthenticated, 30/min authenticated
  - Per-user, per-endpoint tracking
  - Returns 429 with `Retry-After` header when exceeded
  - Tests: rapid fire 100 requests, confirm 429s after limit
- **Notes:** Even with the AI cost caps in T-008, rate limiting is a separate defence — caps prevent cost runaway, rate limits prevent denial-of-service. Both are needed.

---

### T-013 — Audit log primitives

- **Phase:** Safety primitives
- **Depends on:** T-011
- **Size:** S
- **Files in scope:** `lib/security/audit.ts`, `supabase/migrations/0002_audit.sql` (placeholder for the table; full schema in Phase 2)
- **Approval:** `cto + board`
- **High-risk file change:** yes
- **Acceptance:**
  - `audit({ action, table, row_id, actor, before, after, request })` writes to `audit_log` table
  - Postgres trigger pattern for automatic audit on INSERT/UPDATE/DELETE — defined as a reusable function `audit.log_change()`
  - The trigger function captures: actor (from JWT), IP (from header), user agent, before/after JSONB, occurred_at
  - Tests: triggers fire on insert/update/delete, payload contains expected fields
- **Notes:** Phase 2 migrations will apply this trigger to opportunities, accounts, contacts, etc. This ticket just builds the primitive.

---

### T-014 — Money column type and helpers for Postgres

- **Phase:** Safety primitives
- **Depends on:** T-007
- **Size:** S
- **Files in scope:** `supabase/migrations/0001_money_helpers.sql`
- **Approval:** `cto + board`
- **High-risk file change:** yes
- **Acceptance:**
  - Postgres composite type or convention for money: `numeric(20,4) amount` + `text currency` columns, always together
  - Postgres function `money_eq(a_amount, a_currency, b_amount, b_currency)` that throws on currency mismatch
  - Postgres function `money_add(...)` similarly
  - Comment in SQL explicitly stating: "DO NOT use float, real, double precision, or numeric without scale for money. See AGENTS.md."
- **Notes:** Postgres equivalent of T-007. Belt and braces.

---

### T-015 — XState approval state machine

- **Phase:** Safety primitives
- **Depends on:** T-001
- **Size:** M
- **Files in scope:** `lib/workflows/approval.ts`, `lib/workflows/approval.test.ts`
- **Approval:** `cto + board`
- **High-risk file change:** yes
- **Acceptance:**
  - XState v5 machine modelling: `pending` → `step_1_pending` → `step_2_pending` → `approved` / `rejected` / `skipped`
  - Sequential and parallel step modes (per `approval_steps.mode`)
  - `any_one` and `all_required` step approval modes
  - Cannot transition to `approved` unless every required step is approved
  - Cannot bypass via direct state mutation — illegal transitions throw
  - Tests: happy path, rejection at step 2, parallel approval, all-required mode, illegal transitions blocked
- **Notes:** The state machine is the source of truth for approval validity. The UI shows state, but the UI cannot bypass it. The Postgres CHECK constraints in Phase 2 mirror the same rules as a second line of defence.

---

### T-016 — Opportunity stage state machine

- **Phase:** Safety primitives
- **Depends on:** T-001
- **Size:** S
- **Files in scope:** `lib/workflows/deal-stage.ts`, `lib/workflows/deal-stage.test.ts`
- **Approval:** `cto`
- **Acceptance:**
  - State machine: `qualify` → `meet_and_present` → `propose` → `negotiate` → `verbal_agreement` → `closed_won` | `closed_lost`
  - Allowed transitions enforce forward progression (with explicit "move backward" event for legitimate use cases)
  - `closed_won` and `closed_lost` are terminal — re-opening requires explicit `reopen` event with reason
  - Stage history side effect: every transition writes to `opportunity_stage_history` table
  - Tests: happy path through to won, can't skip stages without explicit force, can move backward with reason
- **Notes:** The `closed_*` terminal states are critical for revenue recognition correctness. Reopening must be auditable.

---

### T-017 — Test infrastructure for RLS policies

- **Phase:** Safety primitives
- **Depends on:** T-004
- **Size:** M
- **Files in scope:** `supabase/tests/_helpers.sql`, `package.json` script `db:test`
- **Approval:** `cto + board`
- **High-risk file change:** yes
- **Acceptance:**
  - SQL test runner using `pgTAP` extension
  - Helper functions: `as_user(email)`, `assert_can_select(table, predicate)`, `assert_cannot_select(table, predicate)`, `assert_can_insert(table, payload)`, `assert_cannot_insert(table, payload)`
  - `pnpm db:test` runs all `.test.sql` files in `supabase/tests/` against a freshly-migrated DB and reports pass/fail
  - CI integration: `db:test` runs on every PR
  - Sample test demonstrating the pattern with a placeholder table
- **Notes:** This is the infrastructure that makes RLS testing real. Without `pgTAP` and the helpers, agents will write "tests" that don't actually exercise RLS. Make sure tests run in a transaction that's rolled back, so tests don't pollute each other.

---

### T-018 — Logging and observability primitives

- **Phase:** Safety primitives
- **Depends on:** T-006
- **Size:** S
- **Files in scope:** `lib/logger.ts`, `lib/logger.test.ts`
- **Approval:** `cto`
- **Acceptance:**
  - Structured logging using a thin wrapper (consider `pino`)
  - Log levels: debug, info, warn, error
  - Never logs secrets, full webhook payloads, or full email bodies
  - Sensitive field allow-list: `req.headers.authorization`, `req.body.password`, `req.body.token`, `*api_key*`, `*secret*` are redacted automatically
  - Tests: redaction works, level filtering works
- **Notes:** Sentry / external error tracking comes later (v1.5). For now, Vercel + Supabase native logging is enough.

---

# Phase 2 — Schema and RLS

This phase builds the entire database schema in order, with RLS policies and tests for every table. Every ticket here touches high-risk files. **Every PR requires `cto + board` approval, and the schema-defining tickets (T-019 through T-029) additionally require the security review agent.**

The order matters. Don't reorder.

---

### T-019 — Migration 0003: entities and business units

- **Phase:** Schema and RLS
- **Depends on:** T-014, T-017
- **Size:** M
- **Files in scope:** `supabase/migrations/0003_entities.sql`, `supabase/policies/entities.sql`, `supabase/tests/entities.test.sql`, `supabase/policies/business_units.sql`, `supabase/tests/business_units.test.sql`
- **Approval:** `cto + board + security`
- **High-risk file change:** yes
- **Acceptance:**
  - Tables `entities` and `business_units` per `docs/data-model.md` §4.1, §4.2
  - RLS enabled on both
  - Policies: all authenticated users can read; only admins can write
  - Tests: rep can read, rep cannot insert, admin can insert, soft-delete preserves visibility
- **Notes:** Seed data for entities/BUs comes later in T-035.

---

### T-020 — Migration 0004: users table

- **Phase:** Schema and RLS
- **Depends on:** T-019
- **Size:** M
- **Files in scope:** `supabase/migrations/0004_users.sql`, `supabase/policies/users.sql`, `supabase/tests/users.test.sql`
- **Approval:** `cto + board + security`
- **High-risk file change:** yes
- **Acceptance:**
  - Public `users` table linked by Supabase auth user id, all fields per `docs/data-model.md` §4.3
  - Generated `crm_inbound_email` per user using cryptographically secure random token
  - Postgres trigger on `auth.users` INSERT creates corresponding `public.users` row
  - RLS policies: users can read self + same-entity users; admins read all; only admin can update primary_role / manager_user_id
  - Tests: user can read own record, user can update own non-admin fields, user cannot escalate own role, admin can manage roles
- **Notes:** The inbound email token must be unique. Use `crypto.gen_random_bytes(6) || '@crm.nodwin.com'` pattern. Never reuse a token even if a user is deleted.

---

### T-021 — Migration 0005: accounts and account_relationships

- **Phase:** Schema and RLS
- **Depends on:** T-020
- **Size:** M
- **Files in scope:** `supabase/migrations/0005_accounts.sql`, `supabase/policies/accounts.sql`, `supabase/tests/accounts.test.sql`
- **Approval:** `cto + board + security`
- **High-risk file change:** yes
- **Acceptance:**
  - `accounts` and `account_relationships` per data model
  - `account_relationships.kind` enum supports the company-tree relationships
  - RLS: all authenticated users in the group can read accounts (accounts are not deal-confidential, just associated companies); writes restricted by role
  - Audit log triggers applied (using T-013 helpers)
  - Tests for read access and write restrictions
- **Notes:** The hierarchical relationship table is what enables the Tencent-subsidiary visualisation later.

---

### T-022 — Migration 0006: contacts

- **Phase:** Schema and RLS
- **Depends on:** T-021
- **Size:** S
- **Files in scope:** `supabase/migrations/0006_contacts.sql`, `supabase/policies/contacts.sql`, `supabase/tests/contacts.test.sql`
- **Approval:** `cto + board + security`
- **High-risk file change:** yes
- **Acceptance:**
  - `contacts` table + `contact_account_links` for many-to-many
  - Same RLS pattern as accounts
  - Audit log applied
- **Notes:** Standard CRUD with audit. Nothing unusual.

---

### T-023 — Migration 0007: opportunity_visibility (materialised)

- **Phase:** Schema and RLS
- **Depends on:** T-020, T-019
- **Size:** L
- **Files in scope:** `supabase/migrations/0007_visibility.sql`, `supabase/policies/visibility.sql`, `supabase/tests/visibility.test.sql`
- **Approval:** `cto + board + security`
- **High-risk file change:** yes
- **Acceptance:**
  - `opportunity_visibility` table: `(opportunity_id, user_id, reason)` rows
  - Function `recompute_visibility_for_opportunity(opp_id)` rebuilds rows based on: owner, team membership, reporting tree, visibility tier, splits
  - Function `recompute_visibility_for_user(user_id)` recomputes for all opportunities affecting that user
  - Triggers on opportunities, opportunity_team_members, opportunity_splits, users (manager change) call the recompute functions
  - Tests:
    - Standard tier: owner + team + manager chain see it
    - Restricted tier: owner + team only see it; manager does NOT
    - Confidential tier: only named individuals
    - Revenue split contributing unit: that unit's manager sees it
    - User added to team: visibility row added
    - User removed from team: visibility row removed
    - Manager change: visibility chain updates
- **Notes:** This is the linchpin of the entire RLS architecture. The opportunity SELECT policy is just `EXISTS (SELECT 1 FROM opportunity_visibility WHERE opportunity_id = id AND user_id = auth.uid())`. Everything else cascades. Get this right and the rest of RLS is mechanical. Get it wrong and you have a leak.

---

### T-024 — Migration 0008: opportunities + splits + team

- **Phase:** Schema and RLS
- **Depends on:** T-023
- **Size:** L
- **Files in scope:** `supabase/migrations/0008_opportunities.sql`, `supabase/policies/opportunities.sql`, `supabase/tests/opportunities.test.sql`
- **Approval:** `cto + board + security`
- **High-risk file change:** yes
- **Acceptance:**
  - `opportunities`, `opportunity_splits`, `opportunity_team_members` per data model
  - All numeric monetary columns are `numeric(20,4)`
  - `opportunity_splits` CHECK constraint: per-opportunity sum of pct = 100
  - `opportunities.stage` enum matches T-016
  - Stage transition CHECK (or trigger) prevents illegal stage jumps
  - RLS SELECT policy uses `opportunity_visibility` table
  - RLS UPDATE policy: owner, team contributor/owner, group_sales_lead, admin
  - RLS DELETE policy: admin only
  - Audit log applied to all three tables
  - Tests:
    - Owner can read/update
    - Team viewer can read but not update
    - Restricted tier denies even direct manager
    - Stage transition trigger blocks illegal jumps
    - Splits sum constraint enforced
- **Notes:** This is the most critical table in the whole system. The PR for this ticket should be the most carefully reviewed PR in the entire build.

---

### T-025 — Migration 0009: opportunity_stage_history

- **Phase:** Schema and RLS
- **Depends on:** T-024
- **Size:** S
- **Files in scope:** `supabase/migrations/0009_stage_history.sql`, `supabase/policies/stage_history.sql`, `supabase/tests/stage_history.test.sql`
- **Approval:** `cto + board + security`
- **High-risk file change:** yes
- **Acceptance:**
  - History table with from_stage, to_stage, changed_by, changed_at, time_in_previous_stage, reason
  - Trigger on opportunities table writes history on every stage change
  - RLS: read access matches the parent opportunity (via visibility)
  - Tests confirm history is written and visibility cascades
- **Notes:** The `time_in_previous_stage` is computed in the trigger from the previous row.

---

### T-026 — Migration 0010: activities

- **Phase:** Schema and RLS
- **Depends on:** T-024
- **Size:** M
- **Files in scope:** `supabase/migrations/0010_activities.sql`, `supabase/policies/activities.sql`, `supabase/tests/activities.test.sql`
- **Approval:** `cto + board + security`
- **High-risk file change:** yes
- **Acceptance:**
  - Activities table per data model with all fields
  - `external_thread_id` indexed for dedupe
  - RLS: read if user can see the linked opportunity / account; write if user is author or admin
  - Tests: rep can log own activity, rep can read team activities, rep cannot edit others' activities
- **Notes:** `inbound_email_deadletter` table also created here (referenced by T-010).

---

### T-027 — Migration 0011: documents

- **Phase:** Schema and RLS
- **Depends on:** T-024
- **Size:** S
- **Files in scope:** `supabase/migrations/0011_documents.sql`, `supabase/policies/documents.sql`, `supabase/tests/documents.test.sql`
- **Approval:** `cto + board + security`
- **High-risk file change:** yes
- **Acceptance:**
  - Documents table — stores Drive file IDs and metadata, not file contents
  - RLS: read if user can see linked opportunity/account; write if user is on team
  - Tests: standard read/write enforcement
- **Notes:** Drive files themselves get permissions managed via the Google API in Phase 5 — this table is just metadata.

---

### T-028 — Migration 0012: approval_workflows + approval_instances

- **Phase:** Schema and RLS
- **Depends on:** T-024, T-015
- **Size:** L
- **Files in scope:** `supabase/migrations/0012_approvals.sql`, `supabase/policies/approvals.sql`, `supabase/tests/approvals.test.sql`
- **Approval:** `cto + board + security`
- **High-risk file change:** yes
- **Acceptance:**
  - `approval_workflows`, `approval_steps`, `approval_instances`, `approval_decisions` tables
  - Workflows tied to entity (or null = group default)
  - `enforce_gate` boolean on workflow — defaults false in v1
  - State machine state stored in `approval_instances.state` (XState-compatible JSON)
  - Trigger on opportunities stage change creates approval_instance if a matching workflow exists
  - RLS: workflows readable by all (it's metadata); decisions readable by people with visibility on the opportunity
  - Tests: workflow triggers correctly, decision recording works, state machine validity enforced at DB level via CHECK constraints
- **Notes:** When `enforce_gate = true` (admin toggles), the opportunity stage trigger checks for approved instance before allowing transition. v1 ships with enforce_gate = false but the code path is wired up.

---

### T-029 — Migration 0013: custom field definitions

- **Phase:** Schema and RLS
- **Depends on:** T-022, T-024
- **Size:** M
- **Files in scope:** `supabase/migrations/0013_custom_fields.sql`, `supabase/policies/custom_fields.sql`, `supabase/tests/custom_fields.test.sql`
- **Approval:** `cto + board + security`
- **High-risk file change:** yes
- **Acceptance:**
  - `field_definitions` table per data model
  - JSONB validation function for custom_data based on field definitions
  - Function `validate_custom_data(entity_type, custom_data jsonb)` returns boolean
  - Trigger on opportunities/accounts/contacts validates custom_data on insert/update
  - RLS: definitions readable by all; only admin can write
  - Tests: required field enforcement, type validation (string vs. number), select-field options enforced, soft-delete preserves data
- **Notes:** Renaming or hard-deleting a field requires a migration script; the soft-delete pattern is how the admin GUI handles "remove" without destroying historical data.

---

### T-030 — Migration 0014: ai_usage

- **Phase:** Schema and RLS
- **Depends on:** T-020, T-008
- **Size:** S
- **Files in scope:** `supabase/migrations/0014_ai_usage.sql`, `supabase/policies/ai_usage.sql`, `supabase/tests/ai_usage.test.sql`
- **Approval:** `cto + board`
- **High-risk file change:** yes
- **Acceptance:**
  - `ai_usage` table per data model §4.12
  - Indexes on (user_id, started_at), (started_at) for cost dashboards
  - RLS: users see own usage; admin sees all
  - Helper view `ai_usage_daily_rollup` aggregates by user/team/company/day
  - Tests: row-level access, view returns expected aggregates
- **Notes:** Performance matters here — at 200 users with heavy AI usage this could be a high-volume table. Indexes are critical.

---

### T-031 — Migration 0015: audit_log applied to all tables

- **Phase:** Schema and RLS
- **Depends on:** T-013, all earlier table tickets
- **Size:** M
- **Files in scope:** `supabase/migrations/0015_audit_apply.sql`, `supabase/tests/audit.test.sql`
- **Approval:** `cto + board + security`
- **High-risk file change:** yes
- **Acceptance:**
  - Apply `audit.log_change()` trigger to: opportunities, accounts, contacts, opportunity_splits, opportunity_team_members, approval_instances, approval_decisions, documents (delete only)
  - Tests: every audited table has audit rows on insert/update/delete
- **Notes:** The audit trigger function was built in T-013; this ticket wires it up everywhere.

---

### T-032 — Migration 0016: auth allowed domains

- **Phase:** Schema and RLS
- **Depends on:** T-011
- **Size:** S
- **Files in scope:** `supabase/migrations/0016_auth_domains.sql`, `supabase/policies/auth_domains.sql`
- **Approval:** `cto + board`
- **High-risk file change:** yes
- **Acceptance:**
  - `auth_allowed_domains` table seeded with `nodwin.com`, `trinitygaming.in`, `maxlevel.gg`
  - Auth Hook function `is_allowed_signup_email(email)` checks against this table
  - RLS: read by all authenticated; write by admin only
- **Notes:** This table feeds both T-011's auth hook and the admin domain-management UI later.

---

### T-033 — Custom currencies registry

- **Phase:** Schema and RLS
- **Depends on:** T-007, T-014
- **Size:** S
- **Files in scope:** `supabase/migrations/0017_currencies.sql`, `supabase/policies/currencies.sql`
- **Approval:** `cto + board`
- **High-risk file change:** yes
- **Acceptance:**
  - `currencies` table with code, name, scale, active
  - Seeded with ISO 4217 currencies plus `USDT` (scale 4, treated as 1:1 USD for finance reference but tracked separately)
  - `lib/money.ts` reads from this registry on startup
  - Admin can add new currencies via the admin panel (later ticket)
- **Notes:** Adding a currency at runtime should not require app restart. Use Supabase realtime for the registry, or check on each money operation.

---

### T-034 — Drive folder configuration table

- **Phase:** Schema and RLS
- **Depends on:** T-021
- **Size:** S
- **Files in scope:** `supabase/migrations/0018_drive_config.sql`
- **Approval:** `cto + board`
- **Acceptance:**
  - `drive_config` table with parent folder IDs for accounts, opportunities, P&L sheets
  - One row per entity (since each entity might use a different parent folder)
- **Notes:** Drive integration uses this in Phase 5.

---

### T-035 — Seed data for entities, business units, currencies

- **Phase:** Schema and RLS
- **Depends on:** T-019, T-033
- **Size:** S
- **Files in scope:** `supabase/seed/sandbox.sql`
- **Approval:** `cto + board`
- **Acceptance:**
  - Seeds entities: NG India, NG Spr, Unpause, PSH, Trinity, AFK, Branded, Nodwin Mena, Starladder, Comic Con
  - Seeds business units per the existing template (East Asia, NG Spr, Trimax, Sages, etc.)
  - Seeds currencies: USD, INR, EUR, SAR, SGD, USDT
  - Seeds 5 fake test users with realistic role distribution
  - Seeds 10 fake accounts and 30 fake opportunities at various stages
  - **All seed data is clearly fake.** Account names like "Acme Corp", "Test Industries". No real client names.
- **Notes:** This seed runs in sandbox and dev only. CI uses it for tests; production migration starts from empty.

---

# Phase 3 — Auth and shell

After this phase you have a working app you can log into.

---

### T-036 — Login page and OAuth flow

- **Phase:** Auth and shell
- **Depends on:** T-011
- **Size:** M
- **Files in scope:** `app/(auth)/login/page.tsx`, `app/api/auth/callback/route.ts`, `components/auth/login-button.tsx`
- **Approval:** `cto + board`
- **High-risk file change:** partial (auth)
- **Acceptance:**
  - `/login` page with Google OAuth button
  - Callback handles success and failure cases
  - Disallowed domain shows clear error message
  - Successful login redirects to `/dashboard`
  - Visual: clean shadcn/ui design, Nodwin branding (logo TBD)
- **Notes:** Use shadcn `Button`. Error states matter.

---

### T-037 — Authenticated app shell

- **Phase:** Auth and shell
- **Depends on:** T-036
- **Size:** M
- **Files in scope:** `app/(crm)/layout.tsx`, `components/shell/sidebar.tsx`, `components/shell/header.tsx`
- **Approval:** `cto`
- **Acceptance:**
  - App shell with sidebar (Accounts, Contacts, Opportunities, Dashboard, Admin), header (search bar, user menu, notifications)
  - Sidebar collapsible on desktop, full-screen drawer on mobile
  - Active route highlighted
  - User menu shows name, role, sign out, settings link
- **Notes:** Use shadcn `Sheet`, `Avatar`, `DropdownMenu`. Match the Pipedrive screenshot aesthetic where possible.

---

### T-038 — Sign-out and session expiry handling

- **Phase:** Auth and shell
- **Depends on:** T-037
- **Size:** S
- **Files in scope:** various
- **Approval:** `cto`
- **Acceptance:**
  - Sign-out clears session, redirects to login
  - Expired token triggers re-auth flow without losing the user's current page intent
  - Tests: protected routes redirect when unauthenticated
- **Notes:** Standard Supabase Auth behaviour, just wire it up correctly.

---

### T-039 — User profile page

- **Phase:** Auth and shell
- **Depends on:** T-037
- **Size:** S
- **Files in scope:** `app/(crm)/settings/profile/page.tsx`
- **Approval:** `cto`
- **Acceptance:**
  - User can view their name, email, role, primary entity, manager, inbound email address
  - User can edit allowed fields (e.g., display name, notification preferences); cannot escalate role
  - Inbound email address is shown with a "copy" button and instructions on how to use it
- **Notes:** This is also where future per-user AI cap overrides will be configured.

---

### T-040 — Empty admin shell

- **Phase:** Auth and shell
- **Depends on:** T-037
- **Size:** S
- **Files in scope:** `app/(crm)/admin/layout.tsx`, `app/(crm)/admin/page.tsx`
- **Approval:** `cto`
- **Acceptance:**
  - `/admin` route accessible only to users with `primary_role = 'admin'`
  - Empty admin home page with placeholder cards for: Users, Custom Fields, Approval Workflows, Currencies, Domains, AI Usage, Audit Log
  - Each card links to a "coming soon" page
- **Notes:** Real admin functionality lands in later tickets, but the shell needs to exist so links resolve.

---

### T-041 — Notifications drawer

- **Phase:** Auth and shell
- **Depends on:** T-037
- **Size:** S
- **Files in scope:** `components/notifications/*`
- **Approval:** `cto`
- **Acceptance:**
  - Bell icon in header with unread count badge
  - Drawer shows recent notifications (assignments, approval requests, mentions)
  - Mark as read / mark all as read
  - Real-time updates via Supabase realtime
- **Notes:** Notifications table can be ad-hoc for now; formal model later.

---

### T-042 — Sandbox banner

- **Phase:** Auth and shell
- **Depends on:** T-037
- **Size:** XS
- **Files in scope:** `components/shell/sandbox-banner.tsx`
- **Approval:** `cto`
- **Acceptance:**
  - When `NEXT_PUBLIC_ENV === 'sandbox'`, persistent yellow banner at top of every page: "🧪 Sandbox environment — data is not real and resets periodically."
- **Notes:** Critical so users training on sandbox don't think they're working in production.

---

# Phase 4 — Core CRM

This is the bulk of the build. Tickets are grouped: Accounts → Contacts → Opportunities (list/kanban) → Opportunity detail → Activities → Documents → Custom Fields admin. Most tickets here are `cto` approval level.

For brevity, full ticket details for T-043 onward are in `docs/build-tickets-detailed.md` (created in T-005). What follows is the summary list.

---

### Accounts (T-043 to T-048)

- T-043 — Account list view (table + filters + search)
- T-044 — Account detail page with sub-tabs (Overview, Contacts, Opportunities, Activities, Documents, Tree)
- T-045 — Account create/edit form (React Hook Form + Zod)
- T-046 — Account hierarchy tree visualisation (using react-flow or a simpler tree component)
- T-047 — Account custom fields display and editing
- T-048 — Bulk import accounts from CSV

### Contacts (T-049 to T-053)

- T-049 — Contact list view
- T-050 — Contact detail page
- T-051 — Contact create/edit form, including multi-account linking
- T-052 — Contact custom fields
- T-053 — Bulk import contacts from CSV

### Opportunities — list and kanban (T-054 to T-058)

- T-054 — Opportunity list view (TanStack Table, sortable, filterable, saved views)
- T-055 — Opportunity kanban view (dnd-kit, columns = stages, totals per column, drag-to-advance)
- T-056 — Opportunity create form (full data model)
- T-057 — Opportunity quick-create (minimal form for fast capture)
- T-058 — Opportunity bulk operations (re-assign, advance stage, export)

### Opportunity detail (T-059 to T-064)

- T-059 — Opportunity detail page layout (Pipedrive-style: header with stage progress, tabs for Notes/Activity/Call/Email/Files/Documents)
- T-060 — Opportunity edit form, custom fields, splits editor, team editor
- T-061 — Stage history timeline
- T-062 — Activity composer (note, call, task) inline on opportunity
- T-063 — Document upload (creates Drive file via T-079)
- T-064 — Description rich text editor (lexical or tiptap)

### Custom fields admin (T-065 to T-068)

- T-065 — Custom field list view in admin
- T-066 — Custom field create form (all data types from data model)
- T-067 — Custom field edit and soft-delete (with confirmation dialogs)
- T-068 — Custom field reorder (drag-and-drop)

---

# Phase 5 — Integrations

Each integration is its own focused mini-phase. Integrations are higher-risk than core CRM because they involve external services and webhooks.

---

### Gmail and Calendar (T-069 to T-073)

- T-069 — Per-user Gmail OAuth flow (gmail.send + gmail.readonly scopes)
- T-070 — Outbound email composer (sends via user's Gmail, logs as Activity)
- T-071 — Email threading via In-Reply-To header
- T-072 — "Find related emails" feature on opportunity (on-demand, not polled)
- T-073 — Calendar event creation from opportunity, suggested-activity from calendar events

### Slack (T-074 to T-078)

- T-074 — Slack app OAuth and per-workspace install
- T-075 — Slack channel posts on stage advance, deal close, approval requests
- T-076 — Slash command `/crm` for in-line search
- T-077 — Per-deal channel auto-creation (optional toggle)
- T-078 — Approval interactivity (approve/reject from Slack message)

### Drive (T-079 to T-082)

- T-079 — Drive folder auto-creation per opportunity, per account
- T-080 — Drive permission sync based on visibility tier and team membership
- T-081 — Drive file upload from CRM, file deletion
- T-082 — Background reconciliation job (drift detection between CRM intent and Drive reality)

### Inbound email (T-083 to T-085)

- T-083 — Postmark Inbound webhook endpoint integration (uses T-010 primitive)
- T-084 — Account-domain matching rules admin UI
- T-085 — Unassigned activity inbox UI for ambiguous emails

### AI features (T-086 to T-088)

- T-086 — Semantic search across accounts, contacts, opportunities, activities (uses T-008 router)
- T-087 — Deal summarisation (on-demand, with cache)
- T-088 — Draft follow-up email feature with explicit review step

---

# Phase 6 — P&L and approvals

### Approvals (T-089 to T-092)

- T-089 — Approval workflow admin GUI (create/edit workflows, define steps)
- T-090 — Approval request UI (approver sees pending requests, approves/rejects with comment)
- T-091 — Approval history display on opportunity
- T-092 — `enforce_gate` toggle in admin (per-workflow)

### P&L (T-093 to T-097)

- T-093 — Sheets API integration (service account setup)
- T-094 — P&L template parser and field mapping
- T-095 — P&L generation on stage = closed_won (creates Sheet, populates, shares)
- T-096 — P&L delivery email and Slack notification to approvers
- T-097 — P&L regeneration on opportunity edit (with confirmation)

---

# Phase 7 — Dashboards

### Dashboards (T-098 to T-108)

- T-098 — Per-user "My Pipeline" dashboard (kanban summary, my deals by stage)
- T-099 — Per-user "My Activities" dashboard (today/this week, overdue tasks)
- T-100 — Per-user "My Targets" widget
- T-101 — Per-team "Team Funnel" dashboard
- T-102 — Per-team "Team Leaderboard"
- T-103 — Per-team "Stuck Deals" dashboard
- T-104 — Management "Group Pipeline" dashboard
- T-105 — Management "Win Rate" and "Conversion by Stage"
- T-106 — Management "Revenue Forecast"
- T-107 — Management "Deals at Risk"
- T-108 — Saved views and shareable filter URLs

---

# Phase 8 — Migration and UAT

### Salesforce migration (T-109 to T-114)

- T-109 — Salesforce data export tooling (or API integration)
- T-110 — Field mapping config (`migration/sf_field_map.yaml`)
- T-111 — Idempotent import script (accounts, contacts, opportunities)
- T-112 — Incremental delta sync during parallel run
- T-113 — Reconciliation script (find divergence between SF and CRM)
- T-114 — Daily SF-format export for Finance during parallel run

### UAT (T-115 to T-118)

- T-115 — UAT environment setup with East Asia sandbox data
- T-116 — UAT script and feedback collection (Google Form)
- T-117 — UAT feedback triage and ticketing
- T-118 — Onboarding drip emails (Day 0, Day 2, Day 7) per the reference doc

---

# Phase 9 — Hardening and audit

### Security and audit (T-119 to T-126)

- T-119 — Engage external security auditor (board action, not coding)
- T-120 — Pre-launch security checklist execution (every BLOCKER item from `docs/security.md`)
- T-121 — Security audit findings remediation
- T-122 — Backup and restore procedure documented and tested
- T-123 — Incident response runbook published
- T-124 — On-call rotation set up (even if just one person)
- T-125 — Final pre-launch sign-off from Akshat, Mickael, board
- T-126 — Cutover plan documented and rehearsed (last-mile checklist for go-live day)

---

## What comes after T-126

Phase 9 ends with East Asia going live in parallel with Salesforce. After 4-8 weeks of stable parallel run, full cutover.

The next phases (not detailed here, will be added once v1 is stable):

- **Phase 10:** Region rollout — India, MENA, EU, JPKR, Americas (T-127 onward)
- **Phase 11:** v1.5 features (margin-at-risk dashboard, bulk operations, saved views, advanced reporting)
- **Phase 12:** Multi-region read replicas, performance hardening at 500+ users

These are deliberately not enumerated yet. They depend on what we learn from East Asia v1.

---

## How agents should work this list

1. **Start at the top.** Don't skip ahead. Tickets near the top unlock tickets below them.
2. **Check `Depends on` before starting.** If a dependency isn't merged, pick a parallel ticket that doesn't have unmet dependencies, or ask the CEO agent to re-prioritise.
3. **Don't combine tickets.** One ticket = one PR. The temptation to "while I'm here" is strong; resist it. Surface the additional work as a new ticket.
4. **Surface scope creep.** If a ticket turns out to need 2x the work originally estimated, stop and surface to the CEO. Don't silently expand.
5. **High-risk tickets need extra care.** When you see "High-risk file change: yes" or `cto + board + security` approval level, slow down. Write the tests first. Self-review the PR before opening it. Explain edge cases in the PR description.

---

## Mid-build ticket additions

This list will not survive contact with reality. Expect:

- Bugs found in earlier tickets surface as new tickets (not silent fixes in unrelated PRs)
- UAT feedback adds Phase 8 tickets
- Security audit findings add Phase 9 tickets
- Akshat/Mickael may add scope (this is fine; goes through the board to a new ticket)

The CEO agent maintains this file. Worker agents do not edit it directly. New tickets are added by the CEO with board approval.

---

*This is a planning document. Reality wins arguments with planning documents. Update accordingly.*
