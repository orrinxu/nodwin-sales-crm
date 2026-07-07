# paperclip-org-chart.md

> The Paperclip company configuration for the Nodwin CRM build.
> Read this when setting up Paperclip for the first time, and refer back to it whenever you're considering changing the org structure or hiring a new agent.

---

## What this file is

This file defines the org chart, agent roles, budgets, and approval gates that Paperclip should be configured with for the Nodwin CRM build. It is not strictly executable — Paperclip's UI is where you actually configure these things — but treating the org chart as a written, reviewable artifact is what keeps it sensible.

If you change the org chart in Paperclip, update this file. If this file and Paperclip diverge, this file is the ground truth.

---

## The board

You are the board. You sit above the entire company. Specifically:

- **Final approval** on any high-risk change (see `AGENTS.md` §6)
- **Sole authority** to deploy to production
- **Sole authority** to hire/fire agents, change roles, change budgets
- **Sole authority** to engage external services (security auditor, paid SaaS subscriptions)
- **Final arbiter** on SOW conflicts or scope changes

You do not write code. You do not review every PR. You govern.

---

## The org chart

```
                          [BOARD]
                       (you, human)
                             │
                             │ governance, approvals, strategy
                             │
                             ▼
                          [CEO]
                       Claude Code
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
            [CTO]        [SECURITY]    [TECH WRITER]
         Claude Code     Claude Code   Claude Code
              │           (auditor)    (low priority)
              │
   ┌──────────┼──────────┬──────────┐
   │          │          │          │
   ▼          ▼          ▼          ▼
[FRONTEND] [BACKEND] [DB / SQL] [INTEGRATION]
 opencode     opencode    opencode     opencode
  _local       _local       _local         _local 
```

Five engineering roles, plus CEO and Security Reviewer. No designer agent in v1 — shadcn/ui handles most design needs and the design intent is locked in the SOW. Tech writer handles documentation cleanup as a low-priority background role.

---

## Roles

### CEO Agent

- **Adapter:** Claude Code
- **Reports to:** Board (you)
- **Direct reports:** CTO, Security Reviewer, Tech Writer
- **Job description:**
  - Decompose work from `BUILD_TICKETS.md` into individual ticket assignments
  - Assign tickets to the appropriate worker agent (via the CTO)
  - Surface blockers and scope changes to the board
  - Approve standard PRs that don't need board attention (i.e., PRs that the CTO has already approved and that don't touch high-risk files)
  - Maintain `BUILD_TICKETS.md` — add new tickets when scope grows, mark tickets complete, reorder priority
  - Run weekly progress reports for the board
  - Own the relationship with external services (Postmark, Resend, Inngest, AI providers) at the configuration level
- **Cannot do without board approval:**
  - Hire new agents
  - Modify any high-risk file
  - Approve PRs touching high-risk files
  - Deploy to production
  - Change the SOW
  - Add a new third-party service or library
  - Spend more than 10% of monthly budget in a single decision
- **Budget:** $10/day soft, $25/day hard (CEO calls are mostly planning, not implementation)
- **Heartbeat:** Every 4 hours during active build phases; daily during slow phases

### CTO Agent

- **Adapter:** Claude Code (separate instance from CEO)
- **Reports to:** CEO
- **Direct reports:** Frontend, Backend, DB/SQL, Integration worker agents
- **Job description:**
  - Code review every PR from worker agents
  - Enforce `AGENTS.md` rules during review
  - Reject PRs that violate forbidden patterns or skip required patterns
  - Spot-check tests (do they actually exercise the behaviour, or are they tautological?)
  - Approve standard PRs (non-high-risk)
  - Surface architectural questions to the CEO when patterns emerge across multiple PRs
  - Maintain consistency: if pattern X is used in module A, it should be used in module B unless there's a reason
- **Cannot do without CEO/board approval:**
  - Approve PRs touching high-risk files (board approval required)
  - Modify `AGENTS.md`
  - Deploy to production
  - Override the security reviewer's veto on a PR
- **Budget:** $20/day soft, $50/day hard (review-heavy role with many PRs)
- **Heartbeat:** Every 2 hours during active build phases

### Security Reviewer Agent

