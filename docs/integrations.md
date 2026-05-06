# Integration Architecture

> Extracted from the [Scope of Work](SOW.md) (§6).
> 
> This document describes the authentication, email, Slack, Google Workspace, AI provider, and background job integrations. See [security](security.md) for webhook signature verification and threat model.

## 6. Integration Architecture

### 6.1 Authentication

Supabase Auth with Google OAuth provider. Domain allow-list enforced at sign-up (a Supabase Auth Hook rejects sign-ups from non-allowlisted domains). The allow-list is admin-configurable from the admin panel without redeploy. All other auth methods (password, magic link, social) are disabled.

In v1.5, the same Supabase Auth issues OAuth tokens for MCP clients via a separate device-grant flow. Same identity, same RLS.

### 6.2 Email — Outbound

**Transactional email** (system notifications, approval requests, P&L delivery, weekly digests): sent via **Resend** or **Postmark** with a verified custom domain (`crm.nodwin.com`) and full SPF / DKIM / DMARC records. DMARC at `p=quarantine` minimum. This is non-negotiable per the failure mode documented in the project's reference Reddit post — Supabase's default SMTP has poor deliverability and would silently spam-folder ~50% of system emails.

**User-composed email** (rep writes to a client from inside the CRM): sent via the user's **connected Gmail account** using OAuth scope `gmail.send`, not via SMTP. This way the email appears in the rep's Sent folder, threads correctly, and respects the user's existing email signature and reply-to. The CRM stores the Gmail message id and threads inbound replies via `In-Reply-To` header matching.

### 6.3 Email — Inbound

Each user is provisioned a unique inbound address: `firstname-{6char_token}@crm.nodwin.com`. Tokens are generated using a cryptographically secure random source, distinct per user, and never reused even if a user is deleted.

Inbound email is handled by Postmark Inbound (recommended) or AWS SES Inbound. The provider parses the email, verifies DKIM, and POSTs a clean JSON payload to a CRM webhook endpoint.

#### 6.3.1 Inbound Email Pipeline

