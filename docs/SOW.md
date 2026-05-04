# Scope of Work — Nodwin Group Sales CRM

> A Salesforce replacement built for the Nodwin Group.
>
> **Prepared for:** Akshat Rathee, Mickael Piantchenko, Abhishek Aggarwal — Nodwin Gaming · Trinity Gaming India · MaxLevel
> **Project lead:** Orrin Xu
> **Version:** 1.1 · 4 May 2026
>
> **Source:** This document is the canonical SOW. The `.docx` distributed for sign-off was generated from this markdown.
>
> **Changes from v1.0:** Added Phase 9.5 covering the MCP (Model Context Protocol) server that exposes CRM operations to AI agent clients (Claude Desktop, NanoClaw, Cursor, Cowork, and any future MCP-speaking tool). Added a corresponding rule in the data-layer architecture so v1 functions accept an explicit `{ user, source }` parameter, making the v1.5 retrofit mechanical rather than disruptive. No other scope changes.

---

> **Reference documents:** [Data model](data-model.md) · [Integration architecture](integrations.md) · [Security architecture](security.md) · [Incident response runbook](runbook-incident.md)

---

## 1. Executive Summary

**Project.** Build an internal CRM ("Nodwin CRM") that fully replaces Salesforce for the Nodwin Group, beginning with the East Asia sales team and rolling out across all entities (Nodwin India, NG Spr, Unpause, PSH, Trinity Gaming, AFK, Branded, Nodwin MENA, Starladder, Comic Con, and future M&A acquisitions).

**Why.** Salesforce is over-engineered for the group's actual workflows, expensive at the licence-per-seat level we are scaling toward (100–200+ sales users group-wide), and still misses several capabilities the group needs (proper revenue split between sales units, multi-entity P&L generation in Google Sheets, native Slack/Drive/Gmail integration, AI-assisted search across deal history, and a programmatic surface that lets reps interact with the CRM through their AI tools of choice). A purpose-built tool, hosted on infrastructure we control, will be cheaper per user, more pleasant for sales reps, and tightly integrated with the Google Workspace + Slack + AI-agent stack the group already runs on.

**Scope.** This document covers v1 (East Asia rollout, parallel-run with Salesforce, ~5 months from kickoff), v1.5 (the MCP server exposing CRM operations to AI agents, post-East-Asia stability and pre-region rollout), and outlines v2 (full group rollout including India, MENA, EU, CIS, JPKR, Americas) and v3 (post-rollout enhancements). It includes the [data model](data-model.md), [integrations](integrations.md), [security architecture](security.md), AI cost controls, agent / vibe-coding guardrails, migration plan, and a pre-launch security checklist.

**Approach.** The project lead will primarily build using AI-assisted ("vibe") coding with Claude / Gemini / similar LLMs, orchestrated through Paperclip. To make this safe for a system holding RFPs, client contacts, revenue figures, and contract data, the SOW deliberately uses a **"managed primitives" strategy**: the load-bearing security and correctness components (auth, row-level security, currency math, approval state machine, webhook handlers, inbound email parsing) are delegated to battle-tested open-source libraries and SaaS providers (Supabase RLS, dinero.js, XState, Postmark Inbound, official Slack/Stripe SDKs), while the UI, dashboards, list views, integrations glue, and document UX are vibe-coded against a strict `AGENTS.md` specification. A one-time external security review (~$2–3K) is mandatory before any region goes live with real client data.

**Stack.** Next.js + shadcn/ui + Tailwind CSS (frontend), Supabase (Postgres + Auth + Storage + Realtime + RLS), Resend or Postmark (transactional email), Postmark Inbound or AWS SES Inbound (email-to-CRM), Inngest (background jobs in v1.5+; Supabase Edge Functions + pg_cron for v1), an AI provider router (Claude / Gemini / Kimi / DeepSeek / self-hosted Ollama), Slack app, Google Workspace APIs (Drive, Gmail, Calendar, Sheets, Slides, Docs), and an MCP server in v1.5. Mobile delivered as a PWA wrapped with Capacitor for iOS / Android stores.

**Timeline.** ~20–22 weeks (5 months) from kickoff to East Asia going live with parallel Salesforce run, then 4–8 weeks of parallel run before SF cutover. v1.5 (MCP server) follows ~4–6 weeks after East Asia stability, taking ~3–4 weeks. Subsequent regions: ~6–8 weeks each for localisation (FX rate handling, fiscal year calendars, region-specific approval workflows).

**Cost shape.** One-time build cost is primarily the project lead's time plus orchestrated agent labour through Paperclip (~$2–5K/month during build phase). Run-rate cost at scale (200 users) is estimated at $500–1,500/month infrastructure (Supabase Pro + Vercel + Resend + Postmark + a small Ollama GPU VM) plus $4,000–9,000/month AI API spend at expected utilisation (capped via per-user / per-team / per-company hard ceilings). Compare to Salesforce Sales Cloud Enterprise at ~$165/user/month × 200 users = $33,000/month.

> **What this document is not**
>
> This SOW is a planning and architecture document, not source code or a contract. It assumes good-faith collaboration between the project lead, the Nodwin Group leadership team (Akshat, Mickael, Abhishek), and any external freelancers engaged for specific components (security audit, design polish, mobile wrapping). Final implementation details may diverge from the spec where doing so demonstrably improves the outcome — such deviations should be documented in the project's `CHANGELOG.md`.

---

## 2. Goals and Non-Goals

### 2.1 Goals

