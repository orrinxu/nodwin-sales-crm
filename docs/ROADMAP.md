# Nodwin CRM — Build Roadmap

> Status of every **SOW §5.1 Must-Have (v1)** feature + the **§5.2 MCP (v1.5)** deliverable,
> against the codebase as audited **2026-07-11**. This is the canonical "what's left" reference.
>
> Legend — **✅ Done** (wired end-to-end, usable) · **🟡 Partial** (code exists but unwired / placeholder / broken) · **❌ Absent** (schema/toggle only, or nothing).
> Effort — **S** ≈ ≤1 PR wiring · **M** ≈ new admin/UI surface · **L** ≈ greenfield subsystem.

Audit tally: **10 done · 3 partial · 10 absent** of 23. (Plus several beyond-§5.1 features shipped — see "Beyond §5.1 — shipped" below.)

---

## ✅ Done (10)

| SOW # | Feature | Notes |
|---|---|---|
| 1 | Google OAuth + domain allow-list (+ admin GUI) | OAuth + `is_email_domain_allowed()` enforcement plus allowed-domains admin GUI (`app/(crm)/admin/allowed-domains/`, `lib/data/allowed-domains.ts`). |
| 2 | Account detail company-tree | Relationship graph wired into account detail (`app/(crm)/accounts/[id]/page.tsx` → `getAccountRelationships`/`getAccountRelationshipGraph`/`upsertAccountRelationshipAction`); `admin/relationship-types/`. (Drive-folder sub-part stays deferred → §12.) |
| 3 | Contact list + detail (+ M2M account links) | Read view doesn't display linked accounts (edit-only) — minor. |
| 4 | Opportunity list + kanban | Drag-to-advance, per-column totals, hot/overdue badges. |
| 5 | Opportunity detail tabs | ORR-646 detail read-view redesign; stage-history/splits/team/approvals wired to real data. |
| 6 | Custom fields admin GUI | All 12 data types; add/edit/archive/reorder. |
| 7 | Approval workflow (MVP) | `lib/data/approvals.ts`; write-path/gate/multi-approver migrations; opp-detail wires submit/approve/reject/reassign/cancel (ORR-604/608/610/611). |
| 7b | Approval admin GUI + template steps | `app/(crm)/admin/approval-workflows/`; migrations `..350000_approval_workflow_admin.sql`, `20260704000000_approval_template_layer.sql`, `..010000_approval_enforce_gate.sql`. (Sub-item of 7 — not counted in the 23.) |
| 8 | Document upload + storage (+ Drive import) | **Server-side storage shipped** (ORR-653, #214–217): private Supabase Storage `documents` bucket, direct-upload data layer + server actions, Files module UI (`app/(crm)/documents`), and Drive→Storage import via the Google Picker (`components/documents/drive-import-button.tsx`). `drive_file_id` is now nullable; link-attach supported. (Server-side Drive folder/permission *sync* is still §12.) |
| 15 | AI search (semantic + keyword) | pgvector shipped: `lib/ai/embeddings.ts`, `lib/ingestion/`, migrations `..020000_document_ingestion.sql` / `..030000_knowledge_search.sql`, route `app/api/knowledge/search/route.ts`, UI `app/(crm)/knowledge/` + `admin/knowledge/` (ORR-620/621). |
| 16 | AI assistant (summarise/draft/next-best) | **AI Deal Copilot shipped** (#182): summarize / draft follow-up / next-best-action, wired via server actions (`app/(crm)/opportunities/copilot-actions.ts`, `components/opportunities/deal-copilot.tsx`) on opportunity detail, over the existing `lib/ai/` router + caps + providers. (Surfaced through server actions, not a public `/api/ai/*` surface.) |

---

## 🟡 Remaining partials (backend built, needs finishing)

| SOW # | Feature | Effort | Gap | Blocked by |
|---|---|---|---|---|
| 9 | Inbound email (Postmark) | S | Code-complete: parser `lib/email/inbound.ts` + `lib/webhooks/postmark.ts` + the route `app/api/webhooks/postmark/route.ts` (ORR-690, secret-authenticated, with an `INBOUND_EMAIL_DISABLED` kill switch). Only external setup remains: point Postmark's Inbound webhook at the route and set `POSTMARK_WEBHOOK_SECRET`. | Postmark account/domain |
| 11 | Slack integration | M | `sendSlackNotification` queries **phantom columns** (`slack_user_id`/`access_token`/`user_id`/`enabled` don't exist) → runtime error. Needs reconciled per-user Slack-identity schema + a signed slash-command/event route. | Slack app + `@slack/bolt` |
| 17 | Dashboards (role-tiered) | M | Much more built since the last audit. Shipped: **revenue forecasting & rep scorecards** (#183, `lib/data/forecast.ts` → `components/dashboard/forecast-tile.tsx`, `rep-leaderboard.tsx`, `components/reports/forecast-scorecards.tsx`); **Team Leaderboard** (#190); **"Needs my attention"** (#185); **summary strip + Conversion-by-Stage funnel** (#189); **quarter forecast tile** (#186); **deal-card health signals** (#187); **Stuck Deals** (ORR-103, `lib/data/stuck-deals.ts`, `admin/deal-health/`); plus a **customizable per-user widget grid** (#192). Remaining gap: full **My / Team / Group role-tier separation** and a few named dashboards (Group Pipeline, Deals-at-Risk) are not yet distinct tiers. | — |

---

## ❌ Greenfield builds (absent — biggest chunk)

**No Google/Slack/email SDK is in `apps/web/package.json`; only 2 API routes + 1 edge fn exist.** The whole Workspace + email layer is from-scratch.

| SOW # | Feature | Effort | Notes |
|---|---|---|---|
| 12 | Google Drive — per-opp folder + permission sync | L | Config table + toggles only. Needs `googleapis`, folder creation, visibility-tier perm sync. (Client-side Drive→Storage *import* shipped under §8; the server byte-fetch seam `lib/integrations/drive/index.ts` still throws "not configured".) |
| 10 | Outbound email composer (Gmail OAuth) | L | `gmail.send` OAuth, compose UI, log-as-activity. (Resend txn-notifications are unrelated.) |
| 13 | Google Calendar | L | Event creation from deals + event→suggested-activity ingest. |
| 14 | **P&L Google Sheet on close** | L | Headline SOW "why". Sheets API copy-of-template + prefill + Finance share + notify, on `closed_won`. |
| 18 | Salesforce migration tooling | L | Only a `legacy_salesforce_id` column. Needs idempotent + incremental importer + `sf_field_map.yaml`. |
| 20 | Audit-log **viewer** UI | M | Triggers write `audit_log`; nothing displays it. Needs per-record + global filterable view. |
| 21 | AI cost dashboard | M | `ai_usage` + rollup view exist; no admin page reads them. Depends conceptually on 16 being live. |
| 19 | Sandbox / demo mode | — | **⚠️ Deprecated direction.** Nothing built — and no longer planned as spec'd: the deploy model was collapsed to a single production environment, so "sandbox as a managed, admin-toggleable isolated env" is obsolete. Re-scope (e.g. seed-data-only demo mode) before any build. |
| 22 | Mobile PWA + Capacitor | M | No manifest/service worker. Add `next-pwa` + manifest; Capacitor wrapper if leadership wants stores. |
| — | **MCP server (v1.5)** | L | Data layer is prepped (`{user, source}` threaded). Needs server + tool registry + `mcp_sessions`/`mcp_calls` + auth. Per SOW, starts *after* 4wk East-Asia stability. **Note:** a token-authed **REST API** for external agents shipped in the meantime (`app/api/v1/**`, #224–229) — a non-MCP surface with the same `lib/data/*` path; see "Beyond §5.1 — shipped" below. It does *not* satisfy the §5.2 MCP deliverable, but covers much of the "let an agent read/write the CRM" intent. |

### Missing admin GUIs (sub-items of above)
AI-cost (21) · Audit-viewer (20). *(Users & Roles admin — `app/(crm)/admin/users`, ORR-617/#141 — and custom Roles & Permissions — `app/(crm)/admin/roles`, #193 — now shipped, as have Approvals-7b and Allowed-domains-1. Sandbox-19 deprecated.)*

---

## Beyond §5.1 — shipped (not in the 23)

Features delivered outside the numbered SOW §5.1 list (some were §5.3 v2 candidates, some new):

- **Customizable dashboard grid** (#192) — draggable/resizable per-user widget layout (`components/dashboard/dashboard-grid.tsx`; layout persisted in `user_preferences.dashboard_layout`).
- **Saved views** (#191) — per-user named filter/sort views for the opportunity list (`lib/data/saved-views.ts`, `saved_views` table; was a §5.3 v2 candidate). Owner-only.
- **Cash-flow milestones** (#231/#232) — `cashflow_milestone` table + RLS and the working-capital derivation (`lib/data/cashflow-milestones.ts`, `lib/finance/working-capital.ts`); foundation for the Deal Confirmation / Handoff module. Data + derivation shipped; UI surface is still in flight (see CHANGELOG *Unreleased*).
- **Token-authed REST API for external agents** (#224–229) — read (Phase 1) + write (Phase 2: create/update opportunities/contacts/accounts, `POST /activities`) endpoints under `app/api/v1/**`, backed by hashed `api_tokens`. A non-MCP agent surface (see the MCP note above); guide at `docs/rest-api.md`.

---

## Deferred (SOW §5.3 v2 / §5.4 out-of-scope / §12 open questions)

Not v1-blocking; recorded so they aren't lost.

- **v2 candidates (§5.3):** bulk ops on opp list (reassign/advance/export CSV) · ~~saved views~~ (private per-user saved views **shipped**, #191; *shareable* filters still deferred) · configurable email templates w/ merge tags · CSV/Sheets export for any list · margin-at-risk dashboard · multi-region read replicas · cohort/velocity/forecast-accuracy reporting · AI weekly digest · FX-converted P&L consolidation · two-way Sheets sync · realtime collaborative opp editing · MCP write-tool expansion.
- **Out-of-scope (§5.4):** WhatsApp · marketing automation/lead-scoring · support/ticketing · quote-to-cash/e-sign/invoicing · FX rate calc · selling CRM as a product · generic public REST API.
- **Future expansion — in-CRM outbound send (ORR-706, decided deep-links for v1):** replace the Gmail/Slack *deep-links* with full in-CRM delivery — send user-composed email via the connected Gmail account (`gmail.send`, logged as an activity, reply threading) and a connected Slack app posting notifications. Overlaps the Google Workspace work (ORR-697/698). See `integrations.md` §6.2 / §6.4. Re-ticket if reps need sent email/Slack captured in-CRM.
- **Open questions (§12):** margin-at-risk design · Drive multi-layer perms · custom-amount recurring split · sandbox refresh cadence · mobile store distribution · AI opt-in default granularity · WhatsApp timing · MCP write-tool surface.

---

## Note vs Salesforce / Pipedrive

Beyond SOW scope, features a rep/manager expects from SF/Pipedrive that are still missing: **email (send/2-way/templates/tracking)** · **calendar + task-reminder queue** · **global search** (header box is a dead placeholder) · **products/line-items on deals** · **bulk actions + CSV import/export** · **workflow automation** · **mobile app**.

Where this CRM already **matches or beats** them: visibility-tier + org-cascade **RLS** (SF-Enterprise-tier, beyond Pipedrive) · **multi-entity/multi-currency/revenue-split/opp-team** data model · custom fields · stage history · audit backend · **saved views** · **revenue forecasting + rep scorecards** · **customizable dashboard grid** · **AI deal copilot**.
