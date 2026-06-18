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
| deleted_at | timestamptz (nullable) | Soft-delete timestamp. Non-admin queries filter out soft-deleted rows. |
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

#### 4.6.4 Revenue Schedule

Custom monthly revenue amounts for recurring-revenue deals. Schema created by migration `20260618000000_opportunity_revenue_schedule.sql` (ORR-491). Used when `recurring_split_kind = 'custom'` to store per-month allocations.

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| opportunity_id | uuid (FK Opportunity) | Parent deal |
| month | date | First day of the month this revenue entry applies to |
| amount | numeric(20,4) | Revenue amount in the opportunity's currency |
| created_at, updated_at | timestamptz | |

Unique constraint on `(opportunity_id, month)` — at most one entry per month per deal. RLS inherits from the parent opportunity's visibility.

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
| source | enum | web \| mcp \| webhook \| email_inbound \| system — see §8.5 in [security](security.md) |
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

Custom fields are stored in a `custom_data jsonb` column on Account, Contact, Opportunity, and (optionally) Activity. A separate `field_definitions` table tracks the schema of custom fields per entity type. v1 ships with eight Gold Standard account fields seeded by migration (ORR-549): Payment Terms, GST Number (India), PAN (India), VAT Number (EU), TRN (MENA), Main Phone, HQ / Registered Address, Credit Risk Flag.

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

Full audit log on opportunities, accounts, contacts, opportunity_splits, opportunity_team_members, opportunity_revenue_schedule, approval_instances, document deletions, admin_alerts, currencies, fx_rates, and integration config tables. Each row records: `table_name`, `row_id`, `operation` (insert / update / delete), `changed_fields` (JSON diff), `actor_user_id`, `actor_source` (web / mcp / webhook / system), `actor_ip`, `actor_user_agent`, `occurred_at`.

Implemented via Postgres triggers writing to a single `audit_log` table (one table for all entities, indexed on `table_name + row_id + occurred_at`). Retention: indefinite for v1; configurable in v2 if storage becomes a concern.

### 4.12 AI Usage Log

Every AI call writes a row to `ai_usage` with: `user_id`, `provider` (claude / gemini / kimi / deepseek / ollama_local), `model`, `prompt_tokens`, `completion_tokens`, `cost_usd_estimate`, `feature` (search / summarise / draft_email / etc.), `request_id`, `started_at`, `finished_at`, `status`. This drives both the per-user / per-team / per-company spending caps (Section 7) and admin dashboards on AI cost.

### 4.13 MCP Sessions and Audit (v1.5)

When the MCP server is built in v1.5, it adds two tables:

`mcp_sessions` records each AI agent connection: `id`, `user_id`, `client_name` (e.g., "Claude Desktop", "NanoClaw", "Cursor"), `client_version`, `started_at`, `last_active_at`, `ip`. Used for rate limiting and admin visibility into which agents are connected on a rep's behalf.

`mcp_calls` records every MCP tool invocation: `id`, `session_id`, `tool_name` (e.g., "search_opportunities", "create_activity"), `arguments` (jsonb, redacted of any secret-like fields), `result_status` (success / error / rate_limited / unauthorised), `latency_ms`, `occurred_at`. Used for the AI agent dashboard and per-user / per-tool rate limiting.

Both tables have RLS: users see only their own sessions / calls; admin sees all.

### 4.14 Notification and Communication

Notification infrastructure for in-app, email, and Slack delivery. Schema created by migration `20260619000000_notifications_communications.sql` (ORR-524).

| Table | Purpose |
|---|---|
| `notification_routing` | Org-level event × channel routing matrix. Enables/disables event types (`stage_change`, `deal_assigned`, `approval_requested`, `mention`, `deal_won`, `deal_lost`) on channels (`in_app`, `email`, `slack`). Null `entity_id` = org-wide default. |
| `user_notification_overrides` | Per-user opt-in/opt-out overrides. Takes precedence over routing matrix. |
| `email_templates` | Editable transactional email templates with `subject`, `bodyHtml`, `bodyText`, and `variables` array. |
| `user_notifications` | In-app notification inbox with `title`, `message`, `linkUrl`, `readAt`, and JSONB `metadata`. |

`comms_tracking_enabled` boolean column added to `public.entities` — per-entity communication tracking toggle.

### 4.15 Data Management

Export configuration and job history. Schema created by migration `20260620000000_data_management.sql` (ORR-527).

| Table | Purpose |
|---|---|
| `finance_export_config` | Per-entity daily finance export config: `destination_drive_folder_id`, `format` (JSONB), `schedule`, `enabled`. |
| `import_jobs` | Import/export job history: `kind` (export\|import), `status`, `file_url`, `drive_file_id`, `record_count`, `error_log` (JSONB). |

### 4.16 Integration Configuration

Org-level integration settings. Schema created by migration `20260618000003_integration_config.sql` (ORR-518).