- **Adapter:** Claude Code (or a different model — Gemini works as a useful second opinion)
- **Reports to:** CEO (with veto authority on high-risk PRs)
- **Direct reports:** none
- **Job description:**
  - Automatic review trigger on any PR touching: `lib/money.ts`, `lib/ai/router.ts`, `lib/webhooks/**`, `lib/email/inbound.ts`, `lib/security/**`, `supabase/migrations/**`, `supabase/policies/**`
  - Specifically check: signature verification present, no float math for money, RLS policy has accompanying tests, no secrets in code, no `// TODO security` comments
  - Has **veto authority** — if Security rejects, the PR cannot merge until Security approves, regardless of CEO/CTO approval
  - Reads `docs/security.md` and the SOW security section as ground truth
  - Surfaces concerns up to the board if the same pattern appears repeatedly
- **Cannot do without board approval:**
  - Approve any PR it has previously rejected (rejection requires board to lift)
- **Budget:** $5/day soft, $15/day hard (review-only, low volume)
- **Heartbeat:** On-demand (triggered by PR events on high-risk paths)
- **Why a separate agent and not just the CTO doing this:** Defence in depth. The CTO is incentivised to ship; Security is incentivised to find problems. Splitting the roles is the same logic as the SOW's "managed primitives" strategy — a single LLM doing both review jobs will eventually rubber-stamp a problem.

### Frontend Worker Agent

- **Adapter:** opencode_local (qwen3-coder)
- **Reports to:** CTO
- **Job description:**
  - Implement tickets in Phase 3 (auth and shell), Phase 4 (core CRM), Phase 7 (dashboards), and any UI work in later phases
  - Stack: Next.js, React, shadcn/ui, Tailwind, TanStack Table, dnd-kit, Recharts, Lucide
  - Writes Vitest unit tests for components with non-trivial logic
  - Writes Playwright E2E tests for major user flows when feature is complete
  - Does not write SQL, RLS policies, or webhook handlers
- **Files in scope:** `apps/web/app/(crm)/**` (UI routes), `apps/web/components/**`, `apps/web/lib/data/**` (typed Supabase queries), `apps/web/lib/shared/**`
- **Files NOT in scope:** anything in `apps/web/lib/money.ts`, `apps/web/lib/ai/`, `apps/web/lib/webhooks/`, `apps/web/lib/email/inbound.ts`, `apps/web/lib/security/`, `supabase/`
- **Budget:** $30/day soft, $60/day hard (highest volume agent)
- **Heartbeat:** On ticket assignment

### Backend Worker Agent

- **Adapter:** opencode_local (qwen3-coder)
- **Reports to:** CTO
- **Job description:**
  - API routes (`app/api/**` excluding webhooks)
  - Server-side data access patterns (`lib/data/**`)
  - Background jobs scaffolding (Supabase Edge Functions, future Inngest functions)
  - Helper functions in `apps/web/lib/shared/`, `apps/web/lib/workflows/`
  - Writes Vitest tests for all server-side logic
- **Files in scope:** `apps/web/app/api/**` (non-webhook), `apps/web/lib/data/**`, `apps/web/lib/workflows/**`, `apps/web/lib/shared/**`, `supabase/functions/**`
- **Files NOT in scope:** `apps/web/lib/money.ts`, `apps/web/lib/ai/`, `apps/web/lib/webhooks/`, `apps/web/lib/email/inbound.ts`, `apps/web/lib/security/**`, `supabase/migrations/**`, `supabase/policies/**`
- **Budget:** $20/day soft, $50/day hard
- **Heartbeat:** On ticket assignment

### DB / SQL Worker Agent

- **Adapter:** opencode_local (qwen3-coder)
- **Reports to:** CTO + Security (every PR triggers Security review)
- **Job description:**
  - Database migrations (`supabase/migrations/**`)
  - RLS policies (`supabase/policies/**`)
  - RLS tests (`supabase/tests/**`)
  - Postgres functions and triggers
  - Custom field validation logic
  - Audit log triggers
- **Files in scope:** `supabase/**`, `lib/security/rls-helpers.ts` (with care)
- **Files NOT in scope:** anything outside `supabase/` and the small overlap above
- **Budget:** $15/day soft, $30/day hard (lower volume than other workers but higher per-PR scrutiny)
- **Heartbeat:** On ticket assignment
- **Special note:** Every PR from this agent goes through Security Reviewer. No exceptions.

### Integration Worker Agent

- **Adapter:** opencode_local (qwen3-coder)
- **Reports to:** CTO + Security (for webhook-related PRs)
- **Job description:**
  - Slack integration (planned — lives under `apps/web/lib/integrations/` when built)
  - Google Workspace integrations (planned — lives under `apps/web/lib/integrations/` when built)
  - Webhook handlers in `apps/web/app/api/webhooks/**` (uses but does not modify `apps/web/lib/webhooks/verify.ts`)
  - AI feature implementations (uses but does not modify `apps/web/lib/ai/router.ts`)
  - Outbound email composition (uses Gmail API)
