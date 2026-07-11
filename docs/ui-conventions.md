# UI Conventions — Nodwin Sales CRM

**Status:** Phase 1 baseline (ORR-665). This is the canonical UI convention the
**UI Convention Retrofit** ([ORR-664](/ORR/issues/ORR-664)) recomposes **Settings**
and **Opportunities** onto. It names the primitives that are canonical, the ones
being retired, and the cross-cutting rules (tokens, save model, tabs, stepper).

**Guardrails (from the brief, Orrin 2026-07-11):**

- **Parity with today's behaviour is the acceptance bar — retrofit, not rebuild.**
  Every recompose must preserve the behaviours listed in
  [`docs/retrofit/phase-0-discovery.md`](retrofit/phase-0-discovery.md) §5.
- **Scope now = Opportunities + Settings only.** Accounts, Contacts, and Admin are
  **parked** (Phase 4). Do not edit them to satisfy the no-duplicate rule — see §6 (C3).
- **Repo is the source of truth over the brief and the mocks.** Where they conflict,
  **stop and flag** (see §7) rather than silently picking a side.
- **One ticket = one PR**, branch `feat/orr-NNN-…`.

Design targets live in [`docs/retrofit/mocks/`](retrofit/mocks/):
`opportunity-reorganized.html` (the chosen opportunity layout), `opportunity-tabs.html`
(tabs + stage-bar variant), `settings-top-tabs.html` (settings top-tab nav).

---

## 1. Canonical primitives

Use these. Do not hand-roll a local equivalent inside a feature component. Paths are
under `apps/web/components/`.

| Concern | Canonical primitive | Notes |
|---|---|---|
| Tabs | `ui/tabs.tsx` (Base UI: `Tabs` / `TabsList` / `TabsTab` / `TabsPanel`) | **The** tab primitive. Note the Base-UI names (`TabsTab`/`TabsPanel`), **not** shadcn's `TabsTrigger`/`TabsContent`. |
| Card | `ui/card.tsx` (`Card` / `Header` / `Title` / `Description` / `Action` / `Content` / `Footer`) | Every panel/section is a `Card`. |
| Read-only fields | `primitives/definition-grid.tsx` (semantic `<dl>`) | Canonical — extend this; stop hand-rolling `DField`/inline `<dl>` (see §2). |
| Editable fields | `forms/form-section.tsx` (`FormSection`) | Already shared across all three record editors. The editable side is solved — reuse it. |
| Record edit surface | `forms/record-edit-dialog.tsx` | Opportunity/account/contact edit dialogs. |
| Toggle | `ui/switch.tsx` | Base UI switch. |
| Select / searchable | `ui/select.tsx`, `ui/combobox.tsx` (searchable), `ui/multi-select.tsx`, `entity-combobox.tsx` | A searchable combobox **already exists** — use it instead of a free-text input for large option sets (e.g. timezone). Never inline a raw styled `<select>`. |
| Dialog / Sheet | `ui/dialog.tsx`, `ui/sheet.tsx` | |
| Badge / pill | `ui/badge.tsx` (cva) + `primitives/{stage,status,tag}-badge.tsx` | All tinted pills route through these — no ad-hoc tinted `<span>`s. |
| Page/section header | `primitives/section-header.tsx` | This is a **page** header, not a **record** header (see §3). |
| KPI / stat cell | `primitives/kpi-card.tsx` | The opportunity stat strip must reuse this, not a local `StatCell`. |

### 1a. Primitives to be **built** in this retrofit (net-new, tracked separately)

These do not exist yet and are being introduced by later Phase-1 tickets. Listed here
so nothing hand-rolls a fourth variant in the meantime:

- **`<RecordHeader>`** — one canonical record header (title + probability + actions + stat
  strip). Absorbs the three divergent headers (opportunity/account/contact); adopted in
  **Opportunities only** now.
- **`<FacetTabs>`** — the underline-facet tab treatment, built on `ui/tabs.tsx`, with
  route-sync + gated/locked-tab state + rail slot.
