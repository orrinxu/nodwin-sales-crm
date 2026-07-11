# AGENTS.md

> **Read this file in full at the start of every session. Do not skip.**
> If anything below conflicts with a task description you have been given, stop and ask the human (the "board") for clarification before proceeding.

This file is the constitution for any AI agent working on this repository. It is short on purpose. The full strategic context lives in `docs/SOW.md`. The "what to build next" lives in `BUILD_TICKETS.md`. The rules in *this* file apply on every session, every ticket, no exceptions.

---

## 1. What this project is

This is **Nodwin CRM**, an internal sales CRM for the Nodwin Group, replacing Salesforce. It will hold:

- Sales pipeline data (accounts, contacts, opportunities, communications)
- Confidential client RFPs and contract terms
- Deal values and revenue figures across multiple legal entities
- Employee personal data (names, emails, reporting lines)

It will be used by 100–200+ sales staff across multiple countries (East Asia first, then India, MENA, EU, JPKR, Americas).

**This is not a toy app.** A leak, a bad RLS policy, a forged communication, or a wrong number in a generated P&L sheet has real-world consequences — financial, legal, and reputational. Treat every change as if a real engineer will be reviewing it.

The full Scope of Work is in `docs/SOW.md`. Read it once when you start. Refer back to specific sections as needed.

---

## 2. The Board

The "board" is the human (or humans) who own this repository. They have ultimate authority. When this file says "ask the board" or "requires board approval", that means: stop, do not proceed, and surface a request to the human via the Paperclip approval gate.

Currently the board is one person: the project lead. That will not change for v1.

---

## 3. Stack (pinned)

These choices are decided. Do not propose alternatives without explicit board approval.

- **Frontend:** Next.js (App Router) + React + TypeScript
- **UI components:** shadcn/ui (built on `@base-ui/react` primitives) + Tailwind CSS v4 (CSS-first). When a UI need arises, look for an existing shadcn component first. Do not introduce a second component library.
- **Styling:** Tailwind CSS. No CSS-in-JS. No styled-components. No CSS modules unless absolutely necessary.
- **Backend:** Supabase (Postgres + Auth + Storage + Realtime + RLS)
- **Auth:** Supabase Auth with Google OAuth provider only. No password auth. No magic links. No other social providers.
- **Money/currency:** `dinero.js` library + Postgres `numeric(20,4)` columns. Never `number`/`float` for money.
- **State machines:** XState (for approval workflows, deal stage transitions)
- **Forms:** React Hook Form + Zod schema validation. Every form. No exceptions.
- **Tables/grids:** TanStack Table
- **Drag-and-drop:** dnd-kit (for the kanban)
- **Charts:** Recharts (shadcn integrates with this)
- **Icons:** Lucide
- **Background jobs:** Currently handled by API job routes in `apps/web/app/api/jobs` plus Supabase functions / a `pg_cron` scaffold. Inngest is aspirational (not yet wired) — do not assume it exists.
- **Transactional email:** Resend (preferred) or Postmark — with custom domain, SPF, DKIM, DMARC at p=quarantine. NEVER Supabase's default SMTP.
- **Inbound email:** Postmark Inbound (preferred) or AWS SES Inbound
- **Slack:** `@slack/bolt` library — never roll your own Slack interaction handler
- **Google Workspace:** `googleapis` npm package
- **AI:** routed through `lib/ai/router.ts`. Never call provider APIs directly from anywhere else.
- **Tests:** Vitest for unit/integration, Playwright for E2E
- **Lint:** ESLint with the rules in `apps/web/eslint.config.mjs` (flat config; plus the local `apps/web/eslint-plugin-custom`) — do not weaken them
- **Package manager:** pnpm

---

## 4. Folder structure

This is a **pnpm monorepo** (`pnpm-workspace.yaml` declares `apps/*` and `packages/*`). All app code lives under `apps/web/`; shared workspace packages live under `packages/`. The repo-level tooling (`supabase/`, `docs/`, `scripts/`, `.github/`) sits at the root.