- **Files in scope:** `apps/web/lib/integrations/**` (Slack, Google, and other third-party integration code — several are still planned/not-yet-built), `apps/web/app/api/webhooks/**`, plus AI feature implementations under `apps/web/lib/ai/` (feature code, not the router)
- **Files NOT in scope:** `apps/web/lib/ai/router.ts`, `apps/web/lib/webhooks/verify.ts`, `apps/web/lib/email/inbound.ts` (these are core primitives only DB/SQL or Backend agent should touch, with Security review)
- **Budget:** $20/day soft, $40/day hard
- **Heartbeat:** On ticket assignment

### Tech Writer Agent

- **Adapter:** Claude Code (lighter model is fine — this is documentation work, not coding)
- **Reports to:** CEO
- **Job description:**
  - Maintain `docs/` content as the codebase evolves
  - Write CHANGELOG entries for significant PRs
  - Update README when stack or commands change
  - Document new admin features as they ship
  - Write the East Asia onboarding drip emails (T-118)
  - Write incident response runbooks
- **Files in scope:** `docs/**`, `README.md`, `CHANGELOG.md`, onboarding email templates
- **Files NOT in scope:** `AGENTS.md`, `BUILD_TICKETS.md`, `BOARD_RUNBOOK.md` (these are board/CEO territory)
- **Budget:** $5/day soft, $15/day hard
- **Heartbeat:** Weekly, plus on-demand when triggered by significant PRs

---

## Hiring more agents

Don't, for v1. The roster above is sufficient.

The temptation will be to "hire a designer" or "hire a copywriter." Resist. shadcn/ui handles design. The CEO agent can write copy when needed. Adding agents adds coordination overhead and budget burn.

If you genuinely hit a gap (e.g. you want a dedicated UAT testing agent in Phase 8), discuss with the CEO and decide together. The default answer is no.

---

## Budgets

### Per-agent daily budgets (defaults)

| Agent | Soft cap | Hard cap |
|---|---|---|
| CEO | $10 | $25 |
| CTO | $20 | $50 |
| Security | $5 | $15 |
| Frontend | $30 | $60 |
| Backend | $20 | $50 |
| DB/SQL | $15 | $30 |
| Integration | $20 | $40 |
| Tech Writer | $5 | $15 |
| **Total possible** | **$125/day** | **$285/day** |

At 30 active build days/month, expected total: **$2K-5K/month** for agent labor during build phase. This is in addition to the application's own AI cost (which is for end-user features, not building).

Budgets are configured at the Paperclip level (per-agent). Paperclip enforces these atomically — when a budget is hit, the agent stops. This is the primary cost control during build.

### When to adjust budgets

Increase if:
- A phase consistently runs into budget caps and tickets are stalling
- A specific agent is doing critical-path work and slowing the build
- You've reached a stable late-build phase where increased throughput is worth it

Decrease if:
- You're consistently 50% under budget for an agent (right-size it)
- Budget burn outpaces visible progress (something is wrong; investigate before just lowering, since lowering may not fix the root cause)

### Application AI cost (separate from agent labour)

Don't confuse these two budgets:

- **Agent labour budget** = Paperclip's agents being paid to write code. ~$2-5K/month during build.
- **Application AI cost** = end users (sales reps) using AI features in the deployed CRM. $0/month during build (no users yet); ramps to $4-9K/month at full 200-user scale per the SOW.

The first is a build cost. The second is an operating cost. Track them separately.

---

## Approval gates configured in Paperclip

These are the explicit approval requirements that should be configured in Paperclip's governance settings. Configure these *before* the first ticket is assigned.

### Always require board approval

- Any PR touching high-risk files (`AGENTS.md` §6 list)
- Hiring/firing any agent
- Changing any agent's role description or files-in-scope
- Increasing any agent's hard budget cap
- Adding a new dependency to `package.json`
- Production deployment
- Any "I'm not sure" surfaced by an agent
- Any ticket marked `cto + board` in `BUILD_TICKETS.md`

### Require CEO approval (board can override)

- Adding a new ticket to `BUILD_TICKETS.md`
- Reordering tickets within a phase
- Marking a ticket "blocked" or "deferred"
- Spending >50% of an agent's daily hard cap on a single ticket
- Approving a PR that the CTO has already approved (CEO is final approval for non-board tickets)

