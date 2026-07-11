# Data Model

> Extracted from the [Scope of Work](SOW.md) (§4).
> 
> This document describes every table and field in the Nodwin CRM data model. Each section covers one core entity with field-level documentation.

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
| primary_role | enum | sales_rep \| sales_manager \| regional_head \| group_sales_lead \| finance \| ops \| admin \| exec \| external_partner \| entity_admin |
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

#### 4.4.2 Tax Identifiers (ORR-622)

Tax IDs are a **child table** `account_tax_ids (id, account_id FK→Account ON DELETE CASCADE, tax_type FK→tax_id_types.code, value, audit)`, UNIQUE `(account_id, tax_type, value)`, replacing the earlier `tax_*` custom fields in `custom_data` (backfilled). An account may hold multiple tax IDs. **RLS mirrors the parent account** (admin OR owner OR creator); audit-logged.

`tax_id_types (code PK, label, country_iso, format_regex, display_order, active)` is a seeded reference table (read-all, admin-write) that drives the country→type mapping on the Account form and per-type validation. **Country is required** on the form (drives the mapping). Admin CRUD UI for tax types is deferred; seeded labels/formats are provisional pending Finance sign-off.

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
| owner_user_id | uuid (FK User) | Primary deal owner. Defaults to `auth.uid()` on insert via trigger. |
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
| account_id | uuid (FK Account, nullable) | Nullable so unassigned inbound activities can be created when no account domain matches (ON DELETE CASCADE) |
| opportunity_id | uuid (FK Opportunity, nullable) | ON DELETE SET NULL |
| contact_id | uuid (FK Contact, nullable) | Optional; log an activity against a specific contact. ON DELETE SET NULL |
| user_id | uuid (FK User) NOT NULL | Author of the activity (ON DELETE CASCADE) |
| type | text | Free text, **not** an enum — values in use include `note`, `call`, `email_inbound`, `stage_change` |
| external_thread_id | text (nullable) | Gmail thread ID, Slack ts, etc., for dedupe |
| subject | text (nullable) | |
| body | text (nullable) | For notes / call summaries / email body |
| metadata | jsonb (NOT NULL, default `{}`) | Free-form per-activity metadata (e.g., original inbound payload details) |
| created_at, updated_at, created_by, updated_by | audit | Set by the `set_activity_audit_fields` trigger |

### 4.8 Documents

As of ORR-653 (`20260710000000_document_storage.sql`), documents are stored **server-side in Supabase Storage** — file bytes live on the VPS in a private `documents` bucket, not only referenced in Google Drive. Google Drive file IDs are now **optional** and are populated only for files imported from Drive (via the client-side Picker → Storage import, Section 6.5.1); direct uploads carry no Drive provenance at all. A CHECK constraint (`documents_source_check`) requires every row to have a source: either `drive_file_id` **or** `storage_path`.

Storage RLS delegates to each document row's own visibility (a Storage object is reachable only if a visible `documents` row references its path), so the Confidential-tier admin masking (Section 8.3) is inherited for free and cannot drift. Bytes are served to the app via server-generated signed URLs.

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| opportunity_id | uuid (FK Opportunity, nullable) | |
| account_id | uuid (FK Account, nullable) | |
| drive_file_id | text (nullable) | Google Drive ID; set only for Drive-imported files (made nullable in ORR-653) |
| drive_folder_id | text (nullable) | Parent Drive folder ID; nullable (ORR-653) |
| storage_path | text (nullable) | Path of the file inside the private `documents` Storage bucket (unique); set for server-stored uploads |
| size_bytes | bigint (nullable) | Size of the stored file |
| name | text | Display name |
| mime_type | text | |
| category | enum | rfp \| budget \| proposal \| contract \| po \| invoice \| presentation \| brand_guidelines \| logo_assets \| rate_card \| other |
| uploaded_by | uuid (FK User) | Uploader; may manage (update/delete) their own file |
| uploaded_at | timestamptz | |
| link_url | text (nullable) | If this is a description-link rather than an upload |

### 4.9 Approvals