1. Replace Salesforce as the system of record for sales pipeline, accounts, contacts, opportunities, communications, and deal documents across the entire Nodwin Group.
2. Make the tool dramatically more pleasant to use than Salesforce for the front-line sales rep. The reference experience is Pipedrive's kanban + side-panel detail UX, not Salesforce's tab-and-page-load model.
3. Integrate natively with the Google Workspace stack (Drive, Gmail, Calendar, Sheets, Slides, Docs) and Slack — these are the tools the group already lives in.
4. Support the actual operational reality of the group: multi-entity, multi-currency, multi-fiscal-year, recurring revenue, and revenue-recognition splits between contributing sales teams. The current Project Budget Template (the spreadsheet today's deals get translated into post-close) is the canonical reference for what the data model has to handle.
5. Auto-generate the Project Budget P&L Google Sheet on deal close, prefilled from the CRM data, and email it to the appropriate approvers per the entity's approval workflow.
6. Provide AI-assisted search and summarisation across deal history and communications, with hard cost ceilings and a fallback to a self-hosted LLM if API costs spike or a provider is unavailable.
7. Track all communications (email, Slack, calls, notes) against the relevant deal, account, or contact via a per-salesperson unique inbound CRM email address that they can CC on outbound mail.
8. Provide visual pipeline dashboards for individual reps, sales managers, regional heads, and group leadership, with deal funnel, conversion, revenue forecast, and activity reporting at each level.
9. **(v1.5)** Expose CRM operations to AI agent clients (Claude Desktop, NanoClaw, Cursor, Cowork, and any other MCP-speaking tool) so reps can interact with their pipeline from the tools they already use, scoped to their RLS-enforced view of the data.
10. Be safely buildable by a single non-engineer project lead using AI-assisted coding orchestrated through Paperclip, by delegating load-bearing security and correctness components to managed primitives and gating production launch on an external security audit.
11. Scale cleanly from the East Asia v1 (10 reps initial, 30 at scale) to the full group (200+ reps) without re-architecture.

### 2.2 Non-Goals (Explicitly Out of Scope for v1)

1. Building a public, multi-tenant, sellable CRM product. This is an internal tool for the group only; future M&A acquisitions migrate onto the same instance.
2. WhatsApp Business API integration. Communication tracking in v1 is via Slack and email only. WhatsApp may be added as v3 once the group has tested whether it is genuinely needed.
3. Marketing automation (drip campaigns, lead-nurturing sequences, ad-platform integrations). This is a sales CRM, not a marketing CRM.
4. Customer support / ticketing. Out of scope.
5. Quote-to-cash with electronic signature, contract management, or invoicing. The CRM tracks deals up to closure; finance and ops continue to use their existing tools downstream of CRM closure.
6. FX rate calculation. Sales records the deal in its own currency; FX conversion to entity reporting currency is an operations / finance problem, handled in their tools, not in the CRM.
7. A native iOS / Android app from scratch. The mobile experience is delivered as a PWA, optionally wrapped with Capacitor for App Store / Play Store distribution if the group decides that's needed.
8. AI features that send raw client communications to third-party APIs without an explicit per-account opt-in. Client confidentiality (RFPs, budgets, contract terms) takes precedence over AI feature richness.
9. A generic public REST API for arbitrary clients. Programmatic access in v1.5 is exclusively via the MCP server, which is the standard interface for AI agent tools and inherits the same RLS and audit guarantees as the web UI.

### 2.3 Explicit Trade-offs Made in This SOW

**Speed of build vs. ironclad correctness on day one.** The project lead is building solo with AI assistance and the group wants East Asia live ASAP. We have therefore designed the SOW around managed primitives, hard guardrails, and a mandatory external security review — rather than assuming a senior engineer will hand-write every load-bearing component. This trade-off is acknowledged and intentional.

**Pipedrive-class UX vs. Salesforce-class configurability.** The CRM ships with a tightly designed default workflow modelled on the group's actual operations (Qualify → Meet & Present → Propose → Negotiate → Verbal Agreement → Closed). Custom fields and per-entity approval workflows are configurable from an admin panel, but global pipeline structure changes are deliberately gated behind a careful migration flow.

**Single-region v1 vs. global low-latency from day one.** v1 deploys in a single Asia-Pacific region (likely `ap-south-1` / `asia-southeast1`) to minimise complexity. Multi-region read replicas are added in v2 once we have real-world latency telemetry from non-APAC users.

**MCP server in v1.5 vs. v1.** Building the MCP server as part of v1 would delay East Asia launch by 3–4 weeks and risks designing the API surface without real usage data. v1.5 lets us see which CRM operations reps actually want from their AI tools before we commit to an API contract. The cost of waiting is small — minor data-layer prep work in v1 (the `{ user, source }` parameter rule in `lib/data/`) makes the v1.5 retrofit mostly mechanical.

---

## 3. User Roles and Personas

Access is governed by a combination of (a) primary role, (b) entity / business unit membership, (c) reporting line in the org chart, and (d) per-opportunity team membership. The CRM admin panel allows the group to add or modify roles and permission layers without code changes.

### 3.1 Primary Roles

| Role | Typical user | What they can do |
|---|---|---|
| Sales Rep | Front-line sales (East Asia, India, MENA, EU, etc.) | Create / edit accounts, contacts, opportunities they own or are on the team for. See deals in their entity per visibility rules. Log calls, notes, emails. Generate P&L sheet on close. |
| Sales Manager | Team lead for a Sales Unit (e.g., East Asia, NG Spr Sales) | Everything Sales Rep can do, plus: visibility on all standard deals from their direct reports, approve / reject opportunities at configurable thresholds, edit team forecast assumptions. |
| Regional Head | Akshat for India, MP for international, etc. | Visibility on all standard deals in their region, approval rights on closure for deals above configurable size, edit regional pipeline assumptions, run regional reports. |
| Group Sales Lead | Akshat, Ekansh | Full pipeline visibility group-wide (standard + restricted). Final approver on closure for large or strategic deals. Administer global stage definitions and approval workflows. |
| Finance | Accounts team across entities | Read-only on opportunities at stage Verbal Agreement and beyond. Receive auto-generated P&L sheets. Edit FX rates (if FX feature is added later). Cannot edit deal data. |
| Ops | Project / event delivery teams | Read-only on opportunities at stage Verbal Agreement and beyond, scoped to their Ops Unit. Read access to associated Drive folders. Cannot edit deal data. |
| Admin | Project lead, IT | Full system administration: user management, role assignment, custom fields, approval workflows, integrations, AI provider config, spending caps. Cannot read Confidential deals by default — only metadata (existence, owner, value bucket). |
| Exec | CEO, CFO, board members | Read access to group-level dashboards. Configurable read access on Restricted deals (named on a per-deal basis). Read access on Confidential deals only if explicitly added. |
| External Partner (rare) | Trinity / MaxLevel users co-working a deal | Limited read access on specific opportunities they're invited to, scoped via OAuth domain allow-list. Cannot see anything outside deals they're explicitly added to. |

### 3.2 Visibility Tiers per Opportunity

Each Opportunity has a **visibility tier** set by the Owner (default: Standard). The number of tiers and their members are configurable from the Admin panel — the defaults below are starting points.

| Tier | Default visibility | Typical use |
|---|---|---|
| Standard (default) | Owner + Opportunity Team + their direct managers up the reporting chain + same-entity Sales Manager + Regional Head + Finance/Ops at stage ≥ Verbal Agreement + Group Sales Lead + Admin. | Vast majority of deals. |
| Restricted | Owner + named Opportunity Team only + Group Sales Lead + named exec list. Direct managers do NOT see it unless explicitly added. | Sensitive M&A-adjacent deals, deals where the rep's manager is conflicted, exec-level partnerships. |
| Confidential | Named individuals only. Admins see only metadata (deal exists, owner, value bucket) but not description / files / amount. | Very rare. Exec-only deals, board-level negotiations. |

Revenue split deals: when an Opportunity has a split (e.g., 60% NG Spr / 40% NG India), the Sales Manager of every contributing Sales Unit gets visibility on the deal at Standard tier, even if not explicitly on the Opportunity Team.

Override-able per Opportunity: the Owner (or higher) can manually add specific people to a Standard deal, or specific people only to a Restricted deal. Every such override is written to the audit log.

---

## 4. Data Model

The data model is designed around the actual operational reality reflected in the group's existing Project Budget Template and Salesforce schema, not a generic CRM template. Standard fields that are queried frequently (Stage, Amount, Currency, Close Date, Account, Owner) are stored as proper indexed columns. Custom fields (per Section 4.10) are stored in a JSONB column on each main entity, with a separate `field_definitions` table tracking which custom fields exist per entity type.

### 4.1 Entity

A legal entity within the group. Examples from the existing template: NG India, NG Spr, Unpause, PSH, Trinity, AFK, Branded, Nodwin Mena, Starladder, Comic Con. New entities are added by Admin without code changes.

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| name | text | e.g., "NG Spr" |
| legal_name | text | Full legal name for documents and P&L sheets |
| country | text (ISO) | Primary country of registration |
| base_currency | text (ISO 4217) | Reporting currency for this entity |
| fiscal_year_start_month | int (1–12) | 1 = Jan (calendar year), 4 = April (Indian FY) |
| active | boolean | Soft-disable when an entity is wound down |
| custom_data | jsonb | Custom fields per Section 4.10 |
| created_at, updated_at | timestamptz | Audit trail |

### 4.2 Business Unit

A unit within (or across) entities used for revenue recognition, ops attribution, and sales attribution. The existing template separates Main Expense Entity, Revenue Recognition Unit, Sales Unit, and Ops Unit. The CRM models all four as references to Business Unit, but only Sales Unit and Revenue Recognition Unit are exposed to sales reps; the others are set by Ops/Finance later.

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| name | text | e.g., "East Asia", "NG Spr", "Trimax", "Sages" |
| entity_id | uuid (FK Entity, nullable) | Some BUs span entities (e.g., "Global Sales") |
| kind | enum | sales \| revenue_recognition \| ops \| shared |
| parent_id | uuid (FK Business Unit, nullable) | Hierarchical BU tree |
| manager_user_id | uuid (FK User) | BU manager — receives visibility on standard deals |
| active | boolean | |
| custom_data | jsonb | |

### 4.3 User

Authenticated via Google OAuth, restricted to allow-listed domains (`nodwin.com`, `trinitygaming.in`, `maxlevel.gg`, and any future M&A acquisition domain added by Admin). User identity is managed by Supabase Auth; CRM-specific attributes live in a `public.users` table linked by Supabase user id.

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK, FK Supabase auth.users) | |
| email | text (unique) | Google OAuth identity |
| full_name | text | |
| primary_role | enum | sales_rep \| sales_manager \| regional_head \| group_sales_lead \| finance \| ops \| admin \| exec \| external_partner |
| primary_entity_id | uuid (FK Entity) | Home entity for fiscal year defaults, dashboards |
| primary_business_unit_id | uuid (FK Business Unit) | Home Sales Unit |
| manager_user_id | uuid (FK User, nullable) | Reporting line for visibility cascade |
| crm_inbound_email | text (unique) | Per-user token address, e.g., `orrin-a8f3k2@crm.nodwin.com` |
| ai_daily_soft_cap_usd | numeric(10,2) | Override of company default; null = use company default |
| ai_daily_hard_cap_usd | numeric(10,2) | Override of company default; null = use company default |
| active | boolean | |
| custom_data | jsonb | |