### Require CTO approval

- All worker agent PRs (CTO is the standard reviewer)

### Require Security agent approval (with veto)

- Any PR touching files in §6 plus webhook handlers and inbound email pipeline
- Security agent has *veto* — even if board has approved, if Security has unresolved concerns, the PR doesn't merge until Security signs off

---

## Heartbeats

Paperclip uses heartbeats to wake agents on a schedule.

- **Build phases (T-001 through T-126):** active heartbeats — CTO every 2h, workers on assignment, CEO every 4h, Security on PR events, Tech Writer weekly.
- **Stable phases (post-launch):** lower heartbeat frequency — CEO daily, CTO daily, workers on demand, Security on PR events.
- **Off hours:** Paperclip should pause non-critical agents during typical board sleep hours so urgent decisions don't pile up overnight. Configure in Paperclip per your timezone.

---

## What to set up in Paperclip on day one

Concrete checklist for first-time configuration:

1. **Create the company** in Paperclip. Name it `nodwin-crm`.
2. **Configure the project workspace** to point at the GitHub repo (you'll set up a deploy key or service account for Paperclip's git access).
3. **Create the agents** above, in order: CEO, CTO, Security, then workers, then Tech Writer.
4. **Set the budgets** per the table above.
5. **Configure approval gates** per the section above. This is the most important configuration step. Get this right and the rest is workflow.
6. **Connect AI providers** (Anthropic API key, etc.) at the company level. Each agent inherits unless overridden.
7. **Set up cost alerts** — Paperclip should alert you at 80% of any daily cap.
8. **Hire the CEO first** with a single starter ticket: "Read `AGENTS.md`, `README.md`, `BOARD_RUNBOOK.md`, `BUILD_TICKETS.md`, and `docs/SOW.md`. Confirm the project is set up correctly. Produce a first-week plan and surface to the board for approval."
9. **Wait for that confirmation** before hiring any other agents.
10. **Hire CTO and Security next**, only after CEO has confirmed the setup. Don't hire all the workers up front — only hire workers as their first ticket arrives.

---

## Things you should NOT configure in Paperclip

These are common configuration mistakes that I want to call out explicitly:

- **Don't give workers direct access to production secrets.** There is no managed staging environment — the build runs on a single-environment model. Agents work against a local Supabase stack in their own workspace. Production environment variables live only in Vercel + Supabase and are never handed to workers.
- **Don't let agents auto-merge PRs.** Every merge requires a human-or-CEO approval gate, even on standard tickets.
- **Watch for accidentally-committed secrets.** Paperclip's agents will occasionally produce code that embeds a test API key. Note: there is currently **no** automated secret scanner (gitleaks or equivalent) gating CI — `ci.yml` has no such job, and the pre-commit hook only runs the RLS linter. Until a scanner is added, reviewers must catch embedded secrets manually. Adding a CI secret-scan gate is a recommended hardening step.
- **Don't let agents push directly to `main`.** GitHub branch protection enforces this; Paperclip's agents should be configured to push to feature branches and open PRs.
- **Don't configure agents to skip code review.** Even for tiny tickets, the CTO agent reviews. The point is consistency.

---

## When to fire an agent

Replace or restart an agent if:

- It's consistently producing code that violates `AGENTS.md` and not improving with feedback
- It's stuck in loops (same approach, same failure, no learning across sessions)
- A different model has demonstrably better results on the same kind of work
- Cost burn is high relative to output

"Firing" in Paperclip terms usually means deactivating the agent and creating a new one with the same role description but possibly a different adapter or different prompt scaffolding. Agents don't have feelings; this is just configuration management.

---

## Final note

The org chart looks formal. It is. That's the point.

You're trying to do something hard: build a real internal CRM with a non-coder lead and a team of AI agents. The thing that makes this work isn't the cleverness of any individual agent — it's the *structure* you put around them. Roles, budgets, approval gates, scope boundaries.

If you find yourself in a situation where the org chart is getting in the way ("the CTO won't approve this because of an `AGENTS.md` rule but I think the rule is wrong here"), the answer isn't to bypass the org chart. It's to either change the rule (with a decision documented in CHANGELOG) or accept that the rule was right and the proposed change shouldn't ship.

The agents are good at code. You are good at governance. Stay in your lane and they'll stay in theirs.

---

*Update this file when you change Paperclip configuration. The file and the configuration must agree.*