Approvals are modelled as instances of an admin-defined `approval_workflow`. The default workflow shipped for East Asia matches the existing template (Akshat / Ekansh — Budget Approval and Closure Approval, two stages). Other regions get their own workflows defined by Admin, without code changes.

The approval schema is split into a **template layer** (the reusable workflow definition and its ordered step chain) and a **runtime layer** (a per-opportunity instance and its steps, snapshotted at trigger time), plus a per-entity **thresholds** table that drives when an approval is required.

**`approval_workflows`** — the workflow template.

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| name | text | e.g., "East Asia Standard" |
| description | text (nullable) | |
| entity_type | text | The object the workflow governs (e.g., `opportunity`) |
| applies_to_entity_id | uuid (FK Entity, nullable) | If null, applies group-wide as a fallback (added 20260704000000) |
| trigger_stage | enum `deal_stage` (nullable) | Stage at which the workflow triggers (e.g., budget approval at `meet_and_present`, closure at `verbal_agreement`) |
| enforce_gate | boolean (default false) | If false: only records approvals (v1 default). If true: blocks stage advance until approved (admin can flip without code changes) |
| created_at, updated_at, created_by, updated_by | audit | |

**`approval_workflow_steps`** — the step **template** (the ordered chain) belonging to a workflow (added 20260703340000; extended 20260704000000).

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| workflow_id | uuid (FK approval_workflows, ON DELETE CASCADE) | UNIQUE `(workflow_id, step_order)` |
| step_order | int | |
| approver_role | enum `user_role` (nullable) | Role-based approver |
| approver_user_id | uuid (FK User, nullable) | Single named approver |
| name | text (nullable) | e.g., "Budget Approval", "Closure Approval" |
| approver_user_ids | uuid[] (nullable) | Multiple approvers; combined with `mode` |
| mode | enum `approval_step_mode` (default `all_required`) | any_one \| all_required |
| created_at, updated_at, created_by, updated_by | audit | CHECK: an `approver_role`, `approver_user_id`, or non-empty `approver_user_ids` must be present |

**`approval_instances`** — one runtime instance per triggered approval.

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| workflow_id | uuid (FK approval_workflows, ON DELETE RESTRICT) | |
| entity_type | text | |
| entity_id | uuid | The governed row |
| opportunity_id | uuid (FK Opportunity, nullable) | Convenience link (added 20260704000000) |
| workflow_snapshot | jsonb (nullable) | Snapshot of the workflow + steps at trigger time |
| trigger_stage | enum `deal_stage` (nullable) | Stage that triggered this instance |
| status | enum `approval_status` (default `pending`) | pending / approved / rejected / etc. |
| triggered_by_user_id | uuid (FK User, nullable) | |
| created_at, updated_at, created_by, updated_by | audit | |

**`approval_steps`** — the per-**instance** runtime steps (materialised from the template at trigger time).

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| instance_id | uuid (FK approval_instances, ON DELETE CASCADE) | |
| step_order | int | Unique per instance (enforced by trigger) |
| approver_role | enum `user_role` (nullable) | |
| approver_user_id | uuid (FK User, nullable) | |
| approver_user_ids | uuid[] (nullable) | Multiple approvers (added 20260704000000) |
| mode | enum `approval_step_mode` (default `all_required`) | any_one \| all_required |
| status | enum `approval_step_status` (default `pending`) | |
| due_by | timestamptz (nullable) | |
| created_at, updated_at | audit | |

**`approval_decisions`** — the decision(s) recorded against each runtime step (the per-step audit log).

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| step_id | uuid (FK approval_steps, ON DELETE CASCADE) | |
| decided_by_user_id | uuid (FK User) | |
| decision | enum `approval_decision_type` | |
| comment | text (nullable) | |
| created_at | timestamptz | |

**`approval_thresholds`** — per-entity rules that determine when an approval is required (added 20260618000002).

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| entity_id | uuid (FK Entity, ON DELETE CASCADE) | |
| deal_value_threshold | numeric(20,4) (nullable) | Approval required above this deal value |
| discount_threshold_pct | numeric(5,2) (nullable) | Approval required above this discount |
| confidential_tier_required | text (nullable) | |
| approver_role | text | Role required to approve |
| created_at, updated_at | audit | |

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