### 4.4 Account (Client / Company)

A client company. Supports a hierarchy: a single Account can have multiple parent / subsidiary / procurement-platform relationships. This is critical for clients like Tencent, where the procurement entity is shared across many subsidiaries the group sells into independently.

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| name | text | Display name |
| legal_name | text (nullable) | If different from display |
| website | text | |
| country | text (ISO) | |
| industry | text | Free text or enum (admin-configurable) |
| description | text (rich) | Markdown / lexical-formatted notes |
| account_owner_user_id | uuid (FK User) | Primary owner; team membership separate |
| email_domains | text[] | For inbound email matching, e.g., `["tencent.com", "tencentmusic.com"]` |
| custom_data | jsonb | |
| created_at, updated_at, created_by, updated_by | audit | |

#### 4.4.1 Account Relationships

A separate `account_relationships` table models the company-structure graph required for clients like Tencent.

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| from_account_id | uuid (FK Account) | The dependent account |
| to_account_id | uuid (FK Account) | The reference account |
| kind | enum | subsidiary_of \| procurement_via \| partner_with \| parent_of \| sister_company |
| notes | text | |

In the UI this surfaces as a company-tree visualisation on the Account detail page (collapsible tree with subsidiary / procurement / partner relationships). The AI search is aware of the tree, so a query like "all Tencent deals" returns deals across all related Tencent accounts.

### 4.5 Contact

A person at an Account. A contact can be associated with multiple accounts (e.g., a procurement officer who handles Tencent Music and Tencent Games separately), but has a primary account.

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| full_name | text | |
| primary_account_id | uuid (FK Account) | |
| title | text | Job title |
| email | text | |
| phone | text | |
| socials | jsonb | Stored as a flexible map: `{wechat: "...", linkedin: "..."}` |
| notes | text (rich) | |
| owner_user_id | uuid (FK User) | Primary internal owner of the relationship |
| custom_data | jsonb | |

A `contact_account_links` table models the many-to-many between contacts and accounts when the same person is relevant to multiple accounts.

### 4.6 Opportunity (Deal)

The core unit. Locked from the existing Salesforce schema for v1, with adjustments per the project lead's feedback. Custom fields are added via the admin panel (Section 4.10).

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| name | text | |
| account_id | uuid (FK Account) | |
| primary_contact_id | uuid (FK Contact, nullable) | |
| stage | enum | qualify \| meet_and_present \| propose \| negotiate \| verbal_agreement \| closed_won \| closed_lost |
| probability_pct | numeric(5,2) | Default per-stage; overridable on the deal |
| sales_initiator_user_id | uuid (FK User) | Who first sourced the lead; may differ from current Owner |
| owner_user_id | uuid (FK User) | Primary deal owner |
| sales_unit_id | uuid (FK Business Unit) | Primary Sales Unit (revenue split managed separately) |
| revenue_recognition_unit_id | uuid (FK Business Unit, nullable) | Set later, often at close |
| ops_unit_id | uuid (FK Business Unit, nullable) | Set on close |
| billing_entity_id | uuid (FK Entity, nullable) | Which entity invoices the client |
| amount | numeric(20,4) | Total deal value, in deal currency. Always Postgres numeric, never float. |
| currency | text (ISO 4217) | Includes admin-defined codes (e.g., USDT for USD-pegged stablecoin) |
| service_period_start | date | |
| service_period_end | date | |
| close_date | date | |
| execution_date | date (nullable) | Date the project actually executes — for revenue recognition |
| estimated_gross_margin_pct | numeric(5,2) | |
| country_execution | text (ISO) | Where the project is delivered |
| project_type | enum | ip \| white_label \| media_rights \| d2c_retail \| d2c_pins \| d2c_touring \| consulting_tech \| consulting_ideas \| talent_management \| pr_services \| other (admin-extensible) |
| revenue_category | enum | live \| content (admin-extensible) |
| recurring | boolean | Whether this is a recurring-revenue deal |
| recurring_split_kind | enum (nullable) | flat \| custom — flat divides amount evenly across months in service period |
| description | text (rich) | Markdown / lexical with link support |
| loss_reason | text (nullable) | Required if stage = closed_lost |
| visibility_tier | enum | standard \| restricted \| confidential |
| confidentiality_override_user_ids | uuid[] | Explicit allow-list overrides |
| legacy_salesforce_id | text (nullable) | Read-only post-migration; populated during import |
| custom_data | jsonb | |
| created_at, updated_at, created_by, updated_by | audit | |

#### 4.6.1 Opportunity Splits

A separate `opportunity_splits` table models revenue attribution split between multiple Sales Units (the case where an East Asia rep brings in a deal but credit / commission is shared with NG India who supported the pitch). Splits sum to 100%, enforced by a CHECK constraint.

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| opportunity_id | uuid (FK Opportunity) | |
| sales_unit_id | uuid (FK Business Unit) | The receiving Sales Unit |
| user_id | uuid (FK User, nullable) | Optional specific person within the unit |
| pct | numeric(5,2) | 0–100, splits per opportunity must sum to 100 |
| notes | text | e.g., "NG India contributed pitch deck and exec relationship" |

#### 4.6.2 Opportunity Team

A separate `opportunity_team_members` table models the cross-functional team on a deal (the Salesforce "Opportunity Team" concept). Distinct from `opportunity_splits` — split is about revenue attribution, team is about visibility and collaboration.

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| opportunity_id | uuid (FK Opportunity) | |
| user_id | uuid (FK User) | |
| role | enum | owner \| contributor \| viewer \| approver |
| added_by | uuid (FK User) | |
| added_at | timestamptz | |

#### 4.6.3 Stage History

Every stage transition is recorded in `opportunity_stage_history` with `from_stage`, `to_stage`, `changed_by`, `changed_at`, `time_in_previous_stage`, and a reason note. This drives the visual stage history (Pipedrive-style timeline) on the deal detail page and the conversion analytics on management dashboards.

### 4.7 Activities (Communications)

