# Nodwin CRM — Build Roadmap

> Status of every **SOW §5.1 Must-Have (v1)** feature + the **§5.2 MCP (v1.5)** deliverable,
> against the codebase as audited **2026-07-06**. This is the canonical "what's left" reference.
>
> Legend — **✅ Done** (wired end-to-end, usable) · **🟡 Partial** (code exists but unwired / placeholder / broken) · **❌ Absent** (schema/toggle only, or nothing).
> Effort — **S** ≈ ≤1 PR wiring · **M** ≈ new admin/UI surface · **L** ≈ greenfield subsystem.

Audit tally: **8 done · 4 partial · 11 absent** of 23.

---

## ✅ Done (8)

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
| 15 | AI search (semantic + keyword) | pgvector shipped: `lib/ai/embeddings.ts`, `lib/ingestion/`, migrations `..020000_document_ingestion.sql` / `..030000_knowledge_search.sql`, route `app/api/knowledge/search/route.ts`, UI `app/(crm)/knowledge/` + `admin/knowledge/` (ORR-620/621). |

---

## 🟡 Remaining partials (backend built, needs finishing)

| SOW # | Feature | Effort | Gap | Blocked by |
|---|---|---|---|---|
| 9 | Inbound email (Postmark) | S | Parser `lib/email/inbound.ts` + `lib/webhooks/postmark.ts` complete + tested. **Missing only the route** `app/api/webhooks/postmark/route.ts`. | Postmark account/domain |
| 11 | Slack integration | M | `sendSlackNotification` queries **phantom columns** (`slack_user_id`/`access_token`/`user_id`/`enabled` don't exist) → runtime error. Needs reconciled per-user Slack-identity schema + a signed slash-command/event route. | Slack app + `@slack/bolt` |
| 16 | AI assistant (summarise/draft/next-best) | M | Full router + caps + 6 providers in `lib/ai/`; **nothing calls it**. Needs `/api/ai/*` endpoints + UI buttons. | — |
| 17 | Dashboards (role-tiered) | L | 1 generic dashboard + reports exist; **Stuck Deals shipped** (ORR-103: `lib/data/stuck-deals.ts`, `components/dashboard/stuck-deals.tsx`, `admin/deal-health/`). **~9 of 11 named dashboards still absent** (My Pipeline/Activities/Targets, Team Funnel/Leaderboard, Group Pipeline, Revenue Forecast, Deals at Risk); no My/Team/Group tiers. | — |

---

## ❌ Greenfield builds (absent — biggest chunk)

**No Google/Slack/email SDK is in `apps/web/package.json`; only 2 API routes + 1 edge fn exist.** The whole Workspace + email layer is from-scratch.

| SOW # | Feature | Effort | Notes |
|---|---|---|---|
| 12 | Google Drive — per-opp folder + permission sync | L | Config table + toggles only. Needs `googleapis`, folder creation, visibility-tier perm sync. |
| 8 | Document upload + link-attach | M | Depends on 12. `drive_file_id/folder_id` are `NOT NULL` so link-attach needs schema tweak. |
| 10 | Outbound email composer (Gmail OAuth) | L | `gmail.send` OAuth, compose UI, log-as-activity. (Resend txn-notifications are unrelated.) |
| 13 | Google Calendar | L | Event creation from deals + event→suggested-activity ingest. |
| 14 | **P&L Google Sheet on close** | L | Headline SOW "why". Sheets API copy-of-template + prefill + Finance share + notify, on `closed_won`. |
| 18 | Salesforce migration tooling | L | Only a `legacy_salesforce_id` column. Needs idempotent + incremental importer + `sf_field_map.yaml`. |
| 20 | Audit-log **viewer** UI | M | Triggers write `audit_log`; nothing displays it. Needs per-record + global filterable view. |
| 21 | AI cost dashboard | M | `ai_usage` + rollup view exist; no admin page reads them. Depends conceptually on 16 being live. |
| 19 | Sandbox / demo mode | — | **⚠️ Deprecated direction.** Nothing built — and no longer planned as spec'd: the deploy model was collapsed to a single production environment, so "sandbox as a managed, admin-toggleable isolated env" is obsolete. Re-scope (e.g. seed-data-only demo mode) before any build. |
| 22 | Mobile PWA + Capacitor | M | No manifest/service worker. Add `next-pwa` + manifest; Capacitor wrapper if leadership wants stores. |
| — | **MCP server (v1.5)** | L | Data layer is prepped (`{user, source}` threaded). Needs server + tool registry + `mcp_sessions`/`mcp_calls` + auth. Per SOW, starts *after* 4wk East-Asia stability. |

### Missing admin GUIs (sub-items of above)
User management / role assignment · AI-cost (21) · Audit-viewer (20). *(Approvals-7b and Allowed-domains-1 now shipped; Sandbox-19 deprecated.)*

---

## Deferred (SOW §5.3 v2 / §5.4 out-of-scope / §12 open questions)

Not v1-blocking; recorded so they aren't lost.

- **v2 candidates (§5.3):** bulk ops on opp list (reassign/advance/export CSV) · saved views & shareable filters · configurable email templates w/ merge tags · CSV/Sheets export for any list · margin-at-risk dashboard · multi-region read replicas · cohort/velocity/forecast-accuracy reporting · AI weekly digest · FX-converted P&L consolidation · two-way Sheets sync · realtime collaborative opp editing · MCP write-tool expansion.
- **Out-of-scope (§5.4):** WhatsApp · marketing automation/lead-scoring · support/ticketing · quote-to-cash/e-sign/invoicing · FX rate calc · selling CRM as a product · generic public REST API.
- **Open questions (§12):** margin-at-risk design · Drive multi-layer perms · custom-amount recurring split · sandbox refresh cadence · mobile store distribution · AI opt-in default granularity · WhatsApp timing · MCP write-tool surface.

---

## Note vs Salesforce / Pipedrive

Beyond SOW scope, features a rep/manager expects from SF/Pipedrive that are still missing: **email (send/2-way/templates/tracking)** · **calendar + task-reminder queue** · **global search** (header box is a dead placeholder) · **products/line-items on deals** · **bulk actions + CSV import/export** · **workflow automation** · **saved views** · **forecasting** · **mobile app**.

Where this CRM already **matches or beats** them: visibility-tier + org-cascade **RLS** (SF-Enterprise-tier, beyond Pipedrive) · **multi-entity/multi-currency/revenue-split/opp-team** data model · custom fields · stage history · audit backend.