| Table | Purpose |
|---|---|
| `integration_settings` | Key-value store for integration feature toggles. `key` (text, unique), `value` (JSONB). |
| `slack_connections` | Slack workspace connections: `workspace_id`, `event_routing` (JSONB), `status` (disconnected\|connecting\|connected\|error). |
| `email_settings` | Email infrastructure: `resend_domain`, `inbound_domain`, `template_config` (JSONB), `status`. |
| `salesforce_connections` | Salesforce migration connections: `instance_url`, `api_version`, `status`, `last_sync_at`. |

### 4.17 Financial Settings

Financial admin configuration per entity. Schema created by migration `20260618000002_financial_settings.sql` (ORR-515).

| Table | Purpose |
|---|---|
| `reporting_currency_settings` | Reporting currency overrides. Null `entity_id` = global default. |
| `fiscal_year_settings` | Per-entity FY start month override (`fy_start_month` 1–12). Overrides `entities.fiscal_year_start_month`. |
| `approval_thresholds` | Per-entity deal approval rules: `min_deal_value`, `max_deal_value`, `requires_role`, `approval_workflow_id`. |
| `revenue_recognition_defaults` | Default revenue split config: `default_split_kind`, `default_margin_percent`, `auto_create_splits`. |

### 4.18 Entity Branding

Branding columns on `public.entities` added by migration `20260618000001_entity_branding_relationship_types.sql` (ORR-512):

| Column | Type | Notes |
|---|---|---|
| `logo_url` | text | Entity logo URL |
| `brand_color` | text | Primary brand color (hex) |
| `brand_accent_color` | text | Accent brand color (hex) |

### 4.19 Account Relationship Types

`account_relationships.kind` migrated from enum to text FK referencing `public.relationship_types` (ORR-512). Admins manage relationship types without schema changes. Default seeded: `subsidiary_of`, `procurement_via`, `partner_with`, `parent_of`, `sister_company`.

| Field | Type | Notes |
|---|---|---|
| `relationship_types.id` | uuid (PK) | |
| `relationship_types.name` | text | e.g., "Subsidiary of" |
| `relationship_types.kind` | text | Machine key, e.g., "subsidiary_of" |
| `relationship_types.reverse_kind` | text (nullable) | Inverse, e.g., "parent_of" |
| `relationship_types.active` | boolean | Soft-delete |

### 4.20 Currencies Registry

Admin-managed currency registry powering the `currency` field on Opportunities. Schema created by migration `20260505000002_currencies.sql` (ORR-142).

| Field | Type | Notes |
|---|---|---|
| code | text (PK) | ISO 4217 code or custom code (e.g., "USDT"). Constrained to `^[A-Z0-9]{1,8}$`. |
| name | text | Display name, e.g., "US Dollar", "Tether (USD-pegged stablecoin)" |
| scale | int | Decimal places for this currency (0 for JPY/KRW/VND, 2 for most, 4 for USDT) |
| active | boolean | Soft-delete flag. Most queries filter on `active = true`. |

Seeded with 39 currencies covering all Nodwin Group markets (AED through ZAR) plus USDT for crypto-denominated deals. Admin manages via the admin panel.

### 4.21 FX Rates

Exchange rates for converting deal amounts between currencies, managed by Finance and Admin. Schema created by migration `20260617000000_fx_rates.sql` (ORR-458).

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| from_currency | text (FK currencies) | Source currency code |
| to_currency | text (FK currencies) | Target currency code |
| rate | numeric(20,8) | How many units of `to_currency` equal 1 unit of `from_currency`. Must be > 0. |
| source | enum | `manual` (entered by finance/admin) or `external_api` (fetched from provider) |
| source_reference | text (nullable) | Provider name, URL, or audit note |
| effective_date | date | Date the rate applies (defaults to today) |
| entity_id | uuid (FK Entity, nullable) | Entity-specific rate. NULL = group-wide default for the currency pair. |
| created_by | uuid (FK User) | Who entered the rate |

Unique constraint on `(from_currency, to_currency, effective_date, entity_id)` with `NULLS NOT DISTINCT` — one rate per pair per date per entity scope. RLS: all authenticated read; finance/admin write.

### 4.22 Admin Alerts

In-app notifications surfaced on the admin dashboard. Written by backend services via `service_role`, read/acknowledged by admin users. Schema created by migration `20260506000003_admin_alerts.sql` (ORR-289).

| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| title | text | Alert headline |
| message | text | Alert body |
| type | text | Categorisation: `info`, `warning`, `error`, `deadletter`, etc. |
| metadata | jsonb | Arbitrary payload, e.g., `{deadletterId, reason, fromAddress}` |
| acknowledged_at | timestamptz (nullable) | Set when an admin dismisses/reads the alert. NULL = unread. |
| created_by | uuid (FK User) | System user or admin who created the alert |

Indexed on `acknowledged_at` (partial, non-null only) for efficient unread-alert queries. RLS: admin-only select/update; backend writes via `service_role`.

---