1. Postmark / SES receives the email at the user's unique address.
2. Postmark / SES verifies DKIM, parses the email, attaches a DKIM-pass flag, and POSTs to a Supabase Edge Function endpoint with a signed webhook header.
3. Edge function verifies the webhook signature using the official Postmark / AWS SDK (NEVER hand-rolled; see Section 8). Rejects unsigned or signature-mismatched requests.
4. Edge function looks up the user by inbound address. If no user matches, the email is logged to a dead-letter table and an admin alert is sent.
5. Edge function verifies the email was sent by the matched user (i.e., the From header matches the user's known email or one of their connected aliases). This prevents anyone with a leaked inbound address from injecting fake activities. Mismatches go to the dead-letter table.
6. Edge function attempts to match the email to an Account by parsing the email's other recipients' domains against `Account.email_domains`.
7. If exactly one Account matches, the email is recorded as an Activity attached to that Account.
8. If multiple Accounts match (or none), the email is recorded as an unassigned Activity in the user's inbox; the user reviews and assigns from the UI.
9. If the email subject contains a recognised opportunity tag (e.g., `[OPP-1234]` or a configurable pattern), it is attached directly to that Opportunity.
10. Attachments under 25MB are uploaded to the Opportunity / Account Drive folder. Larger attachments are skipped with a note in the Activity.

> **Why this is treated with extreme care**
>
> A poorly built inbound parser is a critical vulnerability: an attacker who learns or guesses an inbound address could inject fake "communications" attributing fabricated quotes to real client contacts. The DKIM verification + sender-match + domain-match + dead-letter table layered defence is the minimum acceptable bar. This component will NOT be vibe-coded; the project lead will use the official Postmark Inbound SDK for parsing and signature verification, with a unit test suite exercising forgery, replay, and sender-spoofing attempts.

### 6.4 Slack

Implemented as a Slack app with bot scopes for the Nodwin Slack workspace(s). Capabilities:

- Bot posts to per-Sales-Unit channels: stage advances, deal closures, approval requests, deals at risk.
- Slash command `/crm <query>` performs a quick AI search and returns a card preview with a deep link into the CRM.
- Per-deal Slack channel auto-creation (optional toggle per deal at creation time): creates a private channel, invites the Opportunity Team, posts a deal summary on creation, posts updates as the deal advances.
- DMs to user when an approval is requested of them.
- Approval can be actioned (approve / reject with comment) directly from the Slack message via Slack interactivity (Block Kit).

Slack webhooks (interactivity, slash commands, events) verified via signature using the **official `@slack/bolt` library** — never hand-rolled.

### 6.5 Google Workspace

#### 6.5.1 Drive

Per-opportunity folder created at opportunity creation, under a configurable parent folder structure: `/Nodwin CRM/Opportunities/{Entity}/{Account name}/{Opportunity name}/`. Per-account folder created at account creation under `/Nodwin CRM/Accounts/{Account name}/`.

Folder permissions are managed by the CRM via the Drive API based on the opportunity's visibility tier and team membership (Section 3.2). On any change to opportunity visibility, opportunity team, or revenue split, a background job re-syncs Drive permissions. Permission changes made manually in Drive are not blocked but are reconciled back to CRM intent on the next sync (with a configurable warning to admins).

#### 6.5.2 Gmail

Per-user OAuth grants `gmail.send` (for outbound from CRM) and `gmail.readonly` (for the optional "my recent emails relevant to this deal" feature). The CRM does NOT continuously poll the user's inbox; readonly access is invoked only on-demand when the user opens an opportunity and clicks a "find related emails" button. This is both a privacy boundary and an AI cost control.

#### 6.5.3 Calendar

Per-user OAuth grants `calendar.events` scope. Meetings created from a deal in CRM are written to the user's primary calendar with a structured description containing a deep link back to the CRM. Calendar events involving known CRM contacts (matched by attendee email) are surfaced as suggested Activities in the CRM ("You met with Jane Smith from Tencent yesterday — log meeting?").

#### 6.5.4 Sheets, Slides, Docs

Sheets: P&L generation per Section 5.1. Implemented using the Sheets API to programmatically create a copy of the canonical Project Budget Template and populate cells based on opportunity data. The template lives in a Drive location only the CRM service account can modify.

Slides and Docs: surfaced as document-link entries on opportunities (paste a Slides / Docs link in the opportunity description, the CRM detects it and pulls the title + thumbnail). Deeper integration deferred to v2.

### 6.6 AI Provider Router

A pluggable AI client abstraction (`lib/ai/router.ts`) exposes a unified completion / streaming interface to the rest of the app. All five provider adapters are implemented and production-ready:

| Provider | Module | Auth method | Status |
|---|---|---|---|
| Anthropic (Claude) | `lib/ai/providers/anthropic.ts` | `x-api-key` header | Shipped — primary for high-quality reasoning, drafting, summarisation |
| Google (Gemini) | `lib/ai/providers/gemini.ts` | `x-goog-api-key` header (NOT URL param) | Shipped — alternative primary, A/B testable |
| Moonshot (Kimi) | `lib/ai/providers/moonshot.ts` | `Authorization: Bearer` header | Shipped |
| DeepSeek | `lib/ai/providers/deepseek.ts` | `Authorization: Bearer` header | Shipped — lower-cost option |
| Ollama | `lib/ai/providers/ollama.ts` | None (localhost) | Shipped — fallback when APIs unavailable or over budget |

**Security measures applied to all adapters (ORR-177):**
- AbortController + 30-second timeout — every provider call is bounded. No hanging requests.
- Gemini API key sent via `x-goog-api-key` header, never as a URL query parameter (previous finding from external security review, remediated).
- Provider-specific URL encoding where required (Anthropic message content, Gemini request bodies).

**Provider selection** is determined by:

1. A per-feature provider preference (e.g., "deal summary" prefers Claude, "quick search" prefers Gemini)
2. A global admin override that can force all calls to a specific provider
3. Automatic fallback to Ollama when (a) the primary provider returns an error, (b) the request would exceed a per-user / per-team / per-company spending cap, or (c) admin has set a fallback flag for cost-saving mode

**Cap enforcement** (`lib/ai/cap-enforcement.ts`) checks per-user, per-team, and per-company daily hard caps **before** the call is made. Caps are read from a configurable source (`lib/ai/supabase-cap-source.ts`). Requests exceeding a cap are either rejected or routed to Ollama depending on the feature flag. The `$1 per-user cap` boundary test confirms the 11th request is correctly rejected.

**Usage logging** (`lib/ai/usage-logger.ts`) writes every call to `ai_usage` (user, provider, model, tokens, cost, feature, timestamp). This drives the AI cost dashboard and powers the cap enforcement system.

**Factory pattern:** `createAdaptersFromEnv()` in `lib/ai/router.ts` reads provider configuration from environment variables and returns only the adapters with valid credentials. This lets the same code path work in development (Ollama only), staging (subset of providers), and production (all providers).

### 6.7 Background Jobs

For v1: Supabase Edge Functions with `pg_cron` for scheduled work. Adequate for v1 scale.

For v1.5+: migrate to **Inngest** for durable, retryable, multi-step background jobs. Justified once we have:

- Multi-step workflows with partial-failure recovery needs (P&L generation: create sheet → populate → share → notify approvers → email)
- Throttling needs across the system (Drive API at 5 calls/sec)
- Observable failure dashboards beyond raw Supabase logs

Background work to migrate (no exhaustive list):

- Drive permission re-sync after team / visibility changes
- Gmail draft sync (when a user composes a CRM email, draft is staged in their Gmail before sending)
- Inbound email post-processing (attachment downloads, AI summarisation if user opts in)
- P&L sheet generation on close
- Audit log compaction (older than 90 days summarised; raw kept indefinitely in a cold store)
- Scheduled dashboard data refresh
- AI usage daily rollups for the cost dashboard
- Salesforce parallel-run sync (during the parallel period only)

### 6.8 MCP Server (v1.5)

The MCP server exposes a set of well-defined tools that AI agent clients (Claude Desktop, NanoClaw, Cursor, Cowork, etc.) can invoke on behalf of the authenticated user.

#### 6.8.1 Architecture

- Runs as a separate process (or Next.js API route) speaking the MCP protocol over HTTP/SSE.
- Authentication uses the same Supabase Auth as the web app, but with a separate device-grant OAuth flow for headless clients. Each MCP session creates a row in `mcp_sessions`.
- All tool implementations call the same `lib/data/*` functions the web UI uses, with `source = 'mcp'`. There is no separate "MCP-only" data path. This is the critical architectural property that makes MCP safe: the same RLS, audit, validation, and rate limiting that protect the web UI also protect the MCP server.
- Rate limiting per user and per tool, configurable from admin panel. Defaults: 60 read / minute, 20 write / minute.
- Every tool call writes to `mcp_calls`. Suspected anomalies (a single client making 1,000 calls in an hour) trigger an alert and rate-limit lockout.

#### 6.8.2 Tool Surface (initial v1.5 set)

**Read tools:**

- `search_accounts(query, limit)` → list of matching accounts the user can see
- `search_contacts(query, account_filter)` → list of matching contacts
- `search_opportunities(query, stage_filter, owner_filter)` → list of matching opportunities
- `get_account(account_id)` → full account record (RLS-scoped)
- `get_contact(contact_id)` → full contact record
- `get_opportunity(opportunity_id)` → full opportunity record including team, splits, documents, recent activities
- `list_my_pipeline(stage_filter)` → opportunities owned by or on team for the user
- `list_my_activities(date_range)` → activities authored by the user
- `list_my_tasks(due_filter)` → open tasks assigned to the user
- `get_dashboard_summary()` → headline numbers from the user's dashboard

**Write tools:**

- `create_note(opportunity_id, body)` → creates an Activity of kind `note`
- `create_task(due_at, opportunity_id, body, assignee_user_id)` → creates a task Activity
- `create_call_log(contact_id, duration_minutes, body)` → creates a `call` Activity
- `create_meeting_log(...)` → creates a `meeting` Activity
- `update_contact(contact_id, partial_fields)` → updates contact fields the user can edit
- `advance_opportunity_stage(opportunity_id, to_stage, reason)` → advances stage; requires `request_confirmation` first
- `add_team_member(opportunity_id, user_id, role)` → adds team member; requires `request_confirmation` first

**Meta tools:**

- `request_confirmation(action_description, parameters)` → prompts the user for explicit approval; returns a token the destructive tool requires.

#### 6.8.3 Confirmation Pattern for Destructive Operations

For any tool that closes a deal, transfers ownership, or performs an action the user might not have intended:

1. AI agent calls `request_confirmation({ action: "advance_stage", opportunity_id, to_stage: "closed_won" })`
2. Server returns a confirmation prompt to be displayed to the user by the client (Claude Desktop, NanoClaw, etc.)
3. User explicitly approves in their AI client
4. Client returns the user's approval (with a confirmation token) to the agent
5. Agent calls the destructive tool with the confirmation token
6. Server validates the token, executes the action, logs to audit

This pattern ensures the user is always in the loop for irreversible operations, even when an autonomous agent is acting on their behalf.

#### 6.8.4 Out-of-scope for v1.5 MCP

- Bulk operations (add_team_members in batch, etc.) — added in v2 if usage data justifies
- Document upload via MCP — Drive integration is per-user OAuth and the agent should hand off to the user's Drive client
- Slack interactions via MCP — the user's Slack client is the right tool for that
- Admin operations (creating users, modifying approval workflows, etc.) — admin actions stay in the web UI for v1.5
- Generating P&L sheets — initiated from web UI only in v1.5

---