```
nodwin-crm/
├── AGENTS.md                  ← this file
├── README.md                  ← bootstrap and architecture overview
├── BOARD_RUNBOOK.md           ← human-in-the-loop reference
├── BUILD_TICKETS.md           ← ordered ticket sequence
├── CHANGELOG.md               ← human-readable record of significant changes
├── pnpm-workspace.yaml        ← workspace globs: apps/*, packages/*
├── docs/
│   ├── SOW.md                 ← strategic source of truth
│   ├── data-model.md          ← schema reference
│   ├── integrations.md        ← integration architecture
│   ├── security.md            ← threat model and defences
│   └── runbook-incident.md    ← what to do when things break
├── scripts/                   ← repo automation (verify.sh, check-rls-coverage.sh, …)
├── packages/                  ← shared workspace packages
├── apps/
│   └── web/                   ← the Next.js application (one workspace)
│       ├── app/               ← Next.js App Router pages
│       │   ├── (crm)/         ← authenticated CRM routes
│       │   └── api/           ← API routes
│       ├── components/        ← React components
│       │   └── ui/            ← shadcn/ui components (do not modify these)
│       ├── lib/               ← shared application code
│       │   ├── money.ts       ← HIGH-RISK — see §6
│       │   ├── ai/
│       │   │   └── router.ts  ← HIGH-RISK — see §6
│       │   ├── webhooks/      ← HIGH-RISK — see §6
│       │   ├── email/
│       │   │   └── inbound.ts ← HIGH-RISK — see §6
│       │   ├── security/      ← HIGH-RISK — see §6
│       │   ├── data/          ← typed Supabase queries
│       │   └── ...
│       ├── eslint.config.mjs  ← ESLint flat config
│       └── eslint-plugin-custom/ ← local lint rules
├── supabase/
│   ├── migrations/            ← HIGH-RISK — see §6
│   ├── policies/              ← HIGH-RISK — see §6
│   ├── tests/                 ← RLS policy tests (.test.sql files)
│   └── seed/                  ← sandbox seed data only
├── .github/workflows/         ← CI configuration
└── (config files at root)
```

When creating a new file, place it in the most specific folder that fits. If unsure, ask before creating. Do not create new top-level folders without board approval.

---

## 5. Forbidden patterns (hard rules)

These are non-negotiable. CI will reject most of them. The rest you must self-police.

### 5.1 Money

- **NEVER** use `number`, `Number()`, `parseFloat`, or `parseInt` for any monetary value.
- **NEVER** use `float`, `double`, or `real` Postgres types for money.
- **ALWAYS** use the helpers exported from `lib/money.ts`. If you need a money operation that isn't there, add it to `lib/money.ts` (with tests) and surface it. Do not work around it.
- **ALWAYS** use Postgres `numeric(20,4)` for money columns in migrations.

### 5.2 Webhooks

- **NEVER** hand-roll signature verification for any webhook (Slack, Postmark, Stripe, Google, anything).
- **ALWAYS** use the official SDK from each provider, or the verified-signature wrapper in `lib/webhooks/`.
- **ALWAYS** make signature verification the first line of every webhook handler. If verification fails, reject with 401. No exceptions.
- **ALWAYS** treat a webhook payload as untrusted input. Validate it with Zod against an explicit schema before using any field.

### 5.3 Database access

- **NEVER** write inline SQL strings in app code (no `supabase.rpc('SELECT ...')` and no template literals containing SQL).
- **ALWAYS** go through typed Supabase clients in `lib/data/` or Postgres functions defined in `supabase/migrations/`.
- **NEVER** disable RLS on a table, even temporarily, in a production migration. Disabling RLS in a development seed script is fine, but only inside `supabase/seed/`.
- **NEVER** use the Supabase service-role key from client-side (browser) code. Service-role is server-side only — API routes, server components, edge functions.

### 5.4 AI providers

