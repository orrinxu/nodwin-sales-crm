# Integration Architecture

> Extracted from the [Scope of Work](SOW.md) (§6).
> 
> This document describes the authentication, email, Slack, Google Workspace, AI provider, and background job integrations. See [security](security.md) for webhook signature verification and threat model.

## 6. Integration Architecture

### 6.1 Authentication

Supabase Auth with Google OAuth provider. Domain allow-list enforced at sign-up (a Supabase Auth Hook rejects sign-ups from non-allowlisted domains). The allow-list is admin-configurable from the admin panel without redeploy. All other auth methods (password, magic link, social) are disabled.

In v1.5, the same Supabase Auth issues OAuth tokens for MCP clients via a separate device-grant flow. Same identity, same RLS.

### 6.2 Email — Outbound

**Transactional email** (system notifications, approval requests, P&L delivery, weekly digests): sent via **Resend or SMTP** (the outbound transport is `"smtp" | "resend"`, resolved in `lib/data/email-transport.ts` and dispatched by `lib/notifications/delivery.ts`; SMTP uses `nodemailer`). Postmark is inbound-only — there is no Postmark outbound path. The configured domain (`crm.nodwin.com`) should be verified (`crm.nodwin.com`) and full SPF / DKIM / DMARC records. DMARC at `p=quarantine` minimum. This is non-negotiable per the failure mode documented in the project's reference Reddit post — Supabase's default SMTP has poor deliverability and would silently spam-folder ~50% of system emails.

**User-composed email** (rep writes to a client): **v1 ships as a deep-link** (decision ORR-706, 2026-07). Clicking *Email* on a contact/account opens the rep's own Gmail / mail client with the recipient pre-filled; the rep composes and sends from their own account. This is the deliberate "realistic version" — no per-user Gmail OAuth, no outbound deliverability surface — and is what is built today.

> **Future expansion (post-v1, Option B — ORR-706):** send the user-composed email *from inside the CRM* via the user's **connected Gmail account** (OAuth scope `gmail.send`), so the email appears in the rep's Sent folder, threads correctly, respects the user's signature/reply-to, is **logged as a CRM activity**, and inbound replies thread via `In-Reply-To` header matching. This is a larger Google-Workspace investment that overlaps §6.5 (Google Workspace / ORR-697/698). Re-ticket it if reps need sent email captured in-CRM; deep-links are the accepted v1 until then.

### 6.3 Email — Inbound

Each user is provisioned a unique inbound address: `firstname-{6char_token}@crm.nodwin.com`. Tokens are generated using a cryptographically secure random source, distinct per user, and never reused even if a user is deleted.

Inbound email is handled by Postmark Inbound (recommended) or AWS SES Inbound. The provider parses the email, verifies DKIM, and POSTs a clean JSON payload to a CRM webhook endpoint.

#### 6.3.1 Inbound Email Pipeline