Calls, notes, emails, meetings, and tasks logged against an Account, Contact, or Opportunity (or any combination).

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| kind | enum | note \| call \| email_inbound \| email_outbound \| meeting \| task \| slack_message \| document_attached |
| subject | text | |
| body | text (rich) | For notes / call summaries / email body |
| happened_at | timestamptz | When the activity occurred (may differ from `created_at` if logged after the fact) |
| due_at | timestamptz (nullable) | For tasks |
| completed_at | timestamptz (nullable) | For tasks |
| duration_minutes | int (nullable) | For calls / meetings |
| account_id | uuid (FK Account, nullable) | |
| opportunity_id | uuid (FK Opportunity, nullable) | |
| contact_id | uuid (FK Contact, nullable) | |
| author_user_id | uuid (FK User) | |
| source | enum | web \| mcp \| webhook \| email_inbound \| system — see §8.5 |
| external_thread_id | text (nullable) | Gmail thread ID, Slack ts, etc., for dedupe |
| raw_payload | jsonb (nullable) | Original webhook payload for inbound items, for debugging |
| custom_data | jsonb | |

### 4.8 Documents

Documents are stored in Google Drive, not in Supabase Storage. The CRM creates a folder per Opportunity (and optionally per Account) and stores Drive file IDs / metadata. This means: (a) the IT team's existing Drive permissions infrastructure is reused, (b) versioning and collaboration features come for free, (c) if the CRM is ever shut down, the underlying documents remain accessible in Drive.

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| opportunity_id | uuid (FK Opportunity, nullable) | |
| account_id | uuid (FK Account, nullable) | |
| drive_file_id | text | Google Drive ID; canonical reference |
| drive_folder_id | text | Parent folder ID |
| name | text | Display name (synced from Drive) |
| mime_type | text | |
| category | enum | rfp \| budget \| proposal \| contract \| po \| invoice \| presentation \| other |
| uploaded_by | uuid (FK User) | |
| uploaded_at | timestamptz | |
| link_url | text (nullable) | If this is a description-link rather than an upload |

### 4.9 Approvals

Approvals are modelled as instances of an admin-defined `approval_workflow`. The default workflow shipped for East Asia matches the existing template (Akshat / Ekansh — Budget Approval and Closure Approval, two stages). Other regions get their own workflows defined by Admin, without code changes.

| Field | Type | Notes |
|---|---|---|
| `approval_workflows.id` | uuid (PK) | |
| `approval_workflows.name` | text | e.g., "East Asia Standard" |
| `approval_workflows.applies_to_entity_id` | uuid (FK Entity, nullable) | If null, applies group-wide as a fallback |
| `approval_workflows.trigger_stage` | enum | Stage at which the workflow triggers (e.g., budget approval triggers at meet_and_present, closure approval triggers at verbal_agreement) |
| `approval_workflows.enforce_gate` | boolean | If false: only records approvals (v1 default). If true: blocks stage advance until approved (admin can flip this without code changes) |
| `approval_steps.id` | uuid (PK) | |
| `approval_steps.workflow_id` | uuid (FK) | |
| `approval_steps.order` | int | |
| `approval_steps.name` | text | e.g., "Budget Approval", "Closure Approval" |
| `approval_steps.approver_user_ids` | uuid[] | Any one of these can approve, or all (sequential / parallel below) |
| `approval_steps.mode` | enum | any_one \| all_required |
| `approval_instances` | linked to opportunity_id, snapshot of workflow at trigger time, status (pending / approved / rejected / skipped), per-step audit log | |

> **Approval enforcement is admin-toggle, not a code change**
>
> Per the project lead's requirement, v1 ships with `enforce_gate = false` (workflows record approvals but don't block stage transitions; sales reps can advance the deal and the manager pokes the approver out-of-band). The data model and backend logic for `enforce_gate = true` are fully built in v1 — flipping it on per-workflow is a one-click admin action when the group is ready, not a redeployment.

### 4.10 Custom Fields

Custom fields are stored in a `custom_data jsonb` column on Account, Contact, Opportunity, and (optionally) Activity. A separate `field_definitions` table tracks the schema of custom fields per entity type.

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| entity_type | enum | account \| contact \| opportunity \| activity |
| key | text | JSONB key, e.g., "second_payment_terms". Snake_case enforced. |
| label | text | UI label, e.g., "Second Payment Terms" |
| data_type | enum | text \| rich_text \| number \| currency \| date \| datetime \| single_select \| multi_select \| user_ref \| account_ref \| boolean \| url \| formula |
| options | jsonb (nullable) | For select fields |
| required | boolean | |
| default_value | jsonb (nullable) | |
| visible_to_roles | enum[] | Which roles can see this field |
| editable_by_roles | enum[] | |
| visible_at_stages | enum[] (nullable) | If set, only show on opportunities at these stages |
| display_order | int | |
| active | boolean | Soft-delete; data preserved for historical accuracy |

Renaming or deleting a field with production data behind it requires a confirmation dialog and is recorded in the audit log. Soft-delete is the default; hard-delete with data purge is a separate, double-confirmation Admin action.

### 4.11 Audit Log

Full audit log on opportunities, accounts, contacts, opportunity_splits, opportunity_team_members, approval_instances, and document deletions. Each row records: `table_name`, `row_id`, `operation` (insert / update / delete), `changed_fields` (JSON diff), `actor_user_id`, `actor_source` (web / mcp / webhook / system), `actor_ip`, `actor_user_agent`, `occurred_at`.

Implemented via Postgres triggers writing to a single `audit_log` table (one table for all entities, indexed on `table_name + row_id + occurred_at`). Retention: indefinite for v1; configurable in v2 if storage becomes a concern.

### 4.12 AI Usage Log

Every AI call writes a row to `ai_usage` with: `user_id`, `provider` (claude / gemini / kimi / deepseek / ollama_local), `model`, `prompt_tokens`, `completion_tokens`, `cost_usd_estimate`, `feature` (search / summarise / draft_email / etc.), `request_id`, `started_at`, `finished_at`, `status`. This drives both the per-user / per-team / per-company spending caps (Section 7) and admin dashboards on AI cost.

### 4.13 MCP Sessions and Audit (v1.5)

When the MCP server is built in v1.5, it adds two tables:

`mcp_sessions` records each AI agent connection: `id`, `user_id`, `client_name` (e.g., "Claude Desktop", "NanoClaw", "Cursor"), `client_version`, `started_at`, `last_active_at`, `ip`. Used for rate limiting and admin visibility into which agents are connected on a rep's behalf.

`mcp_calls` records every MCP tool invocation: `id`, `session_id`, `tool_name` (e.g., "search_opportunities", "create_activity"), `arguments` (jsonb, redacted of any secret-like fields), `result_status` (success / error / rate_limited / unauthorised), `latency_ms`, `occurred_at`. Used for the AI agent dashboard and per-user / per-tool rate limiting.

Both tables have RLS: users see only their own sessions / calls; admin sees all.

---

## 5. Feature List

Features are categorised as Must-Have (v1, blocks East Asia launch), Should-Have (v1.5, ships within 8 weeks of v1), Nice-to-Have (v2+, considered after rollout to additional regions begins), or Out-of-Scope (deferred indefinitely).

### 5.1 Must-Have (v1)

