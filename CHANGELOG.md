# Changelog

All notable changes to the Nodwin CRM are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

Work in flight on feature branches (not yet merged to `main`): admin landing page,
ORR-661, and cash-flow milestone follow-ups.

## 2026-07-16

### Added

- **Admin setting: require line items from a configurable stage (ORR-753):** a new **Sales Process** admin page (under Automation & AI) lets an admin pick the deal stage from which **line items are expected** — early stages (Qualify) only need the overall amount, but by e.g. **Verbal Agreement** the itemized breakdown should be filled in. It's a **warning, not a hard block**: a deal that has reached the configured stage with no line items shows an amber banner on its detail page ("Line items are expected from the … stage — add them in the Products tab"). A second toggle controls whether a **manually-overridden** deal amount waives the requirement. Global (singleton) `sales_process_settings` table (read = all authenticated, write = admin; 6-assertion pgTAP), a pure `lineItemsRequirementUnmet` rule (unit-tested — off/before-stage/at-stage/won/lost/override cases), no stage-write-path gate. Follows on from the ORR-704 products/line-items feature.
- **Line-item read-view + catalog cost + currency lock (ORR-752, §E of ORR-704 — closes the epic):** the opportunity **Overview** tab now shows a read-only **Products & line items** breakdown (per-line qty/price/discount/total + subtotal/discount/deal amount) when a deal has lines, so the composition is visible without opening the editor. The admin **product catalog** form gained a **Unit Cost** input (persisted via the data layer added in §D). And the deal's **Currency** field is now **locked while the deal has line items** (they're priced in that currency, so changing it would mis-scale them) — the multi-currency edge. Board totals / forecast / reports need no change: they read `opportunities.amount`, which §C keeps authoritative. Component-tested; no migration. This completes the products / line-items feature (ORR-704, §A–§E).
- **Line-item editor on the deal (ORR-751, §D of ORR-704):** a new **Products** tab on the opportunity detail page lets reps build a deal from line items — a repeating-row editor (product picker from the catalog + custom off-catalog lines, quantity, unit price, per-line % discount, live per-line and deal totals), a per-deal fixed discount, and the manual-override toggle. Saving replaces the lines and applies the pricing atomically (`saveOpportunityLineItemsAction` → the ORR-749/750 RPCs), and the deal amount recomputes server-side. The **Amount field in the edit form is now read-only** when a deal has line items and isn't overridden ("Derived from line items — edit in the Products tab"). The product catalog data layer now surfaces `unitCostAmount` (used to prefill a line's cost). Component-tested; no migration. Read-view breakdown + admin-settable catalog cost are §E follow-ups.
- **Deal amount derived from line items (ORR-750, §C of ORR-704):** the deal amount is now computed from its line items — `opportunities.amount = Σ line_total − per-deal fixed discount`, floored at 0 — and written back into the authoritative `amount` column so every existing rollup (forecast/scorecard aggregates, stage totals, reports, per-account) keeps working unchanged. New columns: `line_items_amount_overridden` (a per-deal **override toggle** — pins a manual amount, lines become informational) and `line_items_discount_amount` (per-deal fixed discount, deal currency). A deal with **no** line items keeps its manual amount. Recompute runs inside the two SECURITY DEFINER write paths — `replace_opportunity_line_items` (now recomputes after swapping lines) and a new `set_opportunity_line_items_pricing(_id, discount, overridden)` — both authorised via `can_write_opportunity_line_items` and row-locked; never a table trigger. Data layer gained `getOpportunityLineItemsSummary` (previews subtotal/discount/total the same way the DB does) + `setOpportunityLineItemsPricing`. 7-assertion pgTAP (derive, discount, override-pins, override-off-rederives, zero-floor, line-less-stays-manual, auth) + unit tests. The revenue-schedule "months must sum to amount" invariant now validates against the derived amount automatically (it reads `amount`). **Line-item editor UI is §D (ORR-751)** — no UI wires these RPCs yet.
- **Opportunity line items — schema + data layer (ORR-749, §B of ORR-704):** new `public.opportunity_line_items` table (product × quantity × unit price, optional per-line % discount, optional custom off-catalog lines via nullable `product_id`, stored `unit_cost` for later margin). All amounts are in the **deal's currency**; `line_total` is a **generated** column (`qty × unit_price × (1 − discount%)`). RLS **tracks the parent opportunity's visibility** with the same confidential fence as `opportunity_splits` (explicit-visibility branch unfenced, admin/role-scope branches fenced). Whole-set writes go through an atomic `replace_opportunity_line_items` RPC (DELETE+INSERT in one txn, owner/admin-authorised, row-locked), mirroring `replace_revenue_schedule`. Data layer `lib/data/opportunity-line-items.ts` (Money-correct, unit-tested) + 9-assertion pgTAP. Catalog gained a default `unit_cost_amount`. **Deal-amount rollup from these lines is §C (ORR-750)** — this ships the schema + write path only; nothing changes the deal amount yet.
- **Product catalog (ORR-748, §A of ORR-704):** a new admin **Products** screen (`/admin/products`, under Data) for managing a catalog of sellable products/services — name, SKU, unit price, sort order, active status — with create / edit / deactivate. New `public.products` table (uuid PK, so per-deal line items can reference it in ORR-749) whose unit price is an `(amount, currency)` Money pair; RLS reads = all authenticated, writes = admin only; 13 pgTAP assertions cover the RLS + constraints. Data layer `lib/data/products.ts` follows the `relationship-types` pattern; unit-tested. First slice of the products/line-items feature — schema (§B), amount rollup (§C) and the deal-side line-item editor (§D) are separate tickets.
- **Generic CSV import for Accounts (ORR-731):** a new "Import accounts from CSV" card on `/admin/data-management` takes an arbitrary CSV (not just a Salesforce export) and creates accounts. Columns are matched to fields by header name against an alias table (`Name`/`Company` → name; plus optional Legal Name, Website, Country, Industry, Description), so no per-import mapping UI is needed for the common cases; bare-domain websites are normalised to `https://…`. Rows whose name already exists (case-insensitive, paged scan to dodge the PostgREST 1000-row truncation) are **skipped**, so re-uploading the same file — or a double-click — won't duplicate. Each run writes an `import_jobs` audit row now carrying `record_count` + `error_log` (both columns existed but were unpopulated; `createImportJob` was extended). Reuses the ORR-699 `parseCsv` and `createAccount` (admin RLS, `created_by` trigger, audit). Contacts (account linking) and Opportunities (name→id resolution) are follow-ups.

