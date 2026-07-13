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
| 9.5. MCP Server *(deferred — blocked until East Asia stability gate)* | T-127 to T-135 | TBD |

Total: roughly 126 tickets across 21 weeks to East Asia parallel run. Phase 9.5 (T-127–T-135) is deferred and does not count toward the v1 timeline. Realistic timeline to East Asia go-live: 22–24 weeks.

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
- **Files in scope:** `.github/workflows/ci.yml`
- **Approval:** `cto + board`
- **High-risk file change:** yes (workflows)
- **Acceptance:**
  - `ci.yml` runs on every PR: install, lint, typecheck, vitest, RLS test runner (placeholder for now), build
  - ~~`secret-scan.yml` runs gitleaks on every PR~~ **Descoped** — the standalone `secret-scan.yml` gate was removed (license issue; see CHANGELOG 2026-07-01). No dedicated `secret-scan.yml` exists. (A gitleaks binary scan does still run, but as part of `deploy.yml`'s `checks` job on every push, not as a separate PR gate.)
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
- **Notes:** Provider API keys come from `lib/security/env.ts`. The `feature` parameter is an enum: `search`, `summarise_deal`, `draft_email`, `next_best_action`, etc. New features need explicit registration. The Ollama URL is configurable; if unreachable, treat as provider failure. **Phase 1 scope note:** The `ai_usage` table does not exist until T-030 (Phase 2). Define a `UsageLogger` interface in `lib/ai/types.ts` and wire a no-op stub for Phase 1 — do NOT attempt DB writes against a table that doesn't exist. Cap enforcement in Phase 1 may also use in-memory state or a no-op check; the real per-user daily cap logic is wired when T-030 creates the table. Tests in this ticket use a mock `UsageLogger`. T-030 completes the wiring.

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

### T-010 — Inbound email pipeline — Part 1: webhook receiver and parser

> **Split notice (ORR-156):** T-010 was split because its DB integration requires Phase 2 schema (`users.crm_inbound_email`, `accounts.email_domains`, `activities`, `inbound_email_deadletter`) that does not exist in Phase 1. Writing against imagined types now means rewriting when real schema lands — that wastes budget twice. Part 1 (this ticket) is the pure parser. Part 2 is T-010b, sequenced after T-026.

- **Phase:** Safety primitives
- **Depends on:** T-009
- **Size:** M
- **Files in scope:** `lib/email/inbound.ts`, `lib/email/inbound.test.ts`, `app/api/webhooks/inbound-email/route.ts`
- **Approval:** `cto + board + security`
- **High-risk file change:** yes
- **Acceptance:**
  - Webhook route receives Postmark Inbound POSTs and calls T-009 signature verification as the first line
  - Parses email fields into a typed `ParsedInboundEmail` struct: from, to, cc, subject, text body, HTML body, attachments (name, size, content type), in-reply-to, message-id, date
  - Extracts DKIM status field from Postmark payload (`DKIMVerified`) and exposes it on the struct — does **not** act on it (enforcement is T-010b)
  - Extracts opportunity reference from subject if `[OPP-{id}]` pattern present and exposes it on the struct
  - Route returns 200 for a successfully parsed and verified webhook; throws `WebhookVerificationError` for bad signatures
  - **No database reads or writes in this ticket** — the parser is a pure transformation layer
  - Tests: invalid signature rejected, DKIM field correctly extracted (Pass/Fail/SkippedSigning), all email header fields parsed, opportunity pattern extracted from subject, missing optional fields handled gracefully, oversized attachment metadata captured without error
- **Notes:** This is Part 1 of the inbound email pipeline — deliberately a pure parser with no DB access. The adversarial cases (forged sender, replay attack, dead-lettering) are in T-010b after Phase 2 schema lands. The `ParsedInboundEmail` type defined here is the contract T-010b builds on.

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
- **Notes:** Default allow-list seeded with `nodwin.com`, `trinitygaming.in`, `maxlevel.gg`. Other domains added later from admin panel. Auth Hook is server-side, runs on every sign-up. **Phase 1 scope note:** The `users` table (T-020) does not exist until Phase 2. In Phase 1, `requireRole` must read role from JWT claims (written by the auth hook at sign-up), NOT from a DB lookup. Full DB-backed role resolution is deferred to T-020. Tests should mock JWT claims. The `auth_allowed_domains` config table is T-032 (Phase 2); in Phase 1, hard-code the allow-list in the auth hook and leave a TODO comment pointing to T-032.

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
  - Stage history side effect: every transition emits a `STAGE_CHANGED` event `{ from, to, reason, at }` — the TypeScript machine does **not** write to any DB table. (The Postgres trigger in T-025 handles DB writes for stage history.)
  - Tests: happy path through to won, can't skip stages without explicit force, can move backward with reason, STAGE_CHANGED event emitted on every transition
- **Notes:** The `closed_*` terminal states are critical for revenue recognition correctness. Reopening must be auditable. **Phase 2 dependency note:** The `opportunity_stage_history` DB table is created in T-025. This TypeScript state machine must NOT make direct DB calls — keep the machine pure and event-driven. T-025's Postgres trigger consumes stage transitions at the DB level.

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
- **Notes:** `inbound_email_deadletter` table also created here. T-010b (inbound email DB integration) is blocked on this ticket; once T-026 merges, T-010b can proceed.

---

### T-010b — Inbound email pipeline — Part 2: DB integration

> **Split notice (ORR-156):** This is the Phase 2 continuation of T-010. It requires `users.crm_inbound_email` (T-020), `accounts.email_domains` (T-021), `activities` + `inbound_email_deadletter` (T-026). It was separated from T-010 to avoid writing against imagined types that would need rewriting when real schema arrived.

- **Phase:** Schema and RLS
- **Depends on:** T-010, T-020, T-021, T-024, T-026
- **Size:** M
- **Files in scope:** `lib/email/inbound.ts`, `lib/email/inbound.test.ts`
- **Approval:** `cto + board + security`
- **High-risk file change:** yes
- **Acceptance:**
  - Sender verification: the From address must match a `users.crm_inbound_email` value in the `users` table. Mismatch → write to `inbound_email_deadletter`, alert admin, do not create activity
  - **DKIM enforcement:** if `ParsedInboundEmail.dkimVerified` is not `Pass` → dead-letter
  - Account matching: parse recipient domains, look up `accounts.email_domains`, attach if exactly one match
  - Opportunity matching: if `ParsedInboundEmail.opportunityRef` is set, attach to that opportunity (after RLS check that user can write to it)
  - Replay detection: if `activities.external_thread_id` already contains the message-id, silently drop the duplicate
  - Multi-match or no-match: create unassigned Activity (no opportunity_id) for user to assign in UI
  - Attachments ≤ 25MB: store metadata with a `TODO: upload to Drive (T-079)` marker; skip oversized attachments with a note in the activity body
  - Tests: forged sender rejected and dead-lettered, DKIM fail dead-lettered, replay drops second occurrence, account domain match attaches correctly, no-match creates unassigned activity, oversized attachment skipped with note, RLS rejects write to invisible opportunity
- **Notes:** This ticket completes the inbound email pipeline that T-010 began. T-083 (Phase 5) wires the full endpoint into the live app. Because this ticket works against the real Phase 2 schema, all types must match the actual columns — no stubs or forward declarations.

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
- **Notes:** Performance matters here — at 200 users with heavy AI usage this could be a high-volume table. Indexes are critical. **T-008 wiring:** T-008 defined a `UsageLogger` interface with a no-op stub for Phase 1. This ticket creates the table; also replace the no-op stub in `lib/ai/router.ts` with the real Supabase insert implementation. The per-user/team/company cap enforcement in T-008 can also be switched from in-memory to DB-backed reads at this point.

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

- T-083 — Postmark Inbound webhook endpoint integration (uses T-010 + T-010b primitives)
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

# Phase 9.5 — MCP Server

> **BLOCKED AND DEFERRED.** Do not start any ticket in this phase. No agent should pick up these tickets.
>
> **Trigger condition to unblock:** East Asia has been on parallel-run with Salesforce for at least 4 weeks with stable usage and no Critical or High security findings outstanding from the Phase 9 audit. The board will explicitly unblock this phase when the condition is met.

**Goal:** Expose CRM read and write operations to AI agent tools (NanoClaw, Claude Desktop, Cursor, Cowork, and any future MCP-speaking client) via a Model Context Protocol server, scoped to the authenticated user's RLS-enforced view of the data.

Detailed acceptance criteria for all tickets in this phase are deliberately deferred — they will be written when the phase is unblocked, based on what we learn from real East Asia usage patterns.

**Approval level for all Phase 9.5 PRs:** `board` (MCP surface is security-critical).

---

### T-127 — MCP server scaffold and authentication

- **Phase:** MCP Server
- **Depends on:** T-126
- **Status:** BLOCKED — deferred until East Asia stability gate (see Phase 9.5 header)
- **Size:** L
- **Files in scope:** `lib/mcp/server.ts`, `lib/mcp/auth.ts`, `app/api/mcp/route.ts`, `lib/mcp/types.ts`
- **Approval:** `board`
- **Acceptance:** *(deferred — to be written when phase is unblocked)*
- **Notes:** Scaffold a TypeScript MCP server (JSON-RPC over HTTP or stdio). Auth must issue per-user session tokens that are tied to the Supabase JWT; all downstream calls use the user's RLS context, not service-role. No tool is exposed to an unauthenticated caller under any circumstances.

---

### T-128 — MCP read: search (accounts, contacts, opportunities)

- **Phase:** MCP Server
- **Depends on:** T-127
- **Status:** BLOCKED — deferred
- **Size:** M
- **Files in scope:** `lib/mcp/tools/search.ts`, `lib/data/search.ts`
- **Approval:** `board`
- **Acceptance:** *(deferred)*
- **Notes:** `search` tool accepts a query string and returns ranked results across accounts, contacts, and opportunities visible to the calling user (RLS-enforced). Results must not leak records the user cannot see via the web UI.

---

### T-129 — MCP read: get account, get contact, get opportunity

- **Phase:** MCP Server
- **Depends on:** T-127
- **Status:** BLOCKED — deferred
- **Size:** M
- **Files in scope:** `lib/mcp/tools/get-record.ts`, `lib/data/accounts.ts`, `lib/data/contacts.ts`, `lib/data/opportunities.ts`
- **Approval:** `board`
- **Acceptance:** *(deferred)*
- **Notes:** Three get-by-id tools. Each must enforce RLS (no direct Supabase service-role fetches). Return 404-equivalent tool error for records the user cannot see, not a permission error — do not confirm existence of invisible records.

---

### T-130 — MCP read: list my activities, list my pipeline

- **Phase:** MCP Server
- **Depends on:** T-127
- **Status:** BLOCKED — deferred
- **Size:** S
- **Files in scope:** `lib/mcp/tools/list-activities.ts`, `lib/mcp/tools/list-pipeline.ts`, `lib/data/activities.ts`
- **Approval:** `board`
- **Acceptance:** *(deferred)*
- **Notes:** `list_my_activities` returns activities owned by or assigned to the calling user. `list_my_pipeline` returns opportunities where the user is owner or team member. Both are RLS-scoped; pagination required.

---

### T-131 — MCP write: create note, create task, create activity

- **Phase:** MCP Server
- **Depends on:** T-127, T-134
- **Status:** BLOCKED — deferred
- **Size:** M
- **Files in scope:** `lib/mcp/tools/create-activity.ts`, `lib/data/activities.ts`
- **Approval:** `board`
- **Acceptance:** *(deferred)*
- **Notes:** Writes must go through `lib/data/` functions (never raw Supabase from tool handlers). Must pass `{ user, source: 'mcp' }` to audit logging. Must enforce that the target opportunity/account is visible to the calling user before writing.

---

### T-132 — MCP write: advance opportunity stage

- **Phase:** MCP Server
- **Depends on:** T-127, T-134
- **Status:** BLOCKED — deferred
- **Size:** M
- **Files in scope:** `lib/mcp/tools/advance-stage.ts`, `lib/data/opportunities.ts`
- **Approval:** `board`
- **Acceptance:** *(deferred)*
- **Notes:** Must use the same XState stage machine from T-016 — no direct stage updates that bypass the machine. Must enforce RLS write permission. Stage advance via MCP must be audited with `source='mcp'`. If an approval workflow is configured and `enforce_gate = true`, the tool must respect it (cannot advance without approval, same as the web UI).

---

### T-133 — MCP rate limiting (separate from web rate limits)

- **Phase:** MCP Server
- **Depends on:** T-127
- **Status:** BLOCKED — deferred
- **Size:** S
- **Files in scope:** `lib/mcp/rate-limit.ts`
- **Approval:** `board`
- **Acceptance:** *(deferred)*
- **Notes:** MCP endpoints must have their own rate limit buckets, independent of web UI rate limits (T-012). AI agent tools can issue bursts that are qualitatively different from human interaction rates. Define per-user per-minute limits for read and write tools separately. Returns a structured MCP error (not HTTP 429) when the limit is exceeded.

---

### T-134 — MCP audit logging (source = 'mcp')

- **Phase:** MCP Server
- **Depends on:** T-127
- **Status:** BLOCKED — deferred
- **Size:** S
- **Files in scope:** `lib/mcp/audit.ts`, `lib/security/audit.ts`
- **Approval:** `board`
- **Acceptance:** *(deferred)*
- **Notes:** Every MCP-initiated write must emit an audit log entry with `source = 'mcp'`, the calling user, the tool name, the target record, and the before/after diff. This uses the same `audit()` primitive from T-013 but adds the `source` field. Read operations should be logged at DEBUG level only; write operations are INFO. The audit log must be queryable by source to let admins see "what did the MCP server do?"

---

### T-135 — MCP security review gate (pre-go-live)

- **Phase:** MCP Server
- **Depends on:** T-127, T-128, T-129, T-130, T-131, T-132, T-133, T-134
- **Status:** BLOCKED — deferred
- **Size:** M
- **Files in scope:** review only — no new code
- **Approval:** `board`
- **Acceptance:** *(deferred)*
- **Notes:** Before the MCP server is exposed to any production traffic, a focused security review of the entire MCP surface is required. Scope: authentication token lifecycle, RLS enforcement on all tools, rate limit bypass paths, audit completeness, and any tool that could be used to exfiltrate data at scale. This is a board-gate: MCP does not go live until this ticket is done and signed off.

---

## Phase 9.6 — Visibility & Roles Model (discovery-driven, gated)

> Added 2026-07-13 from the Visibility & Roles Phase-0 discovery. **None of these are authorised to build.** Each is blocked pending (a) the project lead ratifying decisions **D1–D6** and (b) the named `cto + board + security` sign-off on the open decision it depends on. The engine discovery, decision codification, and open decisions O1–O4 live on the tracking issue in Paperclip: **ORR-713** (parent, carries the `discovery` + `codification` documents). Ticket → tracking-issue map: **T-140 = ORR-714, T-141 = ORR-715, T-142 = ORR-716, T-143 = ORR-717** (all blocked). Ticket order matters: **T-140 is the prerequisite** that makes the superset-role model (D2/D4) actually work.

> **⚡ Update 2026-07-13 (evening) — RATIFIED.** The project lead ratified **D1–D6** and all four open decisions **O1–O4** (recorded on ORR-713, which is now `done`; the codification carries the ratification, though it was captured as an ORR-713 comment because the board document API was 500ing). **T-140 is DONE** — region/group engine shipped (ORR-714, #281) + Regions admin UI (ORR-720, #282), live on staging. **T-141 / T-142 / T-143 are UNBLOCKED and authorised to build** — each Status line below carries its ratified decision. Recommended build order: **T-143 (S) → T-142 (M) → T-141 (M, highest-risk)**.

### T-140 — Explicit region/group visibility paths in the visibility engine

- **Phase:** 9.6 Visibility & Roles
- **Depends on:** O1 sign-off; D1–D6 ratification
- **Status:** DONE (2026-07-13) — D1–D6 + O1 ratified; region/group engine shipped (ORR-714, #281) + Regions admin UI (ORR-720, #282). O1 resolved: full regions feature (regions group multiple entities), read tier = all-except-Confidential (D5 preserved), additive RLS policy short-circuit. Live on staging.
- **Size:** L
- **Files in scope:** `supabase/migrations/*` (new migration adding branches to `recompute_visibility_for_opportunity` and/or the `opportunities` SELECT policy), `supabase/tests/*`
- **Approval:** `cto + board + security`
- **High-risk file change:** yes
- **Acceptance:** A `regional_head` sees all opportunities within their region/entity scope (as ratified in O1); `group_sales_lead`/`exec` see group-wide per the ratified tier rule; access is granted via a materialised/engine path (not an unenforced permission); Confidential remains firewalled (D5) — no new principal gains Confidential content; pgTAP proves a group deal owned outside the role-holder's manager subtree is now visible, and that a Confidential deal is still invisible; `rls:check` clean; no widening of any other principal's access.
- **Notes:** Discovery (Q2) confirmed the engine has **no** explicit region/group path — `regional_head`/`group_sales_lead`/`exec` only see deals via the `manager_user_id` tree (standard tier only), and `opportunities.view_all` is granted but **not enforced by RLS**. This is the gap that must close before D2 (superset role) / D4 (no new role) function. **Not authorised to build until D1–D6 are ratified and `cto + board + security` sign-off on O1 is recorded.** O1 must first decide the region grouping semantics and the tier ceiling (all-except-Confidential vs standard-only).

### T-141 — "Direct reports" self-service roster (My Team via manager chain)

- **Phase:** 9.6 Visibility & Roles
- **Depends on:** O2 sign-off; D1–D6 ratification
- **Status:** TODO — UNBLOCKED (2026-07-13). O2 ratified: managers may self-serve their direct-reports roster **only within their own entity/BU**; a removal/reassignment **notifies the losing manager** (no admin co-sign — no approval bottleneck); membership is **effective-dated** (from/to), not a hard delete, so period reports stay accurate under materialised visibility. The ticket must also fix the subordinate recompute fan-out gap. Ready to build.
- **Size:** M
- **Files in scope:** `supabase/migrations/*` (loosen the `manager_user_id` write guard for scoped managers + notification/effective-dating), `apps/web/app/(crm)/.../*` (roster UI), `apps/web/lib/data/users.ts`
- **Approval:** `cto + board + security`
- **High-risk file change:** yes
- **Acceptance:** A manager can add/remove a direct report **only** within the guardrail ratified in O2 (recommendation: reps in the manager's own entity/BU); every change is audited and recomputes visibility; the losing manager is handled per O2 (co-sign/notify); removal semantics (hard vs effective-dated) match O2. Confidential unaffected (D5). `rls:check` clean.
- **Notes:** D3 = "My Team" reuses the single-parent `manager_user_id` chain; **do not** create a `teams`/`team_members` table (it would desync from the engine). **Name it "direct reports", not "team"** — "team" already means `opportunity_team_members` and, in `get_todays_team_usage`, business_unit. Today `manager_user_id` is Super-Admin-only (`prevent_role_escalation` trigger); this ticket deliberately relaxes that for scoped managers — hence the security gate. Design around two engine caveats: manager visibility is standard-tier only, and the reparent trigger doesn't re-fan subordinates' deals. **Not authorised to build until O2 is decided and signed off.**

### T-142 — Break-glass Confidential self-grant (logged + notify named list)

- **Phase:** 9.6 Visibility & Roles
- **Depends on:** O3 sign-off; D1–D6 ratification
- **Status:** TODO — UNBLOCKED (2026-07-13). O3 ratified: **BUILD** the break-glass self-grant — a permitted principal may self-grant access to **one specific** Confidential deal, every grant audit-logged and notifying the deal's named list, never a blanket role. Must not weaken the default fence (owner + `confidentiality_override_user_ids`), just centralized in #280/#288. Ready to build.
- **Size:** M
- **Files in scope:** `supabase/migrations/*` (a logged self-grant path onto `confidentiality_override_user_ids` / `opportunity_visibility`), `apps/web/...` (break-glass action + audit + notification)
- **Approval:** `cto + board + security`
- **High-risk file change:** yes
- **Acceptance:** *(pending O3 — if the capability is approved)* a permitted principal can self-grant access to **one specific** Confidential deal; the grant is audited with actor/reason, notifies the deal's named list, and never becomes a blanket role; no change to the default firewall (D5) for anyone who doesn't invoke break-glass; pgTAP proves a non-invoking role still cannot read Confidential.
- **Notes:** This is a **new capability** touching the Confidential firewall, offered as an accountable alternative to a bypass role (D4/D5). O3 may decide **not** to build it at all. **Not authorised to build until O3 is explicitly approved and signed off.** Must preserve the existing named-individuals-only model as the default.

### T-143 — Entity-scope presets in the Opportunities scope selector

- **Phase:** 9.6 Visibility & Roles
- **Depends on:** O4 sign-off; D1–D6 ratification; the Opportunities scope selector (shipped, ORR-711)
- **Status:** TODO — UNBLOCKED (2026-07-13). O4 ratified: the scope selector's entity presets **auto-derive from the user's role + entity grants** (no manual admin config), so they stay in sync with grants. Ready to build.
- **Size:** S
- **Files in scope:** `apps/web/lib/opportunity/scope-presets.ts`, `apps/web/app/(crm)/opportunities/page.tsx`, `apps/web/components/opportunities/opportunities-view.tsx`
- **Approval:** `cto + board`
- **High-risk file change:** no (scope is a UI filter that must only narrow within access)
- **Acceptance:** multi-entity users get the entity scope presets ratified in O4; each preset **only narrows** the RLS-visible set (never widens — proven by a test that the scoped result is a subset of All Deals); presets derive from the user's role/entity grants per O4; single-entity users are unaffected.
- **Notes:** Extends the ORR-711 scope-preset system (`scope-presets.ts`) with per-entity chips for multi-entity users (D1). **Scope, not access** — this must be provably incapable of widening RLS. More meaningful **after** T-140 (so a regional user's "all region" preset has data), but does not hard-depend on it. **Not authorised to build until O4 is decided.**

---

## What comes after T-135

Phase 9.5 ends with the MCP server reviewed and live. After that:

The next phases (not detailed here, will be added once v1 is stable):

- **Phase 10:** Region rollout — India, MENA, EU, JPKR, Americas (T-136 onward)
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
6. **Watch for cross-phase schema dependencies.** The `Depends on` field captures backward dependencies (tickets that must be done first), but it only covers what is explicitly listed. Some Phase 1 tickets reference schema — tables, columns, generated fields — that isn't created until Phase 2. Before implementing, scan the acceptance criteria for any table or column names and check whether the creating ticket is later in the sequence. If so: either scope this ticket down to what is schema-independent and create a follow-up for the Phase 2 DB integration, or add an explicit phase-scope note. Do not write against imagined types. Writing a stub now and rewriting with real schema later wastes budget twice.

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