- **NEVER** call Anthropic, Google, OpenAI, Moonshot, DeepSeek, or any other AI provider directly outside of `lib/ai/router.ts`.
- **NEVER** call AI providers from client-side code. All AI calls go through `/api/ai/*` server routes.
- **NEVER** disable or bypass the spending caps in `lib/ai/router.ts`.
- **ALWAYS** log usage to the `ai_usage` table via the router (the router does this for you — don't go around it).

### 5.5 Secrets

- **NEVER** commit API keys, OAuth client secrets, webhook signing secrets, or service-role keys.
- **NEVER** put secrets in code, comments, test files, README, or this file.
- **ALWAYS** use environment variables. Document required variables in `.env.example`.
- **ALWAYS** load secrets via `lib/security/env.ts` which validates them with Zod at startup.
- **NEVER** log secrets, tokens, or full request/response payloads that might contain them.

### 5.6 Authentication and authorisation

- **NEVER** invent your own auth check. Use the helpers in `lib/security/auth.ts`.
- **NEVER** trust client-supplied user identity. The Supabase JWT is the only source of truth.
- **NEVER** enable email/password, magic-link, or any social provider other than Google OAuth.
- **ALWAYS** enforce the domain allow-list (defined in `supabase/migrations/` as a function called from a Supabase Auth Hook).

### 5.7 Generative content

- **NEVER** auto-send email, post to Slack, or write to a Drive file based purely on AI-generated content. Every outbound action containing AI-generated content goes through human review (an explicit "send" click in the UI), unless the board has explicitly approved the automation.
- **NEVER** invent client names, contact emails, contract terms, or revenue figures in code, tests, or fixtures. Use clearly-fake placeholder data ("Acme Corp", "test@example.com") in seeds.

### 5.8 Reckless changes

- **NEVER** modify files listed in §6 (high-risk files) without explicitly flagging the change in your response.
- **NEVER** disable, weaken, or skip a CI check to make a build pass. Either fix the underlying issue or escalate to the board.
- **NEVER** delete tests to make a failing test pass. Either fix the code or update the test deliberately and explain why.
- **NEVER** mark RLS-disabled or signature-verification-disabled with a TODO comment hoping someone will come back to it. If a check is required, it must be present from the first commit.

---

## 6. High-risk files

The following files require **explicit acknowledgement** when you modify them. In your response (PR description, ticket update, etc.), state clearly: "I am modifying high-risk file X for reason Y." This is a soft tripwire — it will not block you, but it tells the board to look closely.

The board may also configure Paperclip to require approval before any change to these files merges.

- `AGENTS.md` (this file)
- `README.md`
- `lib/money.ts`
- `lib/ai/router.ts`
- `lib/webhooks/**`
- `lib/email/inbound.ts`
- `lib/security/**`
- `supabase/migrations/**`
- `supabase/policies/**`
- `supabase/tests/**`
- `apps/web/eslint.config.mjs` (and `apps/web/eslint-plugin-custom/**`)
- `.github/workflows/**`
- `.env.example`
- `package.json` (dependency changes — do not add libraries casually)

---

## 7. Verification gate before marking "done"

Before patching any issue to `status=done`, you MUST run `bash scripts/verify.sh` from the repo root and confirm it exits 0. Paste the **last 10 lines** of its output into the closing comment of the ticket. If the work touched `supabase/migrations/`, you must additionally run `supabase db reset --local` and `curl -s http://localhost:3002/dashboard | grep -ciE 'sidebar|<nav|aside'` and paste both outputs in the same comment.

A ticket marked `done` without the verify output in the closing comment is considered **provisional** — the reviewer may reopen it without further discussion. This rule has no exceptions for "the change was small" or "tests don't apply."

---

## 8. Required patterns

### 8.1 Before you start a ticket

1. Read the ticket in full.
2. Read this file. (Yes, every session.)
3. Before any work on a ticket, **read the full ticket detail in `BUILD_TICKETS.md`** (search for the ticket ID heading). Do not begin work based on the ticket summary alone. If `BUILD_TICKETS.md` lacks the detail you need, ask the board — but only after confirming the file doesn't contain it.
4. If the ticket touches a high-risk file (§6), say so up front in your first message on the ticket.
5. If anything is ambiguous, ask the board before coding. Ambiguity is not your call to resolve.

### 8.2 While coding

- Make small, focused commits. One concern per commit.
- Write the test alongside the code, not after.
- If you discover the ticket is wrong, larger than scoped, or blocked by something else, stop and surface it. Do not silently expand scope.
- If you are about to introduce a new dependency, ask first.
- If you are about to refactor something outside the scope of the ticket, ask first.

### 8.3 Before opening a PR

**Branch hygiene (prevents stale commits and merge conflicts):**

1. **Every new branch MUST be created from `origin/main`**: `git fetch origin && git switch -c feat/orr-xxx origin/main`
2. **Before opening a PR, rebase on latest main**: `git fetch origin && git rebase origin/main`. Resolve conflicts before requesting review.
3. **If your branch contains commits already merged to main**, do NOT open a PR. Create a fresh branch from `origin/main` and cherry-pick only unmerged commits.
4. **One branch = one ticket**. Never reuse a branch for a different ticket.

**Local checks:**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm db:test  # runs RLS policy tests
```

All four must pass. If any fails, fix it before opening the PR. If a failure is genuinely outside your ticket's scope, document it in the PR and surface it to the board.

**Changelog (mandatory for every user-facing change):**

Append an entry to `CHANGELOG.md` in the same PR — the log is maintained per-PR, never reconstructed in bulk after the fact. Add your bullet under today's `## YYYY-MM-DD` section (create the section if it doesn't exist yet), in the right [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) category (`Added` / `Changed` / `Fixed` / `Removed` / `Security`, plus `CI` / `Docs` as used in this file). Every bullet cites its PR (`#NNN`) and ticket (`ORR-xxx`). Skip only for changes with no observable effect (pure refactors, internal test-only edits) — and say so in the PR's `## Changelog` field.

**Pre-commit hook (mandatory):**

Install the pre-commit hook once per clone. This runs the RLS policy linter before every commit so violations never reach CI.

```bash
git config core.hooksPath .githooks
```

Never commit with `--no-verify` to bypass the hook. If the hook fails, fix the RLS issue or add a justified exception to `.rls-allowlist` with a comment explaining why it is safe.

**Stale branch policy:** PRs with merge conflicts caused by already-merged commits will be closed without review. Open a clean PR from a fresh branch.

### 8.4 PR description format

```
## What
<one-paragraph description of what this PR does>

## Why
<reference to the ticket; one-paragraph reasoning>

## High-risk file changes
<list any high-risk files modified, or "none">

## Changelog
<the CHANGELOG.md entry added in this PR, or "none because <reason>">

## Tests added
<list of new tests, or "no new tests because <reason>">

## Manual verification
<what you did to confirm this works beyond automated tests>

## Workflow runs (required if PR touches .github/workflows/)
<link to a successful CI run on this PR's branch, with green checks for all affected workflows>

## Open questions for the board
<anything you want a human to look at, or "none">
```

### 8.5 Tests

- Every new function in `lib/` has a unit test.
- Every new RLS policy has a corresponding `.test.sql` file in `supabase/tests/` with at minimum:
  - A test confirming the policy allows the intended user
  - A test confirming the policy denies an unauthorised user
  - A test for at least one edge case (e.g., user removed from team, visibility tier changed)
- The `scripts/check-rls-coverage.sh` linter enforces this automatically in CI.
- **Legitimate exceptions** may be granted via the `SECURITY_REVIEWER_EXEMPT` annotation in the policy file:
  ```sql
  -- SECURITY_REVIEWER_EXEMPT
  -- Reviewer: <agent_id>
  -- Date: <YYYY-MM-DD>
  -- Reason: <why this table/policy is exempt from test coverage>
  ```
  Exemptions require explicit security reviewer approval and must include the reviewer's identity, date, and justification.
- Every webhook handler has a test exercising signature verification — including a forged-signature case that must reject.
- Every money operation has a test using `dinero.js` semantics (no float comparisons).
- E2E tests for major user flows (deal creation, stage advance, approval, P&L generation) but only after the feature is functionally complete.

### 8.6 Comments

- Comment the *why*, not the *what*.
- If you write a comment explaining why something looks weird, also leave a note for whether it can be cleaned up later or whether it's load-bearing weirdness.
- Do not write apologetic or hedging comments ("I think this works", "not sure if this is right"). If you're not sure, ask the board.

### 8.7 Data-layer source parameter

Every function in `lib/data/` accepts an explicit `{ user, source }` parameter and passes both to audit logging. The `source` value is one of: `'web' | 'mcp' | 'webhook' | 'system'`. RLS uses `user` for permission checks. Rate limiting and audit context use `source` to distinguish the call origin. Functions that omit either parameter must be flagged in code review and rejected.

---

## 9. How to handle ambiguity

If a ticket says "build the contact list page" and you don't know whether contacts should be sortable by company, **ask**. Do not guess. The board would rather answer one Slack message than redo a feature.

If you discover during implementation that two parts of the SOW conflict, **stop and ask**. The SOW is long; conflicts exist. Resolving them is the board's call, not yours.

If you discover that a managed primitive (e.g., dinero.js) doesn't support an edge case you need, **ask**. Do not roll your own. The board may decide to (a) live with the limitation, (b) write a thin wrapper inside `lib/money.ts`, or (c) switch primitives — but that's a decision, not your improvisation.

If a third-party API behaves differently than its documentation, **ask before working around it**. The workaround might mask a real bug, an authentication issue, or a permission problem.

---

## 10. What "done" means

A ticket is done when:

1. Code is written and matches the ticket's described scope.
2. Tests are written and passing locally and in CI.
3. Lint passes. Typecheck passes. RLS tests pass.
4. PR is opened with the description format from §8.4.
5. PR has been reviewed by the CTO agent (or the board, if the ticket touches a high-risk file).
6. PR is merged to `main`.
7. The ticket is updated with a brief summary of what shipped.
8. **File existence verified on `main`:** Before closing a ticket, the CEO must confirm that every file listed in "Files in scope" actually exists on `main` with non-trivial content. Run `git ls-files | grep <expected_file>` for each scoped file. If any file is absent or empty/stub-only, the ticket is NOT done — it is blocked pending merge or implementation. A ticket may not be marked `done` solely because a PR was opened, a feature branch exists, or local tests passed. **The file must be in `main`.**

A ticket is **not** done because the code "works on my machine", "looks right", or "is on a feature branch." It is done when it's in `main` with passing CI and a sign-off, and the files are verifiably present.

---

## 11. Ticket scope and discipline

### 11.1 One ticket = one PR

- **A single PR implements exactly one ticket.** Do not combine multiple tickets into a single PR, even if they are "related" or "small."
- If you finish a ticket and notice adjacent work that should also be done, open a new ticket — do not append it to the current PR.
- PRs that combine tickets without explicit CEO approval will be rejected.

### 11.2 Don't silently expand scope

- If you discover during implementation that your ticket requires building infrastructure that was previously marked `done` but does not exist on `main`, **stop immediately.**
- Do not silently implement the missing work. Post a comment on your ticket explaining the blocker and tag the CTO/CEO.
- The CTO/CEO will either reopen the original ticket, create a new ticket for the missing work, or explicitly adjust your ticket's scope.
- Workers who silently expand scope without surfacing the change will receive a process warning. Repeated violations may result in reassignment.

### 11.3 Don't combine tickets

- Never use a single branch or PR to close multiple independent tickets.
- Never add "while I'm here" refactors, feature additions, or bug fixes that are not in the ticket's described scope.
- If a linter or typechecker flags issues in code outside your ticket's scope, surface it — do not fix it silently.

### 11.4 Branch hygiene

To prevent stale commits and unnecessary merge conflicts, all agents MUST follow these branching rules:

1. **Branch from latest main.** Every new branch MUST be created from the latest `origin/main`:
   ```
   git fetch origin && git switch -c feat/orr-xxx origin/main
   ```
2. **Rebase before PR.** Before submitting a PR, rebase on the latest main:
   ```
   git fetch origin && git rebase origin/main
   ```
3. **No already-merged commits in PRs.** If a branch contains commits already merged to main, do NOT submit a PR. Create a fresh branch and cherry-pick only the unmerged commits.
4. **One branch = one ticket.** Never reuse a branch for multiple tickets.

---

## 12. The "vibe coding" failure modes — explicit list

This project is being built primarily via AI-assisted coding with a non-coder lead. The historical failure modes for this approach are well-documented and have all been observed before. Pre-emptively, every agent must guard against:

1. **The "Auth Emails Vanish" problem.** Resolved by mandatory custom SMTP from day one. If you find code using Supabase default SMTP for transactional email, that is a bug — open a ticket.
2. **The "Public RLS" catastrophe.** Resolved by mandatory RLS on every public table, mandatory `.test.sql` for every policy, the `scripts/check-rls-coverage.sh` linter (enforced in CI), and CI that runs the full test suite. If you create a table without RLS and tests, that is a bug. Legitimate exceptions require `SECURITY_REVIEWER_EXEMPT` with reviewer approval (see §8.5).
3. **The "Stripe Webhook Wide Open" mistake.** Resolved by the rule that every webhook handler's first line is signature verification, and CI/lint that flags missing verification. Even though we don't use Stripe, this applies to every webhook — Slack, Postmark, Google.
4. **The "Agent Lost the Plot" drift.** Resolved by this file being read every session, by ticket-scoped work, and by `BUILD_TICKETS.md` enforcing sequence.
5. **The "Free Tier Abuse Drain."** Resolved by `lib/ai/router.ts` enforcing per-user, per-team, per-company hard caps, plus rate limits at the API gateway, plus provider-dashboard-level caps. If you find an AI call path bypassing the router, that is a bug.
6. **The "Onboarding Drip Doesn't Exist" gap.** Less critical for an internal CRM than a public app, but: when adding new users, the system sends a welcome email with a 3-step onboarding link. Implement this in the user-creation flow.

If you see any of the above failure patterns appearing during development, surface it immediately. Do not silently fix and move on — the board needs to know which guard failed.

---

## 13. GitHub access

All agents have SSH access to GitHub. The system SSH key (`~/.ssh/id_ed25519`) is already authenticated with the remote repository. You can `git fetch`, `git push`, and open PRs without additional setup. If you encounter a permission-denied error, stop and escalate to the CEO.

---

## 14. Working with Paperclip

This repo is orchestrated by Paperclip (https://github.com/paperclipai/paperclip). You are running as an agent inside a Paperclip company. Specifically:

- Tickets come from Paperclip; do not create tickets unilaterally.
- Approvals required by §6 or by the ticket itself go through Paperclip's governance gate, not via comment threads.
- Budget is tracked by Paperclip; if you are running out of budget, surface it rather than truncating work.
- Other agents on the company (CEO, CTO, security review, other workers) communicate via Paperclip's ticket comments, not via in-code TODOs.
- The CEO agent decomposes work into tickets. The CTO agent reviews PRs from worker agents. The security review agent runs an extra check on PRs touching high-risk files. You are most likely a worker agent unless told otherwise.

If you do not know what role you are playing, ask.

---

## 15. When to escalate to the human board

Escalate (via Paperclip's approval mechanism or by stopping work and surfacing a question) when:

- A ticket asks you to do something that conflicts with this file.
- A ticket asks you to modify a high-risk file without explaining why.
- You discover a security issue mid-task (a leaked credential, a missing RLS policy on an existing table, a webhook handler missing signature verification, etc.).
- You're about to spend more than 50% of your remaining budget on a single task.
- Two SOW sections conflict and you can't resolve which is correct.
- A library you've been told to use doesn't exist, doesn't compile, or has security advisories.
- You're being asked to ship something to production that hasn't passed the pre-launch security checklist (see `docs/security.md`).
- Anything else where being wrong has consequences greater than rework.

The board would rather be asked too often than too rarely. There is no penalty for asking.

---

## 16. Things that are explicitly NOT your job

To save you cognitive load:

- Marketing the CRM, deciding pricing, deciding the rollout schedule — not your job, the board owns these.
- Deciding which entity goes live next — not your job.
- Sales process advice ("should we add a stage between Negotiate and Verbal Agreement?") — not your job. If a ticket asks you to add a stage, you add it. Do not propose process changes.
- Hiring other agents, firing agents, modifying the org chart — that's the CEO agent's job, not workers'.
- Deciding on an external security auditor — board's job.
- Making a deal that involves signing a contract or accepting terms of service for a third-party — board's job.

Stay in your lane. The lane is well-defined and there's plenty to do inside it.

---

## 17. Final note

If you are an agent reading this for the first time: the rules above are not bureaucracy. They are the codified output of weeks of careful design decisions, plus a body of documented failure modes from people who tried to build similar things without these rules. Following them is what makes this project safe to ship. Working around them is what makes a $400 surprise bill, a leaked client RFP, or a wrong revenue number that goes to a finance team.

Be careful. Be honest. Ask when unsure. Commit often. Test what you write.

If you do those four things, you will do good work here.

---

*End of AGENTS.md. Refresh: when you start your next session, read this file again before you do anything else.*