Every AI call writes a row to `ai_usage` with: `user_id`, `provider` (claude / gemini / kimi / deepseek / ollama_local / openai_compatible), `model`, `prompt_tokens`, `completion_tokens`, `cost_amount numeric(20,4)` + `cost_currency text` (default `USD`), `feature` (search / summarise / draft_email / etc.), `request_id`, `started_at`, `finished_at`, `status`. This drives both the per-user / per-team / per-company spending caps (Section 7) and admin dashboards on AI cost.

### 4.13 MCP Sessions and Audit (v1.5)

When the MCP server is built in v1.5, it adds two tables:

`mcp_sessions` records each AI agent connection: `id`, `user_id`, `client_name` (e.g., "Claude Desktop", "NanoClaw", "Cursor"), `client_version`, `started_at`, `last_active_at`, `ip`. Used for rate limiting and admin visibility into which agents are connected on a rep's behalf.

`mcp_calls` records every MCP tool invocation: `id`, `session_id`, `tool_name` (e.g., "search_opportunities", "create_activity"), `arguments` (jsonb, redacted of any secret-like fields), `result_status` (success / error / rate_limited / unauthorised), `latency_ms`, `occurred_at`. Used for the AI agent dashboard and per-user / per-tool rate limiting.

Both tables have RLS: users see only their own sessions / calls; admin sees all.

### 4.14 Supporting tables (not covered here)

This document is scoped to the core entities. The schema also includes a number of significant supporting tables created by later migrations that are not detailed above:

- `opportunity_visibility` — materialised per-user visibility rows driving deal RLS (recomputed by trigger).
- `opportunity_revenue_schedule` — recurring-revenue month-by-month schedule rows.
- `currencies` / `fx_rates` — currency reference data and FX conversion rates for reporting-currency roll-ups.
- `document_chunks` — pgvector embeddings backing the knowledge-search / RAG stack (ORR-620/621).
- `inbound_email_deadletter` — dead-letter table for inbound emails that fail matching or sender verification.
- `user_notifications` / `user_notification_overrides` / `notification_routing` — in-app notification delivery and per-user channel routing.
- `ai_daily_caps` / `ai_settings` / `ai_providers` — AI spending caps and admin-configured AI provider settings.
- `cashflow_milestone` — planned cash events per opportunity (`direction` in = client receipts / out = vendor payouts), with `label`, `scheduled_month`, `amount`, `currency`; source for the working-capital derivation. Parent-opportunity RLS with the Confidential-tier fence (`20260711020000_cashflow_milestone.sql`).
- **Financial settings** (`20260618000002_financial_settings.sql`): `reporting_currency_settings` (global / per-entity reporting currency; NULL `entity_id` = global default), `fiscal_year_settings` (per-entity FY start month), `revenue_recognition_defaults` (per-entity default split kind + gross-margin %). Plus `cost_of_cash_settings` (working-capital params — `annual_rate`, `financing_cost_method`, `deduction_base`; `20260711010000`) and `stuck_deal_settings` (per-open-stage staleness thresholds for the Stuck Deals widget; `20260705070000`).
- **Integration config** (`20260618000003_integration_config.sql`): `integration_settings` (org-level feature toggles, key → JSONB), `slack_connections` (Slack workspace connections + event routing), `email_settings` (Resend / SMTP domain + template config), `salesforce_connections` (Salesforce instance connection + OAuth state; sync itself is later-phase).
- **RBAC** (`20260707030000_roles_permissions.sql`): `roles` (assignable custom roles; `is_system` rows mirror the `user_role` enum), `permissions` (code-defined `category.action` capability catalogue), `role_permissions` (role × permission matrix).
- `saved_views` — per-user named filter/sort views for the opportunity list (owner-only; `scope`, `filters` JSONB; `20260707010000`).
- `api_tokens` — hashed bearer tokens for the external-agent REST API (`token_hash`/`token_prefix`, `last_used_at`, `expires_at`, `revoked_at`; `20260711000000`).

---