### Docs

- **Corrected the last stale secret-scanning references (ORR-602):** `docs/SOW.md` + `docs/_sources/SOW-v1.1.md` §9.5 item 5 described secret scanning as a **pre-commit hook** — the as-built runs **gitleaks in `deploy.yml`'s `checks` job on every push** (the standalone `secret-scan.yml` gate was descoped over a license issue; the pre-commit hook runs only the RLS linter). The other files flagged in the ticket (`README.md`, `BUILD_TICKETS.md`, `paperclip-org-chart.md`) were already reconciled by the #242 accuracy sweep.

## 2026-07-13

### Added

- **"My focus" dashboard hub + My / Team / Group scope switcher (ORR-719, #285):** the homepage is now a single-rep, action-first hub — curated, labelled sections (**Needs your attention → My numbers → My pipeline → Recent**) behind a **My / Team / Group** switcher (SOW §17's three-tier split). The cross-rep widgets (rep leaderboard + conversion funnel) relocate to a **Team** tab; **Group** is a shell for region/exec rollups (follow-up ORR-723). New `DashboardTabs` (client switcher) + `DashboardSection`; `dashboard/page.tsx` builds server-rendered section nodes passed as props to the switcher. This sets aside the draggable "Edit layout" grid on the homepage (revisiting gate G6) in favour of the curated hub — `DashboardGrid` + the layout persistence stay in the tree, just no longer mounted on the homepage.
- **"Needs a touch" + Reconnect CTA on the dashboard (ORR-719, #284):** the "Needs my attention" widget's stale bucket is now **"Needs a touch"** (deals ranked by time since last activity, `MAX(activities.created_at)`, owner-scoped), and its Overdue + Needs-a-touch rows get a **Reconnect** button that opens a small dialog to log a real touch (call / email / meeting / note) against the deal via `createActivity` — recording it resets the deal's last-contact clock so it drops off the list. New `logTouchAction` + `ReconnectButton`. This is the reshaped answer to gate G2: a calendar-dependent "today's meetings" list isn't buildable yet (no Calendar OAuth, and `meeting` activities carry no scheduled date), so the valuable half — last-contact recency + a reconnect nudge — ships now; the real calendar-invite upgrade is ORR-724.
- **Inline quick-create for the Account relation picker (#290):** typing a new account name in the opportunity form's **Account** picker and confirming now creates it inline (the empty-state offers **`+ Create "…"`**), then selects it and unlocks the (already account-gated) Primary Contact picker. New `createAccountQuickAction` reuses the existing `createAccount` data path (`{ user, source }`, RLS + `created_by` trigger + audit; owner = current user) and returns the `EntityCombobox` option shape. Reuses the existing `EntityCombobox` creatable primitive — Contact quick-create was already wired; this closes the Account gap. Sales Unit / Business Unit / Entity stay admin-managed (not inline-creatable). Country prefill and a near-duplicate warning are follow-ups (no fuzzy matcher exists today — the resolver's `pickRecord` is exact-match only).

### Fixed

- **Opportunity Generator RFP uploads failed with a generic "analysing" error (ORR-710):** Next's default **1 MB** server-action body limit rejected real PDF/DOCX uploads before `extractDocumentTextAction` ran. Raised the upload cap to **50 MB** (`experimental.serverActions.bodySizeLimit` + the action's own size check) and surfaced a "max 50 MB" note in the upload step.
- **Dashboard metric tiles clipped the value on mobile (ORR-718, #283):** `KpiCard` laid the value and the top-right icon out in a single horizontal band, so a wide currency value (no wrap point) overflowed under the `shrink-0` icon and the card's `overflow-hidden` clipped the right edge on ~360–390px screens ("$150,000" → "$150,00"). The label + icon now share a header row and the value drops to its own full-width line below.
- **Dashboard metrics — wrong average deal size + currency mixing (ORR-693, #286):** `avgDealSize` divided the total deal value (summed over won + lost + active deals) by a denominator that omitted lost deals, inflating the figure; it now divides by the full converted population. `getRecentDeals` returned each deal's **raw** amount with no FX conversion, yet the dashboard formats recent-deal amounts with the reporting-currency formatter — so a ₹ deal rendered as "$…". It now converts each amount to the reporting currency and keeps an unconvertible deal in its **own** currency (rather than mislabelling it or dropping it); `RecentDealRecord` gained a `currency`. (`getStuckDeals` already converted — no sibling bug.)
- **Stage change via the edit form skipped history + notifications (ORR-694, #287):** a stage moved through the general `updateOpportunity` path (e.g. the full-edit form) persisted the new stage but wrote no stage-history entry and sent no stage-change notification — only the dedicated `updateOpportunityStage` did. `updateOpportunity` now records history and fires `notifyStageChange` on a real stage change, matching the dedicated path.
- **Protected pages returned HTTP 500 when unauthenticated (ORR-712, #289):** `requireUser()` threw on no session, and in a server-component render that uncaught throw rendered Next's 500 boundary instead of redirecting — so **every** `(crm)` page returned 500 to unauthenticated requests (bookmarks after logout, shared links, uptime probes). Page / server-action callers (no `request` arg) now `redirect("/login")`; API / route-handler callers (which pass `request`) still get the `UnauthorisedError` throw so they return a proper 401.

### Changed

- **Generator: drop a document anywhere in the viewport (ORR-710):** while the "Generate from a document" step is open, a dropped file is now accepted **anywhere on screen** (with a full-screen drop overlay), not only on the small dashed box — much easier on large / 1440p displays.
- **Removed the redundant "Quick Create" from the pipeline board (ORR-710):** superseded by the unified "Create Opportunity" entry (ORR-681). Deleted the orphaned `OpportunityQuickCreate` component and its test.

### Security

- **Approval enforce-gate scoped to the wrong entity — fail-open (ORR-695, #288):** `opportunity_check_enforce_gate` matched per-entity approval workflows on the opportunity's `billing_entity_id` (nullable and independent of the sales unit) instead of the sales-unit-derived business entity the rest of the subsystem uses. Whenever billing entity was NULL or different, an entity's enforce-gate workflow was **silently skipped** and a rep could advance the stage past its trigger with no approved approval — the worst direction for an enforcement control. A new migration resolves the entity exactly like `submit_opportunity_for_approval` (`sales_unit_id → business_units.entity_id`).
- **One-pending-approval-per-opportunity now enforced at the DB (ORR-695, #288):** added a partial unique index (`approval_instances(entity_id) WHERE entity_type='opportunity' AND status='pending'`) so the single-pending invariant no longer relies solely on an app/RPC `EXISTS` check that a direct admin insert or a second write path could race. Terminal states are excluded, so re-submitting after a prior instance resolves is unaffected.
- **`getApprovalActionState` role branch missing the entity firewall (ORR-695, #288):** it offered the Approve/Reject affordance to role-based approvers in the **wrong entity** (the server write still rejected it via `record_approval_decision`, but the UI gate diverged from the enforcement gate + RLS). It now firewalls the role branch by the caller's `primary_entity_id` vs the instance's `business_entity_id`, failing closed when the instance has no business entity. Named-approver, multi-approver, and admin branches are unchanged.

## 2026-07-12

### Added

- **Per-deal revenue schedule editor on the opportunity P&L tab (ORR-707, first half of ORR-689):** the previously-disabled **"Set Revenue Schedule"** button now opens an editor that spreads the deal's amount across its service months (flat template you can adjust), validating that the months sum to the deal amount before saving via the atomic `replace_revenue_schedule` RPC. The P&L tab (unlocked at Verbal Agreement) shows the saved schedule as a read-only table instead of a "coming soon" placeholder. Wires new `getRevenueScheduleAction` / `saveRevenueScheduleAction` server actions over the existing (previously UI-less) `lib/data/revenue-schedule.ts`. The full P&L summary + cost milestones (netting the schedule against costs into the working-capital model) land next (ORR-708).
- **Opportunity Generator now accepts PDF and DOCX uploads (ORR-684):** dropping a real RFP file into the "Generate from a document" flow now works, not just `.txt`/`.eml`/`.md`. A new `extractDocumentTextAction` server action pulls text from the upload via the shared ingestion extractor (`lib/ingestion/extract.ts`) — PDF was already supported there (unpdf); this adds **DOCX** parsing (mammoth), which also benefits document ingestion. Text files are still read in the browser (no round-trip); PDF/DOCX go server-side (15 MB cap, scanned-PDF "no text layer" message). `extractText` was decoupled from the Drive `DriveFile` type to a minimal `{bytes, mimeType}` shape. Chooser copy/accept-list updated; the "PDF/DOCX coming soon" note is gone.
- **`<SaveBar>` primitive — unified unsaved-changes bar (UI Convention Retrofit P1-T6 / G1, ORR-671, #250):** `primitives/save-bar.tsx` — a fixed bottom bar that slides in while a form/section has unsaved changes and offers Save / Discard (with a saving state), plus unit tests. Implements the app-wide save model (not autosave). Not yet adopted — the opportunity and settings recompositions wire it in.

### Changed

- **Unified unsaved-changes bar on Settings form tabs (UI Convention Retrofit G1, ORR-687):** the **Profile** and **Localization** settings tabs now dirty-track against a last-saved baseline and surface the shared `SaveBar` primitive (**Save changes / Discard**, with a saving state) instead of their own inline "Save profile" / "Save localization" buttons — the bar slides in only while there are unsaved edits and hides on save/discard. Toggle-style sections keep instant save: **Notifications** and **Appearance** still save on change (single-toggle instant-save is better UX), so they were deliberately not converted. Opportunity detail keeps its modal Cancel/Save. First adoption of the previously-unused `SaveBar`; mirrors the admin `role-matrix` dirty-diff pattern. (Stepper genericisation stays deferred — ORR-688 — since `StageTracker` has only one consumer.)
- **New Opportunity entry unified — Pipeline and the table view now open the AI generator (ORR-677 follow-up, ORR-681):** the Opportunity Generator chooser was only reachable from the Opportunities page, and only in kanban / empty state — the populated **table** view had no create button, and the **Pipeline** page's "Create Opportunity" opened the plain form because it wasn't passed `generateAction`. Now the Pipeline page passes `generateOpportunityAction`, and `OpportunitiesView` renders a persistent header **"Create Opportunity"** control in table view (a shared `createControl` reused by the empty state), so every view and page opens the same create flow — the AI chooser when available, the plain form otherwise. Same underlying `createOpportunity` path; no data changes.
- **User timezone + date-format preferences now applied to rendering across the app (UI Convention Retrofit follow-up, ORR-679):** dates and times everywhere in the CRM now render in the user's chosen date format **and** IANA timezone, not a hardcoded `en-US`/ambient zone. A new client `PreferencesProvider` (`components/providers/preferences-provider.tsx`) is seeded once by the `(crm)` layout from `getUserPreferences` and exposes `usePreferences()` → `formatDate` / `formatDateTime`; `lib/format.ts` gained an optional `timeZone` argument. Migrated ~21 formatter sites (record lists, opportunity/account/contact detail, admin lists, documents, activities, notifications, API tokens, custom fields, and the dashboard trio — which drop their `dateFormat` prop) off their inline formatters onto the context. Convergence, not timezone-only: sites that previously ignored the date-format preference now honor it too, matching the dashboard. Users with no timezone set are unaffected (a null zone renders in the ambient zone, exactly as before). Retires the "being migrated" note from the Localization settings copy.
- **Settings polish — timezone combobox + sidebar de-dup (UI Convention Retrofit follow-up, #268):** replaced the free-text Timezone input with a searchable IANA-timezone combobox (reuses `EntityCombobox` + `Intl.supportedValuesOf("timeZone")`), and removed the now-redundant sidebar **"API tokens"** dropdown item — it's the Access tokens tab under Settings since #261. Timezone is still stored-but-unused for rendering (the "being migrated" note stays accurate); actually applying it to date formatting is a separate follow-up. SaveBar (G1) adoption and the Stepper genericisation remain deferred (they need visual review).
- **Contacts detail recomposed onto the record-detail pattern (UI Convention Retrofit — Contacts, Phase 4, #266):** applied the record-detail pattern to the contact page — `RecordHeader` (name + title subtitle + Email / Phone / Primary account / Owner stat strip, keeping the `OwnerLink`) + `FacetTabs` (**Details · Activity**), **no rail**. Contacts are light enough that a separate Overview tab would only duplicate Details, so the stat strip serves as the at-a-glance. Details holds the contact fields + also-linked accounts + socials + custom fields; Activity holds the notes composer + timeline. Parity: same data, edit form and actions — reorganised, nothing dropped. Completes the Phase-4 Accounts/Contacts pass.
- **Accounts detail recomposed onto the record-detail pattern (UI Convention Retrofit — Accounts, Phase 4, #262):** applied the Opportunity blueprint to the account page — `RecordHeader` (name + Owner / Country / # Opportunities / # Contacts stat strip) + top `FacetTabs` (Overview · Details · Contacts · Opportunities · Files · Activity) + a persistent **rail** (Quick facts + a **Brand guidelines** pinned-document slot, reusing the existing `brand_guidelines` document category — no migration). Overview carries key-details / recent-activity peeks + the relationship tree; Details holds the account fields + description + tax IDs + custom fields; Contacts / Opportunities / Files / Activity each get their own tab. Parity: same data, edit form, attach/detach and all actions — reorganised, nothing dropped. Added a `columns` prop to `PinnedDocumentSlots` so the rail brand slot renders full-width. Contacts detail is the next page in this pass.
- **Personal settings recomposed into tabs + accurate integration copy (UI Convention Retrofit ORR-673, #261):** restructured the stacked settings sections into top `FacetTabs` (Profile · Localization · Notifications · Appearance · Access tokens · Integrations · Security) per `settings-top-tabs.html`. Folded the API-tokens UI in as the **Access tokens** tab (extracted `ApiTokensPanel`, still reused by the standalone `/settings/api-tokens` route). Corrected stale copy (per the 2026-07-12 audit): Google Drive is a live **per-user import** (was "Not connected"); dropped the "AI agent (MCP) token — Coming soon" row for a "Personal access tokens → Access tokens tab" pointer; Slack shown as "Coming soon" (removed the false "managed by admin" claim); Security lists all real sign-in methods (Google + password + magic link + email code), not Google-only. Parity: same server actions and per-section save/autosave. Deferred to follow-ups: SaveBar (G1) adoption and the timezone→combobox. Sidebar still links `/settings/api-tokens` separately (nav de-dup is a follow-up).
- **Facet tabs — fix the tab-bar rule drawing across the tabs (ORR-672 follow-up, #258):** the base `ui/tabs` list is a fixed `h-9` (36px), but the 18px facet tabs are taller, so the list's `border-b` rule rendered *through* the tabs above their true bottom (visible as a faint offset line, esp. on large screens). Override the list to `h-auto items-end` so it grows to the tab height and the rule sits flush under them. Completes the #255 alignment attempt.
- **Facet tabs — align the active underline with the bar's bottom rule (ORR-672 follow-up, #255):** added `-mb-px` to each tab so its 2px underline overlaps the list's `border-b` (mirrors the mock's `margin-bottom:-1px`), removing the faint doubled/offset hairline under the tab row.
- **Facet tabs → underline style with a larger 18px label (ORR-672 follow-up, #254):** reverted the filled-segmented pill back to the underline treatment (Orrin), bumping the label to 18px for prominence; active tab = semibold + primary-tinted label with a primary underline, inactive muted (hover darkens). Supersedes #253. Single consumer today (opportunity detail); canonical `FacetTabs` style for the settings recomposition (ORR-673).
- **Facet tabs → filled segmented style (ORR-672 follow-up, #253):** the active `FacetTabs` tab now reads as a filled primary-tint pill (`bg-primary/10` + `text-primary`, semibold, 16px; hover fills muted) instead of the underline treatment — chosen (Orrin) for stronger at-a-glance "where am I" prominence. Single consumer today (opportunity detail); sets the canonical tab style for the settings recomposition (ORR-673).
- **Opportunity detail polish — rename Cash Plan → P&L, more prominent facet tabs (ORR-672 follow-up, #252):** renamed the gated "Cash Plan" tab and its locked/unlocked copy to **P&L** (Orrin, staging review). Bumped the `FacetTabs` primitive to match the approved mock — 15px, medium→semibold, primary-tinted active label with a wider gap (was 13px / foreground active). `FacetTabs` currently has a single consumer (the opportunity detail page), so the primitive change is contained; it also lands the canonical prominence for the settings recomposition (ORR-673).
- **Opportunity detail recomposed onto the approved mock (UI Convention Retrofit ORR-672, #251):** restructured `opportunity-detail-wrapper.tsx` into the `opportunity-reorganized.html` layout — top-level `FacetTabs` (Overview · Details · Files · Activity · Team & Splits · Cash Plan) with the persistent rail slimmed to Approval + Deal Copilot. Overview surfaces the pinned document band plus "Key details" / "Recent activity" peek cards that jump to their full tabs; Files becomes its own tab (decision C2); Team, Splits and Stage History move out of the rail (Stage History folds into an Activity sub-segment alongside All/Notes/Calls/Email); the Cash Plan tab is gated with a `locked` glyph until the deal reaches Verbal Agreement. Parity change: same data, server actions, edit sheet and empty-field "Add" affordances — reorganised, nothing dropped. SaveBar (G1) not yet wired here; the activity composer keeps its own save. Tests updated to navigate the new tab structure.
- **Canonical `<FacetTabs>` primitive (UI Convention Retrofit P1-T5, ORR-669, #249):** promoted the inline underline-facet tab styling into `primitives/facet-tabs.tsx` (`FacetTabs`/`FacetTabsList`/`FacetTabsTab`/`FacetTabsPanel`, layered on `ui/tabs`, with a `locked` glyph affordance for gated tabs), and adopted it in the opportunity Communications tab bar. Byte-identical styling; no behaviour or visual change. Route-sync + rail-slot deferred to the recomposition where they're wired and verifiable.
- **Extract `StageTracker` to its own module (UI Convention Retrofit P1-T4, ORR-670, #248):** moved the interactive deal-stage stepper out of the 756-line `opportunity-detail-wrapper.tsx` into `components/opportunities/stage-tracker.tsx` (byte-identical markup; stays interactive per convention decision C1). No behaviour or visual change. Full genericisation into a shared `primitives/stepper.tsx` deferred to the recomposition, where it can be visually verified against the mock.
- **Canonical `<RecordHeader>` primitive (UI Convention Retrofit P1-T3, ORR-668, #247):** extracted the opportunity detail header (title + subtitle + actions slot + hairline stat strip) into shared `primitives/record-header.tsx` and adopted it in `opportunity-detail-wrapper.tsx` — removed the local `StatCell`, moved the header/stat markup behind `RecordHeader` with `stats`/`actions` props. Byte-identical markup; no behaviour or visual change. Stat strip keeps its hairline treatment (KpiCard unification deferred — different visual). Accounts/Contacts adopt in Phase 4.
- **Canonical read-only field primitive (UI Convention Retrofit P1-T7, ORR-667, #246):** promoted the opportunity wrapper's local `DField` into shared `DefinitionField` / `DefinitionFieldGrid` in `primitives/definition-grid.tsx` (label/value with `add`/`hide`/`dash` empty modes and the `+ Add` affordance), and adopted them in `opportunity-detail-wrapper.tsx` — removed the local `DField`/`isEmpty` and routed all field rows + the two hand-rolled `<dl>` grids through the primitive. Byte-identical markup; no behaviour or visual change.
- **Opportunity components use semantic color tokens (UI Convention Retrofit P1-T2, ORR-666, #245):** routed the remaining `amber-*`/`green-*` Tailwind literals in `opportunity-card.tsx`, `opportunity-detail-wrapper.tsx`, and `opportunity-splits-editor.tsx` to the existing `--warning`/`--success` tokens (`bg-warning/*`, `text-warning`, `text-success`). Redundant `dark:` amber variants dropped — the tokens carry their own dark values. Parity change only; no behaviour or layout change.

### CI

- **`scripts/ship-pr.sh` — retry the post-rebase head-check (#265):** after a rebase + force-push, GitHub lags a few seconds before the PR's `headRefOid` reflects the new commit; the one-shot check read the stale head and aborted (seen shipping #262). Poll the head up to ~30s until it matches local HEAD. Failed safe (no branch deleted) but needed a manual re-run — this makes the rebase path robust for concurrent merges.
- **`scripts/ship-pr.sh` — concurrent-safe PR shipper (#259):** encodes the safe merge sequence so multiple agents/SSH instances merge identically without the "blocked merge reported as success, branch deleted anyway" failure. Rebases-if-behind → verifies PR head == local HEAD → waits for CI → squash-merges → **confirms `state == MERGED` before deleting the branch** → mirrors `main` to the `nodwin` remote → watches the deploy, looping the rebase→merge across merge races. Documented in `AGENTS.md` §8.3.

### Docs

- **UI Convention Retrofit — Phase 1 baseline (ORR-664, ORR-665, #244):** added the canonical UI convention at `docs/ui-conventions.md` (canonical primitives, save model, token rules, banked decisions, open conflicts), preserved the signed-off Phase-0 discovery note at `docs/retrofit/phase-0-discovery.md`, and committed the three approved design mocks under `docs/retrofit/mocks/`. Resolves decision C2 (Orrin, 2026-07-12): the approved mocks are canonical, so Files becomes a facet tab (pinned RFP/Proposal/Contract slots on Overview), superseding the earlier Files-inline position. Docs only; no product code.

## 2026-07-11

### Added

- **REST API for external agents:** token-authed read endpoints (Phase 1, #224) and v1 write endpoints — create/update with activity logging (Phase 2, #229). Agent-integration guide added at `docs/rest-api.md` (#226), made explicit that it "works with any agent, not just Claude" (#228), plus NanoClaw wiring gotchas learned in practice (#227).
- **Cash-flow milestones:** `cashflow_milestone` table + RLS (Phase 1, #232) and working-capital derivation for milestones (Phase 2, #231). Data model + resolved decisions codified against the SOW (#230).
- **Finance admin section** with cost-of-cash settings (#225).
- **Grouped admin settings navigation** — the flat admin list regrouped into labelled, collapsible sections (Ticket A, #233).
- **Documents band on accounts** with a shared pinned-slots component (#221).

### Changed

- **Opportunity detail layout rebalanced (ORR-658, T-059):** wide column carries deal fields + a Communications tab group; the right rail holds compact summary cards. Documents promoted from a tab to an always-visible band under the stage bar (deliberate deviation from T-059 — deals here are document-centric). Layout only; no schema/RLS change (#219).

### Fixed

- Ingestion now reads file bytes from Supabase Storage and extracts PDF text (#220).
- Opportunities resolve contact + entity names — never show raw ids (#223).
- Removed duplicate chevron on admin section headers (#234).
- Sidebar **Admin** label now links to the `/admin` overview page; a separate chevron toggles the section list (previously clicking Admin only expanded/collapsed the menu) (#239).

### CI

- Apply DB migrations automatically on deploy (ORR-197, #222).

### Docs

- Reconstructed per-day changelog entries for June 17 – July 11 (#236).
- `AGENTS.md`: require a per-PR `CHANGELOG.md` entry — added a changelog step to §8.3 and a `## Changelog` field to the §8.4 PR template (#237).
- Documentation accuracy sweep — deploy/infra: corrected the "migrations are manual / not in the pipeline" claim across `supabase-environments.md`, `deploy/DEPLOYMENT.md`, `deploy/README.md`, and `SUPABASE-SETUP.md` (migrations auto-apply on deploy, ORR-197); README Supabase CLI `1.x`→`2.x` + `deploy.yml` listed (#240).
- Documentation accuracy sweep — runbook: reconciled `docs/runbook-incident.md` to the self-hosted VPS (Docker Compose restart not PM2; deploy apply-migrations not `pnpm db:migrate`; backup/restore flagged as TODO — Cloud-dashboard steps don't apply on self-host); fixed the §7 verification gate + `scripts/verify.sh` to curl port `3030` not `3002` (#241).
- Documentation accuracy sweep — feature-state: re-audited `docs/ROADMAP.md` to 2026-07-11 (several shipped features were still marked unbuilt); `docs/data-model.md` (drop `sales_initiator_user_id`, rewrite Documents for Supabase Storage, add the missing shipped tables); `docs/security.md` §8.3.1 (Confidential masking, custom Roles & Permissions, Entity Admin, tier-filtered RAG); `docs/integrations.md` (Drive import shipped); `BUILD_TICKETS.md` + `paperclip-org-chart.md` (secret-scan removed); `docs/rest-api.md` (sample now read+write) (#242).
- **Worktree guideline:** new `docs/WORKTREES.md` + `AGENTS.md` §11.5 — worktrees are keyed to a ticket (not a per-agent home), live under `~/crm-worktrees/<ticket>`, and are retired the moment their PR merges. Codifies the cleanup that removed 12 stale worktrees and ~180 merged branches, and documents why the legacy per-agent (Paperclip) layout was retired.

## 2026-07-10

### Added

- **Server-side document storage (ORR-653):** storage foundation — schema + bucket + RLS (Phase 1, #214); direct-upload data layer + server actions (Phase 1b, #215); Files module UI replacing the old Files tab (Phase 2, #216); import files from Google Drive into Storage (Phase 3, #217).
- **Full-width record editors** with shared form sections + multi-select across Opportunity/Contact/Account (#212).

### Fixed

- Drive import 404 — set Picker `appId` and support shared drives (#218).
- Stop clipping widget borders in the dashboard grid (#211).
- Editor sections expand on desktop, collapse on mobile, with a clearer toggle (#213).

## 2026-07-08

### Added

- Email/password login form (#199) and root redirect by auth state — dashboard vs login (#202).
- Notes-only composer on account & contact pages (#209).

### Changed

- Seed reworked to a real org scaffold + admin login; fake sample data dropped (#195).

### Fixed

- Select trigger labels resolve automatically (#201); EntityCombobox shows labels, never raw ids (#205).
- Default to light mode until a preference is set (#200).
- RSC-safe cookie writes on the server Supabase client (#207); root redirect must not write cookies (#206).
- Removed the `primary_contact` embed (no FK) (#208); allow creating a contact without filling socials (#203).

### CI/CD

- GitHub-hosted build → staging DigitalOcean VPS deploy pipeline (#194).

### Docs

- Supabase VPS setup + migration guide (#196); deploy docs reconciled to DigitalOcean self-hosted, off Vercel (#198).

## 2026-07-07

### Added

- **Customizable dashboard grid** — draggable/resizable per-user widget layout (#192).
- **Roles & Permissions administration** — custom roles + permission matrix (#193).
- Dashboard: summary strip + Conversion-by-Stage funnel (#189); Team Leaderboard widget (#190).
- Saved views for the opportunity list (#191).

### Docs

- README refresh (#178).

## 2026-07-06

### Added

- **Design system foundation (ORR-651):** warm neutrals, semantic + 7-stage tokens, Inter, base primitives (#179).
- **Opportunity detail read view** — high-fidelity redesign (ORR-646, #177).
- **AI Deal Copilot** — summarize / draft follow-up / next best action (#182).
- **Revenue forecasting & rep scorecards** (#183).
- Split **Pipeline** (my deals) from **Opportunities** (all) (#181).
- Pipeline per-stage column totals — count / value / weighted (#184); deal-card health signals — overdue / stale / days-in-stage (#187).
- Dashboard: quarter forecast tile (#186); "Needs my attention" widget (#185).

### Fixed

- `selectForecastTile` moved to a server-safe module to fix the RSC boundary (#188).
- Honour the user's date-format preference (#176).

### Docs

- Repo-wide accuracy refresh; documented single production environment (#180).

## 2026-07-05

### Added

- Admin AI providers page — provider selection + endpoint/key wiring (ORR-635, #172).
- Stuck Deals dashboard widget + admin thresholds (ORR-103, #173).

### Fixed

- Multi-approver RPC materialization, xState bridge, and UI (#168).
- Consistent page headers across all admin screens (#174).
- Honour the user's number-format preference, defaulting to international (#175).
- **Audit high-priority fixes (#171):** re-assert the Confidential fence, atomic split/team write RPCs, `SET NULL` on user-delete FKs, and flaky-test stabilisation.

## 2026-07-04

### Added

- **Document ingestion worker (ORR-620):** pgvector semantic index (ingestion only) (#165).
- **Cross-deal knowledge search (ORR-621):** tier-filtered retrieval over a self-hosted RAG stack (#166).
- **Approvals:** template-layer schema (ORR-608 Phase 0, #161); mandatory approval gate before Closed Won (ORR-604 Phase 3c, #158); email/notify the current approver on their turn (Phase 3d, #159); `ApprovalCard` on opportunity detail (ORR-610, #163); admin GUI + enforce-gate (ORR-611 Phase 3, #162).
- Configurable email transport — SMTP or Resend, set in the admin panel (#160).

### Security

- Closed a Standard-tier leak in knowledge search that shipped in #166 (#167).

### Removed

- Dead "Create Jira Issue" button on opportunities (#164).

## 2026-07-03

### Added

- **Per-user settings page** + display-currency preference (ORR-615, #139).
- **Two-tier admin RBAC:** Entity Admin role + entity-scoped settings RLS (ORR-618, #142); Entity Admins manage their own entity's users (ORR-619, #145).
- **Users & Roles admin** — role / entity / manager / status (ORR-617, #141).
- **Org reporting currency** (group + per-entity) as the FX single-source (ORR-616, #140).
- Allowed sign-in domains admin GUI (ORR-612, #136).
- **Approvals:** opportunity approval write path per business entity (ORR-604 Phase 1, #154); manager-based, entity-firewalled approvers (Phase 3a, #156); admins reassign / cancel in-flight approvals (Phase 3b, #157); admin GUI to author per-entity workflows (Phase 2, #155).
- Opportunities: tabbed communications + real approval history on detail (ORR-613, #137); drag anywhere on a kanban card + clickable title/company links (ORR-609, #133).
- Contacts: contact fields on the detail read view (ORR-614, #138).
- Accounts: company-tree visualisation wired into detail (ORR-611, #135); structured tax IDs — `account_tax_ids` + `tax_id_types` (ORR-622, #147); country-driven structured Tax IDs on the form (ORR-623, #152); attach multiple contacts from the account page (ORR-624, #153).

### Fixed

- `account_tax_ids` SELECT mirrors parent read with a `deleted_at` guard (#150).
- Atomic revenue-schedule replace — fixes a data-loss window (#151).
- Removed leaked developer UI from the account form (#146); dropped the redundant "Custom Fields" heading inside named sections (#144).

### Docs

- v1 build roadmap / SOW gap-map (#134).

## 2026-07-02

### Added

- Opportunity list search, filter, and sort (Tier 1 #1, #121).
- Kanban card intelligence — column totals + hot/overdue badges (Tier-1 #2, #127).
- Log activities from the contact view (Tier-1 #3, #125); activity timeline on account detail (ORR-606, #130).
- RLS: reps can create and edit their own accounts and contacts (ORR-608, #132).

### Fixed

- Let an owner read back their own opportunity — unbreaks rep deal creation (ORR-605, #129).
- Stop `/opportunities/[id]` 500 by dropping the broken stage-history embed (#123).
- Consolidated to a single sidebar-wrapped dashboard at `/dashboard` (#126).
- Audit reads PostgREST `request.headers` as an object, not an array (ORR-604, #128).
- Unwrap PostgREST `[{count}]` embeds so `/accounts` stops 500ing (#122).

### CI

- Stop `supabase-start` flaking — exclude heavy services + retry once (ORR-600, #124).

## 2026-07-01

### Added

- OpenAI-compatible AI gateway + `pg_cron` scaffold (ORR-600 #5+#6, #120).
- RBAC (DB-backed role + domain reconcile) + Confidential-tier masking (ORR-600 #2+#3, #119).

### Changed

- Wire up opportunity detail components; fix seed & opportunity-form tests (ORR-600, #115).

### Fixed

- Resolved schema drift — strict DB types vs `Record<string, unknown>`, UI types, and test mocks (ORR-587).

### CI

- Run checks as parallel jobs under a "CI Pipeline" aggregator (ORR-600, #118).
- Removed secret scanning (license issue; scope cut for now).

> Note: `main` was consolidated on this date (the `temp-main-merge` integration), which is why the June 17–19 work below carries a July 1 commit date on `main`.

## 2026-06-19

### Added

- Opportunity create/edit form + Salesforce-style detail page (ORR-545 / ORR-554 / ORR-555, #100, #101, #102).
- New opportunity fields — service type, property type, barter value, entity sales id (ORR-553 / ORR-554).
- Seed v1 account custom fields into `field_definitions` (ORR-549, #99); EntityCombobox gap-fills (ORR-542, #98).
- Migration filename validator + CI wiring (ORR-580, #105, #110); auto-generated TS types from the Supabase schema (Phase 3A); verification safety nets — `AGENTS.md` §7 + `verify.sh` (ORR-578).

### Removed

- `sales_initiator_user_id` removed across DB, data layer, types, and docs (ORR-553 / ORR-556 / ORR-588).

### Fixed

- Resolved migration conflicts and policy dependency order; normalised future-dated migration filenames to 2026-06-19; corrected `SECURITY DEFINER`/`INVOKER` on the `set_opportunity_owner_default` trigger.
- Regenerated malformed fake UUIDs in the sandbox seed (ORR-589); resolved schema drift (ORR-587).

### Tests

- `service_role` RLS tests for `data_management` policies (ORR-584); tests for the new opportunity fields (ORR-554 / ORR-576).

## 2026-06-18

### Added

- **Companies:** companies list page + sidebar nav (ORR-466) and company detail (ORR-467) (#81, #82).
- **Schema build-out:** `opportunity_revenue_schedule` for custom recurring revenue splits (ORR-491); Data Management schema — `finance_export_config` + `import_jobs` (ORR-527); financial settings tables — `reporting_currency_settings`, `fiscal_year_settings`, `approval_thresholds`, `revenue_recognition_defaults`; integration config — `integration_settings`, `slack_connections`, `email_settings`, `salesforce_connections` (ORR-518, #92); entity branding columns + `relationship_types` lookup + enum→text FK migration (ORR-512); `deleted_at` soft-delete on accounts.
- **Notification engine (ORR-525):** data access layer, delivery engine, triggers, and server actions (#95); notification/comms schema (ORR-524, #93); Data Management UI (ORR-529, #94).
- Currency conversion helper (ORR-474); dashboard wired to the shared metrics module with reporting currency (ORR-463, #83).
- `EntityCombobox` reusable search-or-create picker (ORR-542, #97); extended opportunity create contract with §4.6 fields (ORR-544).

### Fixed

- Wired `metrics.ts` and `reports.ts` to actually convert foreign currencies via `convert.ts` (ORR-456).
- Cascade-delete trigger skips splits-sum validation (ORR-490); fixed `generateFlatSchedule` spec deviation + naming (ORR-494); wrapped `Menu.Positioner` in `Menu.Portal` (ORR-497); fixed mobile rendering of the app shell + opportunities layout (#96); typecheck/lint/test cleanup (ORR-475).
- Require `NODE_ENV !== production` before using the `service_role` key; hide Google OAuth in local-preview + add LAN `allowedDevOrigins` (ORR-380).

### Tests

- Expanded visibility tests 38 → 56 covering cross-entity, tier, owner, split-BU, and write-denial (ORR-486).

### Docs

- Startup guide `docs/startup-guide.md` and setup-guide OAuth polish (ORR-408, #88); `.env.example` with auth/SMTP/integration variables; smoke-test procedure `docs/smoke-test.md` + local-preview branch guard, migration step, and 3-check smoke (ORR-452).

## 2026-06-17

### Added

- `fx_rates` table with migration, RLS policies, and tests.
- CRM app shell / sidebar scaffolding landed (ORR-432, #80).

## 2026-05-08

### Added

- **Vercel deployment guide (ORR-390):** `docs/deploy-vercel.md` — comprehensive setup instructions mirroring the GitHub CI pipeline. Covers project creation, environment variables, DNS, Google OAuth callback configuration, per-environment settings, migration strategy, and troubleshooting. README deployment section updated to link to the new guide.

## 2026-05-06

### Added

- **AI provider adapters (ORR-177):** Five provider adapters shipped — Anthropic (Messages API), Gemini (Generative Language API), DeepSeek, Moonshot/Kimi, and Ollama. Env-driven factory (`createAdaptersFromEnv`) with AbortController + 30s timeout on all providers. Cap enforcement via `lib/ai/cap-enforcement.ts` with per-user/team/company ceilings, tested at $1 cap boundary.
- **Multi-approver vote aggregation (ORR-132):** XState approval state machine supporting `any_one` and `all_required` modes across sequential steps. Handles per-approver voting, skip, rejection.
- **Deal-stage state machine (ORR-178):** XState deal-stage machine with forward/backward/force/reopen transitions and stage history tracking.
- **Security review findings (ORR-177):** Gemini API key moved from URL query param to `x-goog-api-key` header. URL encoding fixes. AbortController + 30s timeout to all providers. `audit.ts` actor_source detection improved.

### Fixed

- **Activities RLS policies tightened (ORR-262):** CEO-reviewed tightening of activities SELECT/INSERT/UPDATE policies.
- **Audit log restricted to admin-only (ORR-273):** Previously any authenticated user could read the full audit trail (IPs, user agents, field diffs). Now restricted via `current_user_role()` check.
- **PM2 config (ORR-133):** Switched to `pnpm --filter web start` for correct workspace compatibility.

### Security

- RLS policies for `activities` and `audit_log` tables hardened against unauthorized read/insert/update.
- External security review findings (Gemini key in URL, missing timeouts, audit source gaps) remediated.

## 2026-05-04

### Added

- Queue Phase 9.5 (MCP server) for post-East-Asia rollout. Add `{ user, source }` parameter requirement to `lib/data/` functions in preparation.
</content>
</invoke>