1. Google OAuth login restricted to allow-listed group domains; admin can add new domains as M&A acquisitions occur.
2. Account list view + detail page: search, filter, sort, company-tree visualisation, related opportunities, related contacts, related activities, related Drive folder.
3. Contact list view + detail page: search, filter by account / owner, log activities directly from contact view.
4. Opportunity list view + kanban view (Pipedrive-style: columns = stages, cards = deals, drag-to-advance, deal count + value totals per column, hot-lead and overdue warning indicators on cards).
5. Opportunity detail page (Pipedrive-style side-panel or full-page): all fields per Section 4.6, stage progress bar at top, Notes / Activity / Call / Email / Files / Documents tabs, revenue split editor, opportunity team editor, stage history timeline, approval history.
6. Custom fields admin GUI: add / edit / archive custom fields per entity type, with all data_type options from Section 4.10.
7. Approval workflow admin GUI: define workflows per entity, define steps, assign approvers, toggle `enforce_gate` per workflow.
8. Document upload (creates Google Drive file in the per-opportunity Drive folder) + link-attach (paste a link, store as a Document record).
9. Per-salesperson unique inbound email address. Format: `firstname-{6char_token}@crm.nodwin.com`. Inbound emails are parsed (via Postmark Inbound), routed to the user's account, matched to the relevant Opportunity / Account by recipient domain (with manual reassignment fallback in the UI), and recorded as Activity records.
10. Outbound email composer: write an email from the CRM, sent via the user's connected Gmail account (OAuth, not via SMTP), automatically logged as an Activity.
11. Slack integration: bot posts deal updates to configurable channels (per-Sales-Unit channel, group-deals channel for closure announcements, etc.); slash command `/crm` to look up a deal / account / contact in-line; channel notifications when a deal is at risk or approval is pending.
12. Google Drive integration: per-opportunity folder, auto-shared per visibility tier, files surfaced in opportunity detail.
13. Google Calendar integration: meetings created from a deal show up on the rep's calendar with deal context in the description; calendar events involving CRM contacts get auto-suggested as Activities.
14. Auto-generation of the Project Budget P&L Google Sheet on `stage = closed_won`. Sheet is created in a configured Drive folder, prefilled from the CRM data, shared with Finance and the configured approver list, and a notification is sent to the appropriate channel.
15. AI search (semantic + keyword across Accounts, Contacts, Opportunities, Activities, Documents). Defaults to Claude / Gemini API; admin-configurable to switch providers without redeploy.
16. AI assistant features: summarise deal history, draft follow-up email, suggest next-best-action. All gated by per-user / per-team / per-company spending caps.
17. Dashboards: per-user (My Pipeline, My Activities, My Targets), per-team (Team Funnel, Team Leaderboard, Stuck Deals), per-management (Group Pipeline, Win Rate, Conversion by Stage, Revenue Forecast, Deals at Risk). Pipedrive-style widget layout with Recharts.
18. Salesforce migration tooling: import Accounts, Contacts, Opportunities (with stage / amount / close date / owner / description), preserve `legacy_salesforce_id`, idempotent (rerunnable without dupes), incremental (can run during parallel-run period to capture deltas).
19. Sandbox mode: admin-toggleable demo environment with seed data, isolated from production, for training new reps and demoing to other regions.
20. Audit log: viewable per-record by Admin, plus a global audit-log view filterable by user / table / date.
21. AI cost dashboard for Admin: per-user / per-team / per-company spend, per-provider breakdown, projected monthly cost vs cap, alerts at 80% of cap.
22. Mobile-responsive web UI (PWA) with the kanban, opportunity detail, contact, and activity-logging flows fully usable on mobile. Capacitor wrapper for App Store / Play Store distribution if requested by leadership.

### 5.2 Must-Have (v1.5) — MCP Server

The MCP (Model Context Protocol) server exposes CRM operations to AI agent clients. v1.5 begins after East Asia has been on parallel-run for 4+ weeks with no Critical/High security findings outstanding. Roughly 3–4 weeks of work.

1. **MCP server scaffold** running as a separate Node service (or as a Next.js API route) speaking the MCP protocol over HTTP/SSE.
2. **Authentication.** AI agent clients authenticate using the same Google OAuth flow as the web app, plus a separate per-client device-grant flow for headless tools. Tokens are scoped to the user; the agent acts as the user, never as a superuser.
3. **Read tools:** `search_accounts`, `search_contacts`, `search_opportunities`, `get_account`, `get_contact`, `get_opportunity`, `list_my_pipeline`, `list_my_activities`, `list_my_tasks`, `get_dashboard_summary`. All scoped by RLS to what the authenticated user can see.
4. **Write tools:** `create_note`, `create_task`, `create_call_log`, `create_meeting_log`, `update_contact`, `advance_opportunity_stage`, `add_team_member`. Every write is recorded with `source = 'mcp'` in the audit log and Activity tables.
5. **Confirmation gates.** Destructive or irreversible operations (closing a deal, assigning ownership to someone else, deleting an activity) require a confirmation tool call from the client — the AI agent first calls `request_confirmation`, the user explicitly approves, then the destructive call is permitted.
6. **Rate limits.** Per-user and per-tool, separate from web rate limits. Default: 60 read calls / minute, 20 write calls / minute. Configurable in admin panel.
7. **Audit and telemetry.** Every MCP call logged to `mcp_calls`. Per-user dashboard so reps can see their own AI agent activity. Admin dashboard so leadership can see aggregate usage and detect anomalies.
8. **Documentation and example clients.** Setup instructions for Claude Desktop, NanoClaw, Cursor, and Cowork. Sample shell scripts. The CRM does not bundle or distribute any of these tools — reps install them independently.
9. **Security review.** External security auditor reviews the MCP surface specifically before v1.5 goes live. Same auditor as the v1 audit if available; same scope as v1.

### 5.3 Should-Have (v2 candidates, evaluated after region rollout begins)