- **`<Stepper>`** — extracted from `StageTracker`; **stays interactive** (see §6 C1).
- **`<SaveBar>`** — the unified unsaved-changes bar implementing the save model (§4).
- **`<RecordLayout>`** — content + persistent right-rail (modeled on today's opportunity rail).
- **one editable-rows editor** — replaces the near-identical Splits/Team editors.

---

## 2. What to stop hand-rolling

The real debt (per discovery §3) is duplicated detail-page primitives. When you touch a
component in scope, migrate it off these:

- **Field renderers** — three today (`DField` in opportunities, contact `Field`, account
  raw inline `<dl>`). Canonical = extend `primitives/definition-grid.tsx`.
- **Record headers** — three divergent headers. Canonical = `<RecordHeader>` (§1a).
- **Save lifecycles** — five copies of the `SaveState` + try/catch + button + `SavedIndicator`
  pattern in Settings, plus inline saves in Splits/Team. Canonical = `<SaveBar>` (§4).
- **Tinted pills** — `ApprovalPill`, `VisibilityTierBadge`, and other ad-hoc tone logic.
  Canonical = `ui/badge.tsx` + `primitives/*-badge.tsx`.
- **Duplicated helpers** — `formatBytes` / `formatDate` are duplicated verbatim across
  `files-module.tsx` and `pinned-document-slots.tsx`; `CATEGORY_LABELS` / `PINNED_LABELS`
  likewise. Hoist to a shared util, don't copy.
- **Raw `<select>` class strings** — duplicated in splits-editor, team-editor, and
  `SELECT_CLASS` in `approval-admin-controls.tsx`. Use `ui/select`.
- **Local type-scale tokens** — the wrapper-local `T` object and the re-declared
  `CARD_HEADING` in `deal-copilot.tsx`. Use shared type tokens, not per-file scales.

---

## 3. Naming & structure conventions

- **Tabs use the Base-UI names** from `ui/tabs.tsx` (`TabsTab`, `TabsPanel`). Do not
  introduce shadcn-style `TabsTrigger`/`TabsContent`.
- **"Section header" ≠ "record header."** `section-header.tsx` is for page/section titles.
  A record's title + key actions + stat strip is `<RecordHeader>` (§1a).
- **Detail pages are RSC + one client wrapper.** The opportunity route
  (`app/(crm)/opportunities/[id]/page.tsx`) loads data and injects server actions as props
  into a single client wrapper — keep that seam; recompose *inside* the wrapper.
- **Stat strips reuse `kpi-card.tsx`**, not per-page stat cells.

---

## 4. Save model — unified unsaved-changes bar (G1)

App-wide, the save model is a **single unified unsaved-changes bar** (`<SaveBar>`), **not
autosave**. This is a banked decision (G1).

- Dirty state is tracked per form/section; the bar appears when there are unsaved changes
  and offers **Save** / **Discard**. Best existing prior art for the dirty-diff is admin
  `role-matrix.ts` ("n changed" + Save-disabled-when-clean).
- **Autosave surfaces convert to the bar.** Notifications (per-toggle optimistic+revert) and
  Appearance/theme move onto the bar model.
- Parity note: this must preserve the current explicit-save UX of Profile/Localization and
  the modal/sheet editors — it is the *smaller* behaviour change, which is why it was chosen
  over autosave-everywhere.

`<SaveBar>` itself is gated on this decision and lands in its own Phase-1 ticket.

---

## 5. Tokens & color

Token discipline is already strong (Tailwind v4, CSS-first `@theme inline`, oklch tokens,
a 7-stage ramp, injectable brand band in `app/globals.css`). The **only** color debt is:

- **`amber-*` / `green-*` literals in opportunity components.** Route these to the existing
  semantic tokens: `--warning` (amber/caution), `--success` (green/positive), and the
  stage ramp for stage coloring. **Settings is already clean.** This is ORR-666 (P1-T2).
- **Rule going forward:** no raw `amber-*` / `green-*` / hex literals in feature components —
  use the semantic tokens. Status/stage tone comes from the badge primitives (§1).

---

## 6. Banked decisions (Orrin, 2026-07-11)

- **G1 — Unified unsaved-changes bar** app-wide (§4). Not autosave.
- **C1 — Keep the stepper interactive.** `StageTracker` stays the click-to-move-stage
  control; `<Stepper>` is extracted as **interactive**. This **overrides** the brief's
  "display-only stepper." Stage moves are guarded by `updatingStage`; terminal stages
  disable the tracker (preserve this).
- **C2 — Files: see §7, now an OPEN conflict.** (The banked position was "keep Files inline";
  the approved mock reopened this.)
- **C3 — Canonical primitives adopted in Opportunities + Settings only.** Accounts/Contacts
  keep current markup until their Phase-4 retrofit. This consciously leaves two dialects of
  `<RecordHeader>`/`<ReadOnlyField>`/`<FacetTabs>` on parked surfaces — a logged, accepted
  exception to the no-duplicate rule.

---

## 7. Open conflicts — resolve before the affected tickets

Per the "repo/brief/mock conflict → stop and flag" rule:

- **⚠️ C2 — Files inline vs Files as a facet tab (NEEDS ORRIN).**
  Banked decision C2 said keep Files **inline**, honoring the repo's deliberate T-059
  reversal (`opportunity-detail-wrapper.tsx` carries an explicit comment that files were
  kept inline because these deals are document-centric). **But the approved
  `opportunity-reorganized.html` mock puts Files in a dedicated facet tab**, with pinned
  RFP/Proposal/Contract slots surfaced on the Overview tab. The mock is the newer signal
  and directly contradicts C2. **Do not build the Files layout until Orrin confirms:** (a)
  Files becomes a tab with pinned slots on Overview (per mock), or (b) Files stays inline
  (per C2). Blocks the Overview/Files layout tickets (Phase 2). Everything else can proceed.

- **G2 — Team & Splits: rail vs tab.** Today they live in the right rail; the mock and brief
  move them into a **Team & Splits** tab, slimming the rail to Approval + Copilot. Confirm at
  Phase 2.

- **G3 — Tokens tab vs MCP token surface.** API tokens live at `/settings/api-tokens`; the
  MCP token is a separate concept. One Tokens tab covering both, or two surfaces? Gates the
  Settings tokens ticket (Phase 3).

- **G4 — Cash Plan = tab entry + locked state only** (confirmed). The Cash Plan tab shows a
  locked state until Verbal Agreement; it does **not** reopen the full-screen Deal
  Confirmation flow.

---

## 8. Phase-1 sequencing

Build order (front-loads the gated primitive, minimizes parked-page contact):

1. **P1-T1** — this convention doc + preserve discovery doc + commit approved mocks
   ([ORR-665](/ORR/issues/ORR-665)). *No product code.*
2. **P1-T2** — token pass, `amber/green` literals → semantic tokens
   ([ORR-666](/ORR/issues/ORR-666)). Independent, low risk.
3. **P1-T7** field primitives → **P1-T3** `<RecordHeader>` → **P1-T5** `<FacetTabs>`
   (opportunities-first adoption).
4. **P1-T4** `<Stepper>` — resolved by C1 (stays interactive).
5. **P1-T6** `<SaveBar>` — implements G1.

Each ships behind the Phase-1 fence: **no feature-page behaviour change** (temporary
adapters if needed). See [`docs/retrofit/phase-0-discovery.md`](retrofit/phase-0-discovery.md)
for the full component inventory, extend-vs-replace matrix, and parity-risk list.
