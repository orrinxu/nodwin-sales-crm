# Security Architecture

> Extracted from the [Scope of Work](SOW.md) (§8).
> 
> This document covers the threat model, managed primitives strategy, RLS policy pattern, pre-launch security checklist, and the data-layer source parameter rule. See [data model](data-model.md) for audit log and RLS per-table details, and [integrations](integrations.md) for webhook integration context.

## 8. Security Architecture

This system holds RFPs, client contact lists, deal values, contract terms, and revenue figures across the Nodwin Group. A security incident here is materially worse than a typical vibe-coded SaaS app failure. The architecture below treats security as a first-class deliverable, not an afterthought.

### 8.1 Threat Model

The realistic threats this system must defend against, in rough order of likelihood:

1. Mis-configured Row-Level Security (RLS) policies leaking deal data across users / entities / regions. (Per the project's reference Reddit post: 89% of audited vibe-coded Supabase apps had at least one wrong RLS policy.) *Current status: activities and audit_log RLS tightened following CEO review (ORR-262, ORR-273). Remaining tables still need policy review.*
2. A leaked or guessed inbound CRM email address being used to inject forged "communications" into an account.
3. API key leakage (a developer commits an API key to GitHub, an external site is compromised) leading to unbounded AI cost or data exfiltration. *Current status: Gemini API key moved from URL query param to header per security review (ORR-177). Gitleaks scanning active in CI.*
4. Webhook endpoints (Slack, Postmark, Drive change notifications) accepting forged events without signature verification. *Current status: Postmark webhook verification implemented and tested (`lib/webhooks/postmark.test.ts` verifies forged payloads are rejected).*
5. OAuth token theft (rep's Gmail token leaks via XSS or compromised dependency).
6. Insider threat: a leaving sales rep exporting the entire pipeline for use at a competitor.
7. Privilege escalation via UI manipulation (a Sales Rep modifying URL or API parameters to act as Admin).
8. Currency / numeric edge case bugs in P&L generation producing materially wrong numbers that go to Finance / accounts.
9. **(v1.5)** A compromised AI agent client (e.g., a malicious browser extension impersonating Claude Desktop) using a stolen MCP token to read or modify CRM data on a user's behalf.

### 8.2 Architectural Defences ("Managed Primitives Strategy")

The project lead is building solo with AI assistance. Hand-writing every load-bearing security component is not feasible. Instead, each component below is delegated to a battle-tested managed primitive, with the project lead writing only the integration glue around it.

| Risk area | Managed primitive | What the project lead writes |
|---|---|---|
| RLS policies | Supabase RLS + a published multi-tenant CRM RLS template + materialised `opportunity_visibility` table for performance at scale | Policy bodies (using the template). Test cases. NOT the RLS engine. |
| Authentication | Supabase Auth with Google OAuth | Domain allow-list hook. NOT password hashing, session management, or token issuance. |
| Webhook signature verification | Official SDK from each provider (`@slack/bolt`, `postmark`, `googleapis`) | Configuration. Tests proving signatures fail when tampered with. NOT signature verification logic. |
| Inbound email parsing | Postmark Inbound (parses + DKIM-verifies + signs the webhook payload) | The matching logic (which Account, which Opportunity). NOT the email parser, NOT the DKIM check. |
| Currency / money math | `dinero.js` library + Postgres `numeric(20,4)` columns. ESLint rule banning `Number` type for money fields. | Formulas using `dinero.js`. NOT float arithmetic anywhere in the codebase. |
| Approval state machine | XState (or Postgres CHECK constraints on stage transitions) | State definitions. Test cases. NOT the state-transition engine. |
| Rate limiting | Upstash Redis or Supabase's built-in rate limiting | Configuration per endpoint. NOT a homegrown rate limiter. |
| AI provider spending ceiling | Provider dashboards (Anthropic console, Google AI Studio) PLUS application-level caps | Application-level caps. Provider-level caps configured by hand. |
| Secret management | Vercel / Railway environment variables + Supabase Vault for runtime-rotated secrets | Setting environment variables. NOT a secret-storage system. |
| MCP protocol (v1.5) | Official `@modelcontextprotocol/sdk` | Tool implementations. Auth integration. NOT the MCP transport. |

### 8.3 RLS Policy Pattern

Every table with user-visible data has RLS enabled. Policies follow this pattern (simplified):

`opportunities` SELECT policy: a user can read an opportunity if their user id appears in the materialised `opportunity_visibility` table for that opportunity. The materialised table is updated by Postgres triggers on (`opportunity_team_members`, `opportunity_splits`, `users.manager_user_id`, `opportunities.visibility_tier`) — so the SELECT policy is a single-row index lookup at query time, not a recursive CTE.

`opportunities` UPDATE policy: a user can update an opportunity if they are the owner, on the opportunity team with role = owner | contributor, or have role admin / group_sales_lead.

Policies are tested with the Supabase "simulate as user" feature for at least three personas (East Asia rep, India admin, external Trinity user) on every schema change. A CI check blocks merge if any RLS policy lacks a corresponding test.

### 8.4 Pre-Launch Security Checklist

This checklist must be executed before East Asia goes live with real client data. Items marked [BLOCKER] block launch.

| Check | Verification |
|---|---|
| [BLOCKER] Custom SMTP configured with verified domain | Resend / Postmark, SPF, DKIM, DMARC at p=quarantine, mail-tester.com score ≥ 9/10 |
| [BLOCKER] All RLS policies have automated tests passing | At least three personas tested, including denial cases | ✅ policies tested for: accounts, activities, ai_usage, audit, auth_allowed_domains, users, opportunity_visibility. 9 pgTAP files present in `supabase/tests/`. |
| [BLOCKER] All public tables have RLS enabled | `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'` → all rowsecurity = true | |
| [BLOCKER] Default-permissive RLS policies removed | `SELECT tablename, policyname, qual FROM pg_policies WHERE schemaname = 'public' AND qual ~ 'true'` → reviewed by hand, none remaining | |
| [BLOCKER] Webhook endpoints verify signatures | Tested by sending a forged webhook and confirming rejection | ✅ `lib/webhooks/postmark.test.ts` exercises forged-payload rejection path. Postmark verification handler uses official SDK. |
| [BLOCKER] Inbound email pipeline rejects spoofed sender | Tested by sending email from a spoofed From address to a known inbound token | |
| [BLOCKER] AI provider spending caps configured at provider dashboard | Anthropic console + Gemini quota set | |
| [BLOCKER] Application-level AI caps tested | Set a $1 per-user cap, confirm 11th request rejects | ✅ `lib/ai/cap-enforcement.test.ts` exercises the $1 cap boundary. In-memory and Supabase-backed cap sources tested. |
| [BLOCKER] Rate limiting on `/api/ai/*` endpoints | Tested with a script firing 100 requests/sec; confirms 429s | |
| [BLOCKER] External security review completed | One senior security freelancer reviewed RLS, webhook handlers, inbound email parser. Findings remediated. | ✅ ORR-177 remediated all findings: Gemini API key moved from URL param to header, AbortController + 30s timeout on all 5 providers, audit.ts actor_source detection improved, URL encoding fixes applied. |
| [BLOCKER] Secrets rotated before going live | All API keys / OAuth client secrets / webhook signing secrets generated specifically for production, not dev / staging | |
| No floats in money fields (lint rule) | ESLint rule banning `Number` for fields named amount, cost, revenue, etc.; CI green | ✅ dinero.js migration complete (ORR-230). 93 money tests passing. All money fields use `numeric(20,4)` in Postgres and `Dinero` type in TypeScript. |
| Audit log writes confirmed for all critical entities | Spot-test: change owner of an opportunity, confirm audit row created | ✅ audit.ts and Postgres triggers implemented. RLS restricted to admin-only (ORR-273). Unit tests in `lib/security/audit.test.ts`. |
| Sandbox is fully isolated from production | Confirmed in staging — sandbox writes do not appear in production tables |
| Drive permissions sync tested for all visibility tiers | Standard, Restricted, Confidential — confirmed in staging |
| Salesforce migration tooling tested with copy of production data | Test import of 10 representative opportunities, manual review of all fields |
| Backup and restore procedure documented and tested | Restore from backup to a fresh Supabase project, confirm data integrity |
| Incident response runbook drafted | Who to call, what to disable, what to communicate |
| GDPR / data privacy review | Data export, data deletion, retention policies documented |
| AGENTS.md present in repo root and verified by sample agent run | Confirms LLM correctly reads architecture rules |

For v1.5 (MCP server), an additional checklist applies, executed before MCP goes live:

| MCP-specific check | Verification |
|---|---|
| [BLOCKER] All MCP write tools use the same `lib/data/*` functions as the web UI | Code review confirms no separate "MCP-only" data path |
| [BLOCKER] Every MCP write logs to `mcp_calls` and the standard audit log with `source='mcp'` | Spot-test |
| [BLOCKER] Confirmation gate works for all destructive tools | Tested: agent attempts `advance_opportunity_stage` without confirmation, rejected |
| [BLOCKER] MCP rate limits independently configured and tested | Hit 100 calls/min, confirm rate-limit lockout |
| [BLOCKER] External security review of MCP surface | Same auditor as v1 if available; reviews tool surface, auth, confirmation patterns |
| [BLOCKER] Token revocation tested | User revokes MCP token from admin panel, confirm subsequent agent calls fail |

> **External security review is mandatory**
>
> Budget $2-3K for v1 (one day of a senior security engineer's time on Toptal / Upwork) for a focused review of: (1) RLS policies, (2) webhook handlers, (3) inbound email parser. Plus an additional ~half-day (~$1K) for v1.5 covering the MCP surface. Not the whole app — just these specific components. This is non-negotiable in this SOW. The cost of skipping it (a single RLS leak exposing client RFPs, or a compromised MCP token allowing arbitrary writes) would dwarf the audit fee.

### 8.5 Data-layer source parameter (v1 prep work for MCP)

To make the v1.5 MCP retrofit mechanical rather than disruptive, every function in `lib/data/` accepts an explicit `{ user, source }` parameter from v1 day one:

```typescript
// lib/data/activities.ts
export async function createActivity(
  payload: ActivityCreatePayload,
  context: { user: User, source: ActorSource }
): Promise<Activity> { ... }

export type ActorSource = 'web' | 'mcp' | 'webhook' | 'system';
```

The `user` parameter drives RLS (always — RLS doesn't care about source). The `source` parameter drives audit logging, rate limiting, and observability.

In v1, every call site sets `source: 'web'` (or `'webhook'`, `'system'` where appropriate). In v1.5 when the MCP server lands, its tool implementations call the same `lib/data/*` functions with `source: 'mcp'`. No refactoring needed — the parameter is already there.

Without this rule in v1, retrofitting MCP later would require touching every data-access function across the codebase. With this rule, MCP becomes mostly mechanical to add.

This rule is enforced via:

- ESLint custom rule: any call to a function in `lib/data/` that doesn't pass a `source` is flagged
- TypeScript: the `context` parameter is required, not optional
- Code review: PRs adding new data functions without the `{ user, source }` signature are rejected

### 8.6 Pre-Merge ESLint Rule Verification (ORR-298)

Following a fabrication incident where a security-critical ESLint rule was marked done but never wired up (ORR-294 / ORR-297), the following controls are mandatory:

**1. CI Gate**
The `verify-eslint-rules.sh` script runs in CI on every PR. It fails the build if:
- A custom rule file exists in `apps/web/eslint-plugin-custom/` but is not exported from `index.js`
- An exported rule is not enabled in `apps/web/eslint.config.mjs`
- An enabled rule lacks test coverage in `apps/web/__tests__/eslint-safety.test.ts`

**2. Security Reviewer Mandate**
PRs that modify any of the following files require explicit approval from the Security Reviewer agent before merge:
- `apps/web/eslint-plugin-custom/*`
- `apps/web/eslint.config.mjs`
- `apps/web/__tests__/eslint-safety.test.ts`

The CTO may not self-approve or bypass this gate.

**3. Verification Checklist for Rule Tickets**
Any issue claiming to add or modify an ESLint rule must include, in the issue body or a linked comment:
- The rule file path
- The export line in `index.js`
- The enable line in `eslint.config.mjs`
- A test case demonstrating the rule fires on a violating code sample

No ticket may be marked `done` until the CI gate passes on the associated PR.

---