1. Postmark / SES receives the email at the user's unique address.
2. Postmark / SES verifies DKIM, parses the email, attaches a DKIM-pass flag, and POSTs to a Supabase Edge Function endpoint with a signed webhook header.
3. The webhook handler (`lib/webhooks/postmark.ts`) authenticates the request with a **constant-time shared-secret check** — it compares the `x-postmark-webhook-secret` header against the `POSTMARK_WEBHOOK_SECRET` env value using `timingSafeEqual` (see Section 8). There is no Postmark SDK; the check is a length-guarded constant-time comparison that rejects unsigned or mismatched requests before the payload is parsed.
4. Edge function looks up the user by inbound address. If no user matches, the email is logged to a dead-letter table and an admin alert is sent.
5. Edge function verifies the email was sent by the matched user (i.e., the From header matches the user's known email or one of their connected aliases). This prevents anyone with a leaked inbound address from injecting fake activities. Mismatches go to the dead-letter table.
6. Edge function attempts to match the email to an Account by parsing the email's other recipients' domains against `Account.email_domains`.
7. If exactly one Account matches, the email is recorded as an Activity attached to that Account.
8. If multiple Accounts match (or none), the email is recorded as an unassigned Activity in the user's inbox; the user reviews and assigns from the UI.
9. If the email subject contains a recognised opportunity tag (e.g., `[OPP-1234]` or a configurable pattern), it is attached directly to that Opportunity.
10. Attachments under 25MB are uploaded to the Opportunity / Account Drive folder. Larger attachments are skipped with a note in the Activity.

> **Why this is treated with extreme care**
>
> A poorly built inbound parser is a critical vulnerability: an attacker who learns or guesses an inbound address could inject fake "communications" attributing fabricated quotes to real client contacts. The DKIM verification + sender-match + domain-match + dead-letter table layered defence is the minimum acceptable bar. This component is not vibe-coded: the webhook is authenticated with a constant-time shared-secret comparison (`timingSafeEqual` on the `x-postmark-webhook-secret` header vs `POSTMARK_WEBHOOK_SECRET` — no third-party SDK), backed by a unit test suite exercising forgery, replay, and sender-spoofing attempts.

### 6.4 Slack

> **Status: notification broadcasts SHIPPED (ORR-771, 2026-07-17); the full bot app below is still a future expansion.**
>
> **What is built today — channel broadcasts via incoming webhooks.** An admin connects a Slack **incoming webhook** per workspace/channel in **`/admin/slack`** (webhook URL stored on `slack_connections.webhook_url` — a bearer secret protected by the table's admin-only SELECT + service-role read, same posture as `email_transport`), and chooses which events broadcast. `sendSlackNotification()` (`lib/notifications/delivery.ts`) then POSTs those events to every connected webhook. Events wired: `stage_change`, `deal_won`, `deal_lost`, `deal_assigned`, `approval_requested` — each has a single recipient, so one channel post per event. No per-user OAuth and no `@slack/bolt` dependency — the webhook URL is the credential. This deliberately extends the ORR-706 "deep-links only" v1 stance (per Orrin's 2026-07-17 direction) with low-cost channel broadcasts; it does **not** replace the deep-links.
>
> **What is NOT built (future expansion — the full bot-scoped app).** No slash command, no interactivity/events endpoint, no per-user DMs, no per-deal channel automation, no approve-from-Slack. Those require a bot-token OAuth app (`@slack/bolt`), which incoming webhooks can't do (webhooks are channel-post-only).

The future (planned) bot-scoped Slack app would run with bot scopes for the Nodwin Slack workspace(s) and add, on top of today's channel broadcasts:

- Bot posts to per-Sales-Unit channels: stage advances, deal closures, approval requests, deals at risk.
- Slash command `/crm <query>` performing a quick AI search and returning a card preview with a deep link into the CRM.
- Per-deal Slack channel auto-creation (optional toggle per deal at creation time): creates a private channel, invites the Opportunity Team, posts a deal summary on creation, posts updates as the deal advances.
- DMs to user when an approval is requested of them.
- Approval actioned (approve / reject with comment) directly from the Slack message via Slack interactivity (Block Kit).

When built, Slack webhooks (interactivity, slash commands, events) would be verified via signature using the **official `@slack/bolt` library** — never hand-rolled.

### 6.5 Google Workspace

#### 6.5.1 Drive

> **Status: partially built.** A client-side **Drive → Storage import shipped** (ORR-653, #217): `components/documents/drive-import-button.tsx` opens the Google Picker (per-user OAuth, least-privilege `drive.file` scope, `appId` set for shared drives) and copies each picked file's bytes into the private Supabase Storage `documents` bucket (Section 4.8). So documents can be sourced from Drive today — but the file then lives server-side, not as a Drive reference.
>
> What remains **genuinely unbuilt**: server-side folder creation and visibility-tier permission sync (below), and the server byte-fetch seam `lib/integrations/drive/index.ts`, whose `createDriveClient().fetchFile()` still throws `"Google Drive client is not configured"` (no `googleapis` service-account implementation wired in). The folder/permission design below is aspirational.

Per-opportunity folder created at opportunity creation, under a configurable parent folder structure: `/Nodwin CRM/Opportunities/{Entity}/{Account name}/{Opportunity name}/`. Per-account folder created at account creation under `/Nodwin CRM/Accounts/{Account name}/`.

Folder permissions are managed by the CRM via the Drive API based on the opportunity's visibility tier and team membership (Section 3.2). On any change to opportunity visibility, opportunity team, or revenue split, a background job re-syncs Drive permissions. Permission changes made manually in Drive are not blocked but are reconciled back to CRM intent on the next sync (with a configurable warning to admins).

#### 6.5.2 Gmail

> **Status: unbuilt / planned — tracked as ORR-775, blocked by ORR-773.** No `googleapis` dependency and no Gmail send/read code (verified 2026-07-17). Real two-way Gmail sync needs the **per-user Google OAuth token subsystem (ORR-773)** built first — that subsystem is the shared blocker with Calendar and does not exist yet (the Supabase Google login is identity only and captures no API tokens). The design below is aspirational.

Per-user OAuth grants `gmail.send` (for outbound from CRM) and `gmail.readonly` (for the optional "my recent emails relevant to this deal" feature). The CRM does NOT continuously poll the user's inbox; readonly access is invoked only on-demand when the user opens an opportunity and clicks a "find related emails" button. This is both a privacy boundary and an AI cost control.

#### 6.5.3 Calendar

> **Status: unbuilt / planned — tracked as ORR-774, blocked by ORR-773.** No `googleapis` dependency and no Calendar integration code exists (verified 2026-07-17). Needs the **per-user Google OAuth token subsystem (ORR-773)** first (shared with Gmail), plus an events data model — extend `activities` (start/end/timezone/`external_event_id`) or a dedicated `calendar_events` table (today `activities.type='meeting'` exists but has no time columns). The design below is aspirational.

Per-user OAuth grants `calendar.events` scope. Meetings created from a deal in CRM are written to the user's primary calendar with a structured description containing a deep link back to the CRM. Calendar events involving known CRM contacts (matched by attendee email) are surfaced as suggested Activities in the CRM ("You met with Jane Smith from Tencent yesterday — log meeting?").

#### 6.5.4 Sheets, Slides, Docs

> **Status: unbuilt / planned.** No `googleapis` dependency and no Sheets/Slides/Docs code exists — the P&L-to-Sheets generation described here is not implemented. The design below is aspirational.

Sheets: P&L generation per Section 5.1. Implemented using the Sheets API to programmatically create a copy of the canonical Project Budget Template and populate cells based on opportunity data. The template lives in a Drive location only the CRM service account can modify.

Slides and Docs: surfaced as document-link entries on opportunities (paste a Slides / Docs link in the opportunity description, the CRM detects it and pulls the title + thumbnail). Deeper integration deferred to v2.

### 6.6 AI Provider Router

A pluggable AI client abstraction (`lib/ai/router.ts`, which exposes `aiCall()` and assembles the provider chain) presents a unified completion / streaming interface to the rest of the app. All six provider adapters are implemented and production-ready:

| Provider | Module | Auth method | Status |
|---|---|---|---|
| Anthropic (Claude) | `lib/ai/providers/anthropic.ts` | `x-api-key` header | Shipped — primary for high-quality reasoning, drafting, summarisation |
| Google (Gemini) | `lib/ai/providers/gemini.ts` | `x-goog-api-key` header (NOT URL param) | Shipped — alternative primary, A/B testable |
| Moonshot (Kimi) | `lib/ai/providers/moonshot.ts` | `Authorization: Bearer` header | Shipped |
| DeepSeek | `lib/ai/providers/deepseek.ts` | `Authorization: Bearer` header | Shipped — lower-cost option |
| Ollama | `lib/ai/providers/ollama.ts` | None (localhost) | Shipped — fallback when APIs unavailable or over budget |
| OpenAI-compatible | `lib/ai/providers/openai-compatible.ts` | `Authorization: Bearer` header | Shipped — generic adapter for any OpenAI-compatible endpoint; enabled when `OPENAI_COMPATIBLE_BASE_URL` is set (`ProviderName` value `openai_compatible`, migration `20260619000007`) |

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

**Factory pattern:** `createAdaptersFromEnv()` in `lib/ai/providers/index.ts` reads provider configuration from environment variables and returns only the adapters with valid credentials (`lib/ai/router.ts` holds `aiCall()` and the provider-chain assembly, not the factory). This lets the same code path work in development (Ollama only), staging (subset of providers), and production (all providers).

#### 6.6.1 Knowledge search / RAG stack

Document knowledge search (ORR-620/621) runs on its own OpenAI-compatible seams, separate from the general provider router above:

- **Embeddings** (`lib/ai/embeddings.ts`) call an OpenAI-compatible embeddings endpoint configured via `EMBEDDINGS_BASE_URL` / `EMBEDDINGS_MODEL` / `EMBEDDINGS_API_KEY` (e.g., a self-hosted llama.cpp server), or the equivalent values set in Admin → Knowledge.
- **Generation** (`lib/ai/rag.ts`) produces cited answers grounded only in the retrieved chunks. It uses `aiCall()` against a generation endpoint configured via the `GENERATION_*` env vars or Admin → Knowledge.
- Embeddings are stored in the pgvector `document_chunks` table (`20260704020000_document_ingestion.sql`) and retrieved with **tier-filtered** similarity search (`20260704030000_knowledge_search.sql`, tier fix `20260704040000`), so results never surface chunks the querying user is not entitled to see.

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
- Salesforce parallel-run sync (during the parallel period only). A `salesforce_connections` config table (instance URL + OAuth state + import status) already exists (`20260618000003_integration_config.sql`); the sync itself is later-phase and not yet built.

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