1. Inbound email auto-attachment improvements: AI-assisted matching when recipient domain alone is ambiguous (multiple opportunities at the same account).
2. Bulk operations on opportunity list (re-assign owner, advance stage, export CSV).
3. Saved views and shareable filters ("All deals in negotiation > $100K closing this quarter").
4. Configurable email templates with merge tags.
5. Export to CSV / Google Sheets for any list view.
6. Margin-at-risk dashboard (a deferred feature from discovery — see Section 12).
7. Multi-region read replicas for Supabase to reduce latency for India, MENA, EU users.
8. Advanced reporting: cohort analysis (deals by month-of-creation), pipeline velocity, individual-rep forecasting accuracy.
9. AI-generated weekly digest emails per user ("Here's what changed in your pipeline this week").
10. Group-level FX-converted P&L consolidation across entities (this is finance's job today; CRM may eventually surface a read-only view).
11. Two-way sync with Google Sheets (today's P&L sheet flows one-way out of CRM; a future two-way sync would let Finance edit actuals in Sheets and have them flow back into CRM).
12. Real-time collaborative editing on opportunity descriptions (currently single-edit-at-a-time with last-write-wins).
13. **MCP write-tool expansion.** v1.5 ships with a focused set of MCP write tools. v2 considers expanding based on usage data.

### 5.4 Explicitly Out-of-Scope

1. WhatsApp Business API integration.
2. Marketing automation, drip campaigns, lead-scoring.
3. Customer support / ticketing.
4. Quote-to-cash, e-signature, contract management, invoicing.
5. FX rate calculation.
6. Selling the CRM as a product to external customers.
7. AI-generated client-facing content without explicit human review.
8. A generic public REST API for arbitrary clients. (MCP in v1.5 is the only programmatic surface, and is scoped to AI agent tools.)

---

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

A pluggable AI client abstraction (a single TypeScript module: `lib/ai/router.ts`) exposes a unified completion / streaming / embeddings interface to the rest of the app. Underlying providers:

- Anthropic (Claude family) — primary for high-quality reasoning, drafting, summarisation
- Google (Gemini family) — alternative primary, can be A/B tested
- Moonshot (Kimi) — alternative provider
- DeepSeek — alternative provider, lower cost option
- Self-hosted Ollama — Llama 3.1 70B (or successor) running on a Nodwin-provisioned GPU VM, used as fallback when API providers are over-capacity, over-budget, or unavailable

Provider selection is determined by:

1. A per-feature provider preference (e.g., "deal summary" prefers Claude, "quick search" prefers Gemini)
2. A global admin override that can force all calls to a specific provider
3. Automatic fallback to Ollama when (a) the primary provider returns an error, (b) the request would exceed a per-user / per-team / per-company spending cap, or (c) admin has set a fallback flag for cost-saving mode

Every call writes to `ai_usage` (Section 4.12). Per-user / per-team / per-company hard caps are enforced **before** the call is made — a request that would put the user over their daily hard cap is rejected (or routed to Ollama if the feature supports it).

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

## 7. AI Cost Controls

AI is a non-trivial line item at 200+ users. The hard caps below are defaults for v1 — Admin can adjust each from the admin panel without redeploy. The architecture is the part that matters: hard caps enforced before the API call, multi-level (user / team / company) limits, real-time spend tracking, and circuit breakers at the provider dashboard level as well as the application level (defence in depth — a vibe-coded bug in the application can't blow past caps that are also set in the Anthropic / Gemini console).

### 7.1 Default Caps

| Limit | Soft (warning) | Hard (block) | Notes |
|---|---|---|---|
| Per-user per-day | $3 | $5 | Soft warns the user via toast and degrades to Ollama where possible. Hard blocks AI features for that user until next UTC day or admin override. |
| Per-team per-day | $30 (10 users) | $50 (10 users) | Scales linearly with team size. Configurable per team. |
| Per-company per-day | $300 | $500 | Across all entities. Aggressive ceiling vs Salesforce $33K/mo equivalent. |
| Per-request token cap | — | 8K input, 4K output | Prevents runaway prompts. Long-document summarisation uses chunked workflows that stay under per-request cap. |
| Per-user per-month | $60 | $100 | Backstop in case daily limits aren't hit but accumulated spend is high. |
| Per-MCP-session call rate | 60 read / min | 20 write / min | Separate from web rate limits. Configurable in admin. |

### 7.2 Alerts

- 80% of any cap → alert via Slack to `#crm-alerts` admin channel
- 100% of company hard cap → page Admin (PagerDuty or equivalent), AI features globally degrade to Ollama until next UTC day or admin lifts the cap
- Anomalous spend velocity (e.g., one user generating $20 of AI usage in 10 minutes) → immediate Slack alert and that user is rate-limited to 1 request/min until reviewed
- Anomalous MCP call velocity (a single MCP session making 1,000+ calls in an hour) → immediate Slack alert and session lockout

### 7.3 Defence-in-depth at provider dashboards

In addition to application-level caps, the following must be configured at the provider dashboard level:

- Anthropic console: organisation spend cap = $1,000/day initially, alert at $500/day
- Gemini / Google AI Studio: equivalent quota and budget alert
- Whatever provider is used: the lowest budget cap the provider's dashboard supports

This way, even if the application-level caps fail (vibe-coded bug, race condition, mis-configured environment variable), the provider itself enforces a hard ceiling.

---

## 8. Security Architecture

This system holds RFPs, client contact lists, deal values, contract terms, and revenue figures across the Nodwin Group. A security incident here is materially worse than a typical vibe-coded SaaS app failure. The architecture below treats security as a first-class deliverable, not an afterthought.

### 8.1 Threat Model

The realistic threats this system must defend against, in rough order of likelihood:

1. Mis-configured Row-Level Security (RLS) policies leaking deal data across users / entities / regions. (Per the project's reference Reddit post: 89% of audited vibe-coded Supabase apps had at least one wrong RLS policy.)
2. A leaked or guessed inbound CRM email address being used to inject forged "communications" into an account.
3. API key leakage (a developer commits an API key to GitHub, an external site is compromised) leading to unbounded AI cost or data exfiltration.
4. Webhook endpoints (Slack, Postmark, Drive change notifications) accepting forged events without signature verification.
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
| [BLOCKER] All RLS policies have automated tests passing | At least three personas tested, including denial cases |
| [BLOCKER] All public tables have RLS enabled | `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'` → all rowsecurity = true |
| [BLOCKER] Default-permissive RLS policies removed | `SELECT tablename, policyname, qual FROM pg_policies WHERE schemaname = 'public' AND qual ~ 'true'` → reviewed by hand, none remaining |
| [BLOCKER] Webhook endpoints verify signatures | Tested by sending a forged webhook and confirming rejection |
| [BLOCKER] Inbound email pipeline rejects spoofed sender | Tested by sending email from a spoofed From address to a known inbound token |
| [BLOCKER] AI provider spending caps configured at provider dashboard | Anthropic console + Gemini quota set |
| [BLOCKER] Application-level AI caps tested | Set a $1 per-user cap, confirm 11th request rejects |
| [BLOCKER] Rate limiting on `/api/ai/*` endpoints | Tested with a script firing 100 requests/sec; confirms 429s |
| [BLOCKER] External security review completed | One senior security freelancer reviewed RLS, webhook handlers, inbound email parser. Findings remediated. |
| [BLOCKER] Secrets rotated before going live | All API keys / OAuth client secrets / webhook signing secrets generated specifically for production, not dev / staging |
| No floats in money fields (lint rule) | ESLint rule banning `Number` for fields named amount, cost, revenue, etc.; CI green |
| Audit log writes confirmed for all critical entities | Spot-test: change owner of an opportunity, confirm audit row created |
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

---

## 9. AGENTS.md and Vibe-Coding Guardrails

Per the project's reference document on vibe-coding failure modes, an `AGENTS.md` file at the repo root is required. The agent (Claude / Cursor / similar) reads this file at the start of every session. The file pins the architecture decisions, file boundaries, and forbidden patterns so the agent does not drift over time.

### 9.1 AGENTS.md — Required Sections

1. **Project overview** — one paragraph describing what the system is and isn't
2. **Stack** — Next.js, Supabase, shadcn, Tailwind, exact versions
3. **Folder structure** — what lives where
4. **Forbidden patterns** — explicit list, see below
5. **Required patterns** — explicit list, see below
6. **Files the agent must not modify without flagging** — see below
7. **Test policy** — when to write tests, what tests to write
8. **How to handle ambiguity** — "if you are not sure, ask the user — do not invent"

### 9.2 Forbidden Patterns

AGENTS.md will explicitly forbid:

- `Number` or `parseFloat` for any monetary value. Use `dinero.js` or Postgres `numeric`.
- Hand-rolling webhook signature verification. Always import from the provider SDK.
- Writing SQL inline in app code. All writes go through Supabase typed clients or Postgres RPC functions defined in `supabase/migrations/`.
- Disabling RLS, even temporarily, in production migrations.
- Storing API keys, OAuth secrets, or webhook signing keys anywhere except environment variables.
- Generating placeholder credentials, fake user data, or mock responses in production code paths. Test data lives in `seeds/` and is only loaded into the sandbox environment.
- Using the Supabase service-role key from client-side code. Service-role is server-side only.
- Calling AI providers directly from client-side code. All AI calls go through `/api/ai/*` routes that enforce caps and log usage.
- Calling functions in `lib/data/` without an explicit `{ user, source }` context parameter.
- Modifying files in `lib/security/`, `lib/money.ts`, `supabase/migrations/`, or (in v1.5) `lib/mcp/` without flagging the change explicitly in the response.

### 9.3 Required Patterns

- **Commit before every agent session.** The agent reads recent commits to orient itself.
- **Plan in chat mode before agent mode.** Per the reference document, plan with a non-coding LLM mode first, then have the agent execute the plan.
- **Scope prompts to specific files when the codebase grows.** "Modify `components/PipelineKanban.tsx` — do not touch anything else" — past ~80 components, agent context drift is real.
- **Every PR has tests for the changed behaviour.** The agent writes the tests as part of the same change.
- **Every webhook handler's first line is signature verification.** If signature verification is removed, refactored, or skipped, the change is flagged in the PR description.
- **All money operations go through `lib/money.ts`.**
- **Every function in `lib/data/` accepts `{ user, source }` and forwards to audit logging.** Required from v1 day one to make v1.5 MCP retrofit mechanical.

### 9.4 Files Not to Modify Without Flagging

- `supabase/migrations/*`
- `supabase/policies/*`
- `lib/security/*`
- `lib/money.ts`
- `lib/ai/router.ts`
- `lib/webhooks/*`
- `lib/email/inbound.ts`
- `lib/data/*` (the typed Supabase access layer — changes here affect every feature)
- `lib/mcp/*` (added in v1.5)
- `AGENTS.md`
- `.env.example`

### 9.5 CI / Pre-Commit Hooks

In addition to AGENTS.md (which is a soft constraint — it depends on the agent following it), the following are hard constraints enforced by CI:

1. ESLint rule banning `Number` / `parseFloat` / `parseInt` for variables matching `/amount|cost|revenue|margin|price|fee/i`
2. ESLint rule banning direct `fetch()` to `*.anthropic.com`, `*.googleapis.com`, `openai.com` from anywhere except `lib/ai/router.ts`
3. ESLint rule requiring `{ user, source }` parameter in any function declared in `lib/data/`
4. RLS policy test runner: every policy in `supabase/policies/` has a corresponding `.test.sql` file. CI fails if any policy lacks tests or any test fails.
5. Pre-commit hook scanning for committed secrets (gitleaks or truffleHog)
6. CI step that runs the full RLS policy test suite against a freshly migrated Postgres instance
7. CI step that boots the app and exercises the inbound-email pipeline against a known-forged email and confirms it's rejected

---

## 10. Migration Plan

### 10.1 Phases

| Phase | Duration | What happens |
|---|---|---|
| Discovery & SOW sign-off | 1 week | This document reviewed and approved by Akshat, Mickael, Abhishek, project lead. Final scope locked. |
| Foundation | 2-3 weeks | Supabase project, Next.js skeleton, auth, base data model, RLS template, AGENTS.md, CI, deployment pipeline (Vercel + Railway alternative), staging environment. |
| Core CRM | 3-4 weeks | Accounts, contacts, opportunities (full data model per Section 4), kanban + list views, opportunity detail, custom fields admin GUI, document upload to Drive, Drive folder auto-creation and permission sync. |
| Integrations | 3 weeks | Gmail / Calendar OAuth, Slack app, inbound email pipeline (Postmark Inbound), AI router with multi-provider support, AI usage logging and cap enforcement. |
| P&L + approvals | 2 weeks | Project Budget Sheet auto-generation, approval workflow admin GUI, approval Slack interactivity. |
| Dashboards | 2 weeks | Per-user / per-team / per-management dashboards, Pipedrive-style funnel, conversion, revenue forecast, deals at risk widgets. |
| Migration tooling + sandbox + UAT | 2 weeks | Salesforce import scripts (idempotent, incremental), sandbox seeding, East Asia team UAT (with real users running through real workflows). |
| Security audit + hardening + parallel-run prep | 2 weeks | External security review of RLS / webhooks / inbound email parser, remediation, pre-launch checklist (Section 8.4) executed and signed off. |
| **East Asia goes live with parallel SF run** | — | East Asia team uses both CRM and Salesforce; CRM is source of truth, daily SF export goes to Finance for confidence-building. |
| Parallel run | 4-8 weeks | Two-way confidence-building. CRM stable. SF export feed continues for Finance. |
| **East Asia full cutover** | — | Salesforce read-only for East Asia; new deals only in CRM. |
| **v1.5: MCP server build** | 3-4 weeks | After 4+ weeks of East Asia stability with no Critical/High security findings outstanding. MCP server, tool surface, confirmation patterns, security review of MCP surface. |
| **v1.5: MCP server goes live** | — | Available to East Asia reps as opt-in. Documentation for Claude Desktop, NanoClaw, Cursor, Cowork setup. |
| Other regions | 6-8 weeks each | India, MENA, EU, JPKR, Americas. Each region: localised approval workflow, FY calendar, parallel-run, cutover. MCP server already available. |

### 10.2 Salesforce Data Import

Migration tool reads Salesforce data via the SF API (or via Salesforce export CSVs as a fallback) and writes to the CRM via authenticated admin APIs. The tool is:

- **Idempotent.** Run it ten times, get the same result. Uses Salesforce IDs as deterministic keys; existing records are upserted, not duplicated.
- **Incremental.** Can run during the parallel-run period to capture deltas (new opportunities created in SF after the initial bulk import).
- **Field-mapped.** Each Salesforce field maps to a CRM field (or a custom field if no native equivalent). Mapping is stored in `migration/sf_field_map.yaml` and reviewed by the project lead and a sales rep before bulk import.
- **Audited.** Every imported record carries a `legacy_salesforce_id` so any data discrepancy can be traced back to the source.
- **Selective by entity.** Initial import is East Asia opportunities, accounts, contacts only. Other entities import on their own rollout schedule.

### 10.3 Parallel Run Operating Model

During parallel run for any region:

1. CRM is the system of record. Sales reps log all new activity in CRM.
2. A daily export from CRM is generated automatically in the format Finance currently consumes from Salesforce, as a Google Sheet in a Finance-shared folder. This continues until 4 weeks after cutover.
3. If a sales rep logs something in Salesforce by mistake during parallel run, a weekly reconciliation script identifies the discrepancy and flags it to the rep + their manager.
4. Salesforce becomes read-only for the region at end of parallel-run. Reps lose write access; historical reads continue for an additional 12 months.
5. After 12 months read-only in Salesforce post-cutover, Salesforce subscription is reduced or terminated for the region.

---

## 11. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| RLS policy bug leaks deal data across users / entities | Medium | Catastrophic | Materialised `opportunity_visibility` table. RLS test suite mandatory in CI. External security audit before launch. Defence-in-depth: even with RLS bug, unauthorised user shouldn't be able to read deals because of the visibility-table architecture. |
| AI cost runaway from compromised API key or runaway prompt | Medium | High ($-thousands) | Per-user / per-team / per-company hard caps in app. Provider-dashboard caps as backstop. Anomaly alerts. Rate limits per endpoint. |
| Vibe-coded code drifts over time, agent breaks working features | High | Medium-High | AGENTS.md, scoped prompts, commit-before-every-session, plan-in-chat-before-agent-mode. Tests on critical paths. Project lead reviews every change before merge. |
| Inbound email parser allows forged communications | Low (with mitigations) / Medium (without) | High (data integrity) | Postmark Inbound DKIM verification + sender match + dead-letter table + unit tests for forgery / replay / spoofing. Component is NOT vibe-coded. |
| Salesforce migration produces wrong / missing data | Medium | High (sales rep distrust → low adoption) | Idempotent + incremental import. Manual review of 10 representative records before bulk import. Parallel run with daily reconciliation. Audit trail via `legacy_salesforce_id`. |
| Project lead becomes unavailable mid-build (illness, attrition, competing priorities) | Medium | High | Excellent README, AGENTS.md, code comments. Avoid bus-factor of 1 by having documented architecture and someone else (engineering team member, even part-time) able to read and run the codebase. Codebase hosted in Nodwin's GitHub org, not personal. |
| P&L sheet generation has off-by-one or currency bug producing wrong numbers | Medium (without mitigations) | High (financial reporting) | `dinero.js` for all money math. Reconciliation against canonical template. Spot-check first 20 generated sheets manually. Finance signs off on a known-good test case before going live. |
| Slack / Drive / Gmail API quotas exceeded at scale | Low (initially) / Medium (at 200+ users) | Medium (degraded UX) | Background jobs (Inngest) with retry + backoff. Quota monitoring alerts. Service account pool for high-volume operations. Cache where possible. |
| Sales reps reject the new tool and revert to spreadsheets | Medium | High (project failure mode) | Pipedrive-class UX, not Salesforce-class UX. East Asia UAT with real users early. Onboarding training (drip emails per the reference doc, day 0 / 2 / 7). Visible exec sponsorship. |
| GDPR / DPDP / regional data privacy non-compliance | Medium | High (regulatory) | Data export per user, data deletion on offboarding, retention policies, audit log, region-appropriate hosting (consider EU read replicas in v2 if needed). |
| External security audit finds critical issue late in build | Medium | Medium | Engage auditor at 75% completion, not 95%. Build remediation time into the timeline. |
| Provider lock-in (Supabase / Postmark / Slack / Google) creates exit risk | Low | Medium | Standard Postgres schema (Supabase is just hosted Postgres). Drive folders are user-owned (not deleted if CRM goes away). Webhook contracts standard. Minimum lock-in by design. |
| **(v1.5) Compromised MCP token allows AI agent to read or modify CRM data** | Low-Medium | Medium-High | Confirmation gate on destructive operations. Per-user revocation from admin panel. Anomaly alerts on unusual MCP call patterns. MCP-specific rate limiting. Auditor reviews MCP surface before v1.5 ships. |
| **(v1.5) AI agent client misinterprets user intent and creates bad data** | Medium | Low-Medium | Confirmation gate on destructive operations. Audit log makes corrections easy. Reps can revoke MCP access at any time. Recoverable failure mode. |

---

## 12. Open Questions and Deferred Decisions

Items the project lead has flagged as needing more thought before final lock-in. None of these block the start of v1 build, but each should be resolved before the corresponding feature is built.

1. **Margin-at-risk dashboard.** Concept: surface opportunities where Variance Out is trending negative or where actuals are diverging from planned (per the existing Project Budget Template's variance rows). Decision: include in v2, decide design once we have real production data flowing.
2. **Drive permissions multi-layer detail.** The default three-tier model (Standard / Restricted / Confidential) plus org-chart-cascading visibility ships in v1. Admin can adjust the layers in the admin panel. Project lead has flagged that more layers may be needed once the multi-region rollout begins; revisit after East Asia is stable.
3. **Custom-amount recurring revenue split.** v1 ships flat-split recurring revenue only. Custom-per-month split deferred until a real deal needs it.
4. **Sandbox refresh cadence.** How often does sandbox data reset / refresh from production seed? Defaults to admin-triggered manual reset; automatic monthly reset can be added if useful.
5. **Mobile distribution.** Decide whether to publish the Capacitor-wrapped app to iOS App Store / Google Play, or leave it as a PWA installable from the browser. Decision deferred to East Asia UAT feedback.
6. **AI feature opt-in granularity.** Per-account opt-in to AI for sensitive client data: should the default be opt-in or opt-out? Default to opt-out for clients flagged "Confidential", opt-in for everyone else, and let Admin shift the default.
7. **WhatsApp integration timing.** Out of scope for v1. Revisit after India region rollout, when usage data shows whether reps are losing too many activities to WhatsApp-only conversations.
8. **MCP write tool surface expansion.** v1.5 ships with a focused list (Section 5.2). Decide post-launch which additional write tools to add based on real usage patterns from reps using Claude Desktop / NanoClaw / Cursor.

---

## 13. Acceptance Criteria for v1 Launch

East Asia goes live with parallel SF run only when ALL of the following are true:

1. All [BLOCKER] items in the Pre-Launch Security Checklist (Section 8.4) are complete and signed off
2. All Must-Have features (Section 5.1) are functional in staging and have passed manual UAT by at least 3 East Asia sales reps
3. Salesforce migration tooling has successfully imported all current East Asia opportunities, accounts, and contacts; spot-check of 10 records shows full fidelity
4. External security review is complete; all findings are remediated; auditor signs off in writing
5. AI cost cap enforcement has been verified end-to-end (synthetic test: set $1 cap, confirm 11th request rejects)
6. P&L Google Sheet generation has been verified for at least 5 representative deal types (IP, White Label, Media Rights, Consulting, Recurring) and Finance has signed off on the output format
7. Slack integration has been verified in the Nodwin Slack workspace, including approval interactivity
8. Inbound email pipeline has been verified for at least 3 users sending real CC'd emails to their unique inbound addresses, with correct routing to Account / Opportunity
9. Drive folder permission sync has been verified for all three visibility tiers with at least one example each
10. Audit log is recording all critical operations as verified by spot-checks on at least 20 sample changes
11. Backup and restore has been tested end-to-end in staging — restoring from backup recovers all data correctly
12. AGENTS.md is up to date with the as-built architecture
13. Sandbox environment is provisioned, seeded, and demonstrably isolated from production
14. On-call / incident-response documentation is published and the on-call person knows where it is
15. East Asia regional head and group sales lead have explicitly approved go-live in writing (email or Slack message in writing, archived)

### 13.1 Acceptance Criteria for v1.5 (MCP Server) Launch

v1.5 goes live only when ALL of the following are true:

1. All [BLOCKER] items in the v1.5 MCP-specific checklist (Section 8.4) are complete and signed off
2. MCP read tools have been verified by the project lead using at least two different clients (e.g., Claude Desktop and NanoClaw)
3. MCP write tools have been verified, including the confirmation gate behaviour for destructive operations
4. Rate limiting verified end-to-end (synthetic test: hit limits, confirm 429s, confirm session lockout on anomalous velocity)
5. Per-user token revocation tested
6. External security auditor has reviewed the MCP surface and signed off
7. Documentation published for at least Claude Desktop, NanoClaw, Cursor, Cowork
8. East Asia has had at least 4 weeks of stable v1 production usage with no Critical or High security findings outstanding
9. East Asia regional head has explicitly approved v1.5 go-live in writing

---

## 14. Sign-off

By signing below, the named parties confirm they have read this document and agree it represents the current scope of work for v1 of the Nodwin Group CRM, with the understanding that:

1. v1 covers East Asia rollout only, with subsequent regions on the schedule described in Section 10.
2. v1.5 covers the MCP server addition, beginning ~4-6 weeks after East Asia goes live, taking ~3-4 weeks.
3. The build approach is AI-assisted ("vibe") coding by the project lead, orchestrated through Paperclip, with managed primitives and external security audits as documented in Sections 8 and 9.
4. The timeline is approximate and may slip ±20% depending on issues found during build / UAT / audit.
5. Material scope changes after sign-off are tracked in `CHANGELOG.md` and acknowledged by all signatories.

| Name | Role | Date | Signature |
|---|---|---|---|
| Akshat Rathee | Group Sales Lead, Nodwin Gaming | | |
| Mickael Piantchenko | Operations / Finance perspective, Nodwin Gaming | | |
| Abhishek Aggarwal | CEO, Trinity Gaming India | | |
| Orrin Xu | Project Lead, CRM Build | | |

---

*End of Scope of Work · Version 1.1 · 4 May 2026*

*Changelog: v1.1 added MCP server (Phase 9.5 / v1.5) covering programmatic access for AI agent clients (Claude Desktop, NanoClaw, Cursor, Cowork). Added §4.13 (MCP sessions and audit), §5.2 (MCP must-haves), §6.8 (MCP architecture), §8.5 (data-layer source parameter prep work), §13.1 (v1.5 acceptance criteria). v1.0 baseline preserved otherwise.*
