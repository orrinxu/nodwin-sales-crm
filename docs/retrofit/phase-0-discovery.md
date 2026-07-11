# Phase 0 — Discovery Note: UI Convention Retrofit (Settings + Opportunities)

**Status:** Discovery signed off 2026-07-11. Blocking decisions resolved (see §7). Still needed before Phase-1 *layout* tickets: the approved mocks (§0). G2/G3 resolve at their phases.

**Resolved 2026-07-11 (Orrin):**
- **G1 → unified unsaved-changes bar**, app-wide. Autosave surfaces (Notifications, Appearance) convert to the bar.
- **C1 → keep the stepper interactive.** `StageTracker` stays the click-to-move-stage control; the convention doc (P1-T1) will be amended to permit an interactive lifecycle stepper (overrides the brief's "display only").
- **C2 → keep files inline.** Honor the repo's deliberate T-059 reversal; Files does **not** become a facet tab. Logged as a conscious deviation from brief P2-T2/T5.
- **C3 → accepted:** build canonical primitives, adopt in Opportunities + Settings only; accounts/contacts keep current markup until their Phase-4 retrofit.
**Repo:** `orrinxu/nodwin-sales-crm` · read from origin/main @ `6b9aca5` · web app `apps/web`.
**Method:** three read-only passes (Opportunities detail, Settings, shared UI primitives). No code changed.

> **TL;DR.** Token discipline is genuinely strong (Tailwind v4, CSS-first, oklch tokens — the only real color debt is `amber-*`/`green-*` literals in a handful of opportunity components; settings is clean). The actual debt is **hand-rolled detail-page primitives**: 3 divergent record headers, 3 field renderers, a real Tabs primitive sitting next to 1 manual tab bar, and **no shared save mechanism at all** (four different patterns). That last point is why **G1 blocks everything** — and it must be decided against the fact that today's saves are genuinely *mixed* (explicit buttons + autosave + modal submit). Two places where the **repo contradicts the brief** are flagged in §6 — per the brief, the repo wins and we stop.

---

## 0. Blockers surfaced immediately

- ⚠️ **Approved mocks are not in the repo.** `settings-top-tabs.html`, `opportunity-reorganized.html`, `opportunity-tabs.html` are absent from the worktree and the home dir. Discovery is not blocked (existing pages are the behaviour spec), but Phase 1 layout work needs them so we retrofit toward the approved direction. **Need these files.**

---

## 1. Component inventory — shared UI touched by Settings / Opportunities

### 1a. The canonical shared library (`components/ui/*`, `components/primitives/*`)

| Concern | Existing primitive | Notes |
|---|---|---|
| Tabs | `ui/tabs.tsx` (Base UI: `Tabs/TabsList/TabsTab/TabsPanel`) | **The** tab primitive. Not the usual shadcn `TabsTrigger/TabsContent` names. |
| Card | `ui/card.tsx` (Card/Header/Title/Description/Action/Content/Footer) | Used everywhere. |
| Fields (read-only) | `primitives/definition-grid.tsx` (semantic `<dl>`) | **Exists but barely used** — detail pages hand-roll instead. |
| Fields (editable) | `forms/form-section.tsx` (`FormSection`) | Already shared across all 3 record editors — the editable side is solved. |
| Toggle | `ui/switch.tsx` | Base UI switch. |
| Select / searchable | `ui/select.tsx`, **`ui/combobox.tsx`** (searchable), `ui/multi-select.tsx`, `entity-combobox.tsx` | A searchable combobox **already exists** (relevant to the timezone parity item). |
| Dialog / Sheet | `ui/dialog.tsx`, `ui/sheet.tsx` | Record edit forms render in a Sheet; opportunity edit uses `forms/record-edit-dialog.tsx`. |
| Badge | `ui/badge.tsx` (cva), `primitives/{stage,status,tag}-badge.tsx` | Several ad-hoc tinted pills bypass these (see §3). |
| Section header | `primitives/section-header.tsx` | Page/section header — **not** a record header. |
| KPI/stat | `primitives/kpi-card.tsx` | The opportunity stat strip hand-rolls `StatCell` instead of reusing this. |

There is **no** shared `Form`/`Field` primitive, **no** `ReadOnlyField`, **no** `RecordHeader`, **no** save-bar / dirty-state hook, and **no** right-rail layout component.

### 1b. Opportunities detail (`components/opportunities/*`)

Whole UI is one 756-line client component, `opportunity-detail-wrapper.tsx`; the `[id]/page.tsx` RSC only loads data and **injects every server action as a prop** (the key seam for recompose). In-file presentational primitives (module scope): `StatCell`, `DField`, `DefinitionCard`, `RelatedListCard`, `ApprovalPill`, `IntegrationTabEmptyState`, `StageTracker`, plus a local `T` type-scale object. Child components: `OpportunityForm`, `ActivityComposer`, `ActivityTimeline`, `OpportunitySplitsEditor`, `OpportunityTeamEditor`, `StageHistoryTimeline`, `ApprovalCard`/`History`/`DecisionBox`/`AdminControls`, `DealCopilot`, and the documents trio `FilesModule` / `DriveImportButton` / `PinnedDocumentSlots`.

### 1c. Settings (`components/settings/*`)

Two routes, no `layout.tsx`. `/settings` = one `max-w-3xl` scroll of Cards; section components are **local functions inside `settings-view.tsx`** (`ProfileSection`, `LocalizationSection`, `NotificationsSection`, `AppearanceSection`, `IntegrationsSection`, `SecuritySection`, `SavedIndicator`). Tokens live on a **separate route** `/settings/api-tokens` (`api-tokens-view.tsx`). No shared field/row/save-bar abstraction — every field row, toggle row, card header, and save lifecycle is inlined.

---

## 2. Extend-vs-replace matrix

| Phase-1 primitive | Existing basis | Verdict | Action |
|---|---|---|---|
| **`<FacetTabs>`** (P1-T5) | `ui/tabs.tsx` + the underline restyle at `opportunity-detail-wrapper.tsx:635-682` | **Extend** | Promote the underline-facet styling into the primitive; add route-sync + gated/locked tab state + rail slot. |
| **`<Stepper>`** (P1-T4) | `StageTracker` (`opportunity-detail-wrapper.tsx:244-318`) — well-built, `aria-current`, reduced-motion aware | **Extend** — but see **§6 conflict**: it's *interactive* today, brief says display-only | Extract; resolve interactivity question first. |
| **`<RecordHeader>`** (P1-T3) | 3 divergent headers: opportunity (`:474-525`, has stat strip), account (`:121-167`), contact (`:72-100`) | **Replace/absorb** — but 2 of the 3 are **parked pages** (§6) | Build canonical; adopt in **opportunities only** now; account/contact adoption deferred to Phase 4. Stat strip should reuse `primitives/kpi-card.tsx`, not `StatCell`. |
| **`<SaveBar>`** (P1-T6, implements **G1**) | No shared mechanism. Best prior art: admin `role-matrix.ts:43-52` dirty-diff + "n changed" indicator | **Build net-new** | Blocked on **G1**. |
| **`<ReadOnlyField>` + editable treatment** (P1-T7) | `primitives/definition-grid.tsx` (shared, unused) + `DField` (opp, most advanced) + contact `Field` + account raw inline `<dl>` | **Extend** `DefinitionGrid` / promote `DField` | Editable side already exists (`FormSection`). |
| **Token layer** (P1-T2) | `app/globals.css` (Tailwind v4 `@theme inline`, oklch tokens, 7-stage ramp, injectable brand band) | **Extend** — small | Route `amber-*`/`green-*` literals → existing `--warning`/`--success`/stage ramp (see §3). |
| **Right-rail layout** (implied by P1-T5 rail slot) | Only opportunity has one (`:687`, magic `lg:w-[372px]`) | **Build net-new** | `<RecordLayout>` with rail slot, modeled on opportunity. |
| **Editable-rows editor** (implied, P2-T7) | `OpportunitySplitsEditor` ≈ `OpportunityTeamEditor` (near-identical) | **Replace with one** | See §3. |

---

## 3. Duplicate & near-duplicate flags (where drift already lives)

**Opportunities**
- **Two table editors** — `OpportunitySplitsEditor` and `OpportunityTeamEditor` are structurally near-identical (same `useState(items)` + add/remove/update + error banner + bordered rows + Add/Save footer). → one shared editable-rows primitive.
- **Raw `<select>` styling string** duplicated inline in splits-editor, team-editor, and hoisted as `SELECT_CLASS` in `approval-admin-controls.tsx` — none use `ui/select`.
- **`formatBytes` / `formatDate` duplicated verbatim** across `files-module.tsx` and `pinned-document-slots.tsx`; **`CATEGORY_LABELS`/`PINNED_LABELS` maps** likewise.
- **Two timeline implementations** — `ActivityTimeline` vs `StageHistoryTimeline` (same visual pattern, built twice).
- **Two `Tabs` bars, different styling** — Communications (underline) vs composer Note/Call (default pill).
- **Ad-hoc tinted pills** — `ApprovalPill` (`:197-212`) and `VisibilityTierBadge` (pinned-slots) reimplement badge tone logic instead of `ui/badge`.
- **`CARD_HEADING` type token** re-declared in `deal-copilot.tsx:22` (dupes the wrapper's local `T.cardHeading`); the whole `T` scale is wrapper-local and not shared with children.

**Settings**
- **Five hand-rolled save lifecycles** — the `SaveState` + try/catch + Button + `SavedIndicator` pattern is copied in Profile, Localization, Appearance, and re-done differently in Notifications and Tokens. → strongest `<SaveBar>` consolidation case.
- **Field-row markup** (`grid gap-1.5` + Label + control) repeated ~11×; **card-header pattern** repeated in every section with inconsistent title sizing between `settings-view` (`text-base`) and `api-tokens-view` (`text-sm`).
- **Near-identical currency `<Select>`s** (display vs entry, differ only by sentinel default).
- **Three separate "row with trailing control/badge" layouts** (notification toggles, integration rows, token rows).
- **Two independent page shells** (`max-w-3xl p-6` + `<h1>` + subtitle) — no shared settings layout.

**Cross-app**
- **Manual tab bar** in `accounts/attach-contacts-dialog.tsx:28-31` (local `tabClass`) duplicates the opportunity facet-tab look → should become `<FacetTabs>` (but it's on a **parked** surface — adopt later).
- **Three divergent record headers** and **three divergent field renderers** (see §2).

---

## 4. Data + routing map

### Opportunities
- **Route:** `app/(crm)/opportunities/[id]/page.tsx` (RSC) → one `Promise.all` loads opportunity, business units, activities, splits, team, stage history, user options, approvals + action-state + gate status, copilot-configured flag, documents → passes **data + all server actions as props** into `OpportunityDetailWrapper`.
- **Server actions:** `opportunities/actions.ts` (update, updateStage, updateSplits, updateTeam, createActivity, approvals) — Zod-validated + `revalidatePath`; `copilot-actions.ts` (3 AI actions).
- **Documents:** `listDocumentsForEntity(ctx,{opportunityId})` in RSC; download/delete/category via `documents/actions.ts`; **upload bypasses server actions** — bytes go straight to signed Storage URL via `lib/documents/client-upload`.
- **Layout today (single scroll):** header + stat strip → `StageTracker` → conditional gate banner → 2-col (left: pinned docs · FilesModule · 3 DefinitionCards · Description · System info · Communications tabs; **right rail** `lg:w-[372px]`: Approval · Team · Splits · Stage History · Copilot).

### Settings
- **Routes:** `/settings` (`page.tsx` → `SettingsView`) and **separate** `/settings/api-tokens` (`page.tsx` → `ApiTokensView`). No `layout.tsx`; no tab/`?tab=` state. Sidebar links both (`sidebar.tsx:202-203`).
- **Server actions (`settings/actions.ts`, `api-tokens/actions.ts`):** `updateProfileAction` (writes **two stores** — `full_name` on `users`, `job_title` on `user_preferences`), `updateLocalizationAction` (revalidates `/settings`,`/dashboard`,`/reports` — display currency drives rollups), `updateNotificationOverrideAction` (userId forced server-side), `updateAppearanceAction`, `createApiTokenAction`, `revokeApiTokenAction`.
- **Sections on `/settings`:** Profile · Localization · Notifications · Appearance · Integrations · Security. Tokens on the other route.

---

## 5. Parity-risk list (behaviours most likely to break in recompose)

| Risk | Current behaviour (must preserve) | Where |
|---|---|---|
| **Stage moves** | Click-to-set pipeline; guarded by `updatingStage`; terminal stages disable tracker; errors only `console.error`'d (no toast today) | wrapper `:441-452`, `StageTracker :244-318` |
| **File upload + Drive import** | Upload bytes → signed Storage URL (not through Next); Drive Picker (`drive.file` scope, native docs → PDF, keeps Drive id); per-row re-tag/download/delete (optimistic); Drive button hidden if Google env absent | `files-module.tsx`, `drive-import-button.tsx` |
| **Splits 100% rule** | **Display-only** — total colored green at exactly 100 else destructive; `handleSave` does **not** block on ≠100 (only drops rows missing `salesUnitId`). Any server enforcement is separate. *Do not "fix" into a hard block — that's a behaviour change.* | splits-editor `:45,72,174-190` |
| **Activity logging** | Notes/Calls tabs are **client filters** of one `activities` array; Email tab is an unbuilt empty-state; Stage-history is a **separate** feed | wrapper `:412-413,635-682` |
| **Notification saves** | Autosave per toggle; optimistic + **revert-on-failure**; default-ON when no override; **Slack column dead** (disabled/"coming soon") | `settings-view.tsx:298-361` |
| **Token generate / revoke** | Generate = **one-time reveal** + copy; **revoke has NO confirm** (single click) | `api-tokens-view.tsx:39-70,88-109` |
| **Profile / Localization saves** | Explicit Save buttons; profile dual-store write + required-name validation; localization sentinel encoding + multi-path revalidate | `settings-view.tsx`, `actions.ts` |
| **Approval submit / decision** | Submit gated on `canSubmitApproval`; decision box only for `actionableStepId`; admin controls gated on `canAdmin && pendingInstanceId`; gate banner deep-links `#approval-history-section` | wrapper `:359-410,498`, `approval-card.tsx` |
| **Deal Copilot** | Card mounts only if all 3 action props present **and** `configured`; email draft editable + copy | `deal-copilot.tsx:44-98` |

---

## 6. ⚠️ Brief-vs-repo conflicts — STOP and flag (repo is source of truth)

**C1 — Stepper: display-only (brief) vs interactive stage-mover (repo).**
Brief P1-T4 specifies `<Stepper>` **display only**, and the convention says "stepper = lifecycle, never render stages as tabs." But today's `StageTracker` **is the stage-move control** — each segment is a button firing `updateStageAction`. Parity requires stage moves to keep working. So a display-only stepper needs the stage-move interaction to live *somewhere* (e.g. an explicit "Move stage" control, a menu on the header, or the stepper stays interactive and we amend the convention). **This is a genuine design decision, not a mechanical extract.** → resolve before P1-T4 / P2-T1.

**C2 — Files as a tab (brief) vs files inline, deliberately (repo).**
Brief P2-T2/T5 put **Files** in a facet tab. But `opportunity-detail-wrapper.tsx:563-565` carries an explicit comment that files were **deliberately kept inline** (not a tab), reversing spec **T-059**, because these deals are document-centric (pinned RFP/Proposal/Contract slots + full manager up front). Per the brief's own rule ("repo is source of truth; where they conflict, stop and flag"), I'm flagging rather than silently moving files into a tab. → decide before P2-T2/T5.

**C3 (scope tension, not a contradiction) — shared primitives vs "don't touch parked pages."**
`<RecordHeader>`, `<ReadOnlyField>`, and `<FacetTabs>` have their best/duplicate implementations spread across **accounts** and **contacts**, which are **parked** (Phase 4, "do not touch"). Fully honoring "reuse or replace, never duplicate" would mean editing parked pages. **Proposed resolution:** build the canonical primitives and adopt them in **Opportunities + Settings only** now; accounts/contacts keep their current markup until their own Phase-4 retrofit. This does temporarily leave two dialects for those primitives on parked surfaces — a conscious, logged exception to the no-duplicate rule. → confirm this is acceptable.

---

## 7. Decision gates — framed with what the code does today (Orrin owns)

**G1 — Save model (blocks all of Phase 1).** Today is **mixed**, not one model:
- Explicit Save buttons: Profile, Localization, and the record edit **modal/sheet** forms (opportunity/account/contact).
- Autosave: Notifications (per toggle, optimistic+revert), Appearance/theme.
- Inline save buttons: Splits, Team.
- Best dirty-state prior art: admin `role-matrix.ts` ("n changed" + Save disabled-when-clean).

*Trade-off:* **"Unified unsaved-changes bar"** fits the form/section + modal model and the admin prior art, and is a smaller behaviour change; **"autosave-everywhere"** would regress the explicit-save UX of Profile/Localization and complicate the modal editor. **My recommendation: unified unsaved-changes bar** — but this is your call, app-wide.

**G2 — Team & Splits: facet tab vs right rail.** Currently in the **right rail**; brief P2-T7 wants them **moved into tabs** (rail slimmed to Approval + Copilot). Confirm the tab destination (likely the Team & Splits tab in P2-T2).

**G3 — Tokens vs MCP token: same mechanism or two surfaces?** API tokens exist at `/settings/api-tokens` (generate one-time reveal, revoke no-confirm). The MCP token (MCP v1.5 SOW) is a separate concept. Need your call: one Tokens tab covering both, or two surfaces (and whether the Integrations MCP row deep-links into the Tokens tab). Gates P3-T6 (isolated PR).

**G4 — Cash Plan entry.** Confirmed as **tab entry + locked state only** — does *not* reopen the full-screen Deal Confirmation decision. (No Cash Plan UI exists on the detail page today beyond a disabled "Set Revenue Schedule — Coming soon" header button at wrapper `:474-514`.)

---

## 8. Additional parity gaps the retrofit is expected to close (from the brief, confirmed against code)

- **Timezone** is a **free-text `<Input>`** (`settings-view.tsx:241`), not searchable. `ui/combobox.tsx` already exists to satisfy P3-T3's "searchable select."
- **Token revoke** has **no confirm** today; P3-T6 wants revoke-confirm (a behaviour *addition* — log in CHANGELOG).
- **Notifications Slack** is a **dead per-row toggle** ("coming soon"); P3-T4 wants "Soon" in the header, not dead per-row toggles.
- **Inbound-email** address renders as a raw mono `<p>` with **no explainer / no copy** (`settings-view.tsx:147`); P3-T2 wants explainer + copy.
- **Homeless sections:** Appearance / Integrations / Security live on `/settings` but aren't in the four target tabs — they need a destination (extra tabs? folded into Profile? Integrations→links to Tokens per G3?). → decide during P3-T1.

---

## 9. Proposed Phase-1 sequencing (for sign-off)

Build order that minimizes parked-page contact and front-loads the gated primitive:
1. **P1-T1** convention doc (no code) — can start now.
2. **P1-T2** token pass (route `amber/green` literals) — independent, low risk.
3. **P1-T7** field primitives → **P1-T3** RecordHeader → **P1-T5** FacetTabs (opportunities-first adoption).
4. **P1-T4** Stepper — **gated on C1**.
5. **P1-T6** SaveBar — **gated on G1**.

Each ships behind the Phase-1 fence (no feature-page behaviour change; temporary adapters if needed).
