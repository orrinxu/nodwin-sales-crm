# Phase 0 Discovery — Voice / Text Record Generator

**Epic:** ORR-732 · **Status:** Phase 0 discovery gate — read-only, **no feature code**. Awaiting human sign-off before Phase 1.
**Brief:** `brief-voice-record-generator` (extends `brief-opportunity-generator.md`).
**Scope:** one pipeline, three targets — Opportunities · Accounts · Contacts.
**Date:** 2026-07-14 · all paths under `apps/web/` unless noted.

---

## 0. Headline findings (read these first)

1. **Brief "Phase 1" is already SHIPPED.** The brief's Phase 1 (paste/type → structured **opportunity** draft → review-against-source → commit via the existing create path) is the Opportunity Generator delivered this session in ORR-674→686 (extraction, resolver, review banner, provenance ORR-682, RFP retention ORR-683, vision + JSON mode ORR-686). The engine + review screen for opportunities exist and are live on staging. **Remaining real work = brief Phase 2 (voice) + Phase 3 (accounts/contacts) + the reusable launcher.**
2. **The approved review mockup does not exist.** `docs/mocks/opportunity-generator-review.html` is absent — there is no `docs/mocks/` dir. The shipped `ReviewBanner` in `components/opportunities/opportunity-generator.tsx` **is** the ground-truth review design; treat it as such. **Flag for the brief author.**
3. **"Same pipeline for 3 record types" is NOT free.** The extraction schema, prompts, resolver, prefill types, provenance table (hard FK to `opportunities`), and generator UI are all **opportunity-specific**. The type-agnostic, reusable pieces are: `aiCall`/`AiCallParams` (json + images), `EntityCombobox` + the inline quick-create action pattern, `extractJsonObject`, the review-banner UX, and the deterministic `pickRecord` matcher. Generalising to accounts/contacts is a real per-type build, not a config toggle.
4. **Voice/transcription is fully greenfield and sits OUTSIDE `aiCall`.** No audio/STT code exists. `aiCall`/the provider adapters are text/vision chat only — a Whisper/STT endpoint is a **new call path** (relevant to gate G2).
5. **Two ordering/convention constraints** the generalised committer must respect: (a) a voice draft with a **new account + new contact** must sequence account-create before contact-create (the contact picker is account-scoped); (b) `owner`/`created_by` conventions **differ by table** (opportunities set owner in app code; accounts/contacts rely on a DB audit trigger for `created_by`).

---

## 1. What already exists (reuse map)

### Reusable, type-agnostic (use as-is)
| Piece | Location | Note |
|---|---|---|
| `aiCall(params, deps)` + `AiCallParams` | `lib/ai/router.ts:39`, `lib/ai/types.ts:110` | Single provider seam. Already has `images?` + `json?` (ORR-686). **Only** provider-call path (confirmed — no direct AI `fetch` outside `lib/ai/providers/*`). |
| `createProviderAdapters(feature)` | `lib/ai/provider-chain.ts:18` | Per-feature provider selection. |
| `extractJsonObject` + retry | `lib/ai/opportunity-extraction.ts:194,268` | JSON-from-text parse; provider `response_format:json_object` where supported. |
| `EntityCombobox` + `onCreate` | `components/entity-combobox.tsx:59` | Creatable combobox — **already the inline-create UI**. |
| Inline quick-create actions | `app/(crm)/opportunities/actions.ts:208-235` | `createAccountQuickAction` / `createContactQuickAction` reuse `createAccount`/`createContact` (RLS + audit trigger). Reuse verbatim. |
| Review-banner UX | `components/opportunities/opportunity-generator.tsx:416` | Per-field provenance badges (matched/needs-review), notes, truncation. **This is the approved design** (the HTML mock is missing). |
| Deterministic matcher `pickRecord` | `lib/data/opportunity-extraction-resolver.ts:122` | exact→matched, multi-exact→ambiguous, none→unmatched. Type-agnostic logic. |

### Opportunity-specific (must be GENERALISED per record type)
| Piece | Location | Why it's coupled |
|---|---|---|
| Extraction schema + `FIELD_GUIDE` + prompts | `lib/ai/opportunity-extraction.ts:80-183` | Opportunity fields only. |
| Resolver → `OpportunityPrefill` | `lib/data/opportunity-extraction-resolver.ts:59,153` | Returns opportunity prefill; resolves account/contact/sales-unit/opp-enums specifically. |
| `AiFeature` vocabulary | `lib/ai/types.ts:5-11`, `lib/ai/features.ts:11` | Only `opportunity_extraction`. New values needed for account/contact (+ PG `ai_feature` enum + `FEATURE_LABELS`). |
| Provenance table | `supabase/migrations/20260714020000_opportunity_extraction_provenance.sql` | **Hard FK to `opportunities`**; `recordExtractionProvenanceAction` hardcodes `EXTRACTION_FEATURE`. → gate **G3**. |
| Generator UI | `components/opportunities/opportunity-generator.tsx` | Mounts `OpportunityForm`; chooser/analyse/review are opp-shaped. |

---

## 2. §2 ground-truth map (create paths + constraints)

- **Opportunity create** — `createOpportunity(ctx, input)` `lib/data/opportunities.ts:449`; `opportunityCreateSchema` `:404`. Required: `name`, `accountId`, `stage` (`DEAL_STAGES`), `salesUnitId`. Owner = `ownerUserId ?? ctx.user.id` (app-set, `:462`). Refines: recurring⇒split-kind; closed_lost⇒lossReason. Quick-create = the reused `OpportunityForm` dialog (no separate `opportunity-quick-create.tsx`); mounted by the generator in `opportunities-view.tsx:176` / `opportunity-board.tsx:150`.
- **Account create** — `createAccount(ctx, input)` `lib/data/accounts.ts:491`; `accountCreateSchema:77`. Required: `name` only. `created_by` set by DB trigger `set_account_audit_fields()` (`migrations/20260505000001_accounts.sql:80`); owner = `accountOwnerUserId` (optional). **No enums** (industry/country free strings + option lists).
- **Contact create** — `createContact(ctx, input)` `lib/data/contacts.ts:395`; `contactCreateSchema:55`. Required: `fullName` only. `primaryAccountId` optional. `created_by` via DB trigger `set_contact_audit_fields()` (`migrations/20260506000005_contacts.sql:57`); owner = `ownerUserId` (optional).
- **Account-scoped contact picker (deferred-creation conflict)** — `searchContactOptions(ctx,{query,accountId})` `contacts.ts:264` filters `.eq(primary_account_id, accountId)`. In `opportunity-form.tsx` the contact combobox is `disabled={!watchAccountId}` (`:548`) and clears on account change (`:519`). So: **new-account + new-contact drafts must create/resolve the account first.**
- **Enums** — opportunities: `opportunities.types.ts` (`PROJECT_TYPES`, `REVENUE_CATEGORIES`, `RECURRING_SPLIT_KINDS`, `SERVICE_TYPES`, `PROPERTY_TYPES`, `VISIBILITY_TIERS`) + `stage` in `lib/opportunity/stage.ts` (7 stages). Currency = `currencies` table via `getCurrencyOptions`. Accounts/contacts: no type enums.
- **Sales Unit is admin-only** — plain `<Select>` from `businessUnits` (no `onCreate`); managed at `admin/business-units`. The resolver treats it match-only. **Never inline-creatable from a voice note.**
- **Launcher mount points** — `app/(crm)/layout.tsx:26` (Sidebar + CrmHeader + main). Header `components/layout/crm-header.tsx` has **no "Create new" menu** → clean insertion point (right cluster or beside `GlobalSearch`). Sidebar `components/layout/sidebar.tsx` nav has no create action. **Command palette CONFIRMED ABSENT** (no `cmdk`/`CommandDialog`); `GlobalSearch` is a search autocomplete, not a palette. Header/sidebar are independent of the homepage redesign (`dashboard/`), so a launcher won't collide.

---

## 3. Decision gates — status after discovery (HUMAN-RESOLVED; not resolved here)

| Gate | Question | Discovery input (NOT a resolution) |
|---|---|---|
| **G1** Extraction provider | which model/route structures the transcript | Already flows through `aiCall` + per-feature provider chain; admin `/admin/ai` picks it. Likely reuse the `opportunity_extraction` provider config or add per-type. |
| **G2** Data residency | local Whisper (lanbox) vs cloud transcription (esp. East Asia) | `openai_compatible`/`ollama_local` are first-class admin-configurable local endpoints — a **local Whisper is feasible on the lanbox**, but STT is a NEW path (not `aiCall`). Real decision needed. |
| **G3** Provenance schema | jsonb column vs dedicated table | Opportunity uses a **dedicated table** with a hard FK to `opportunities`. For 3 types: (a) generalise to a polymorphic `record_extraction_provenance(record_type, record_id, …)` or (b) per-type tables. Recommend deciding at Track-A start. |
| **G4** Retention / RLS for captured media | audio now, screenshots later | Greenfield. RFP-file retention pattern exists (ORR-683 → Supabase Storage `documents` bucket) as a reference; audio needs its own decision. |
| **G5** Field auto-fill policy | what AI may pre-fill vs leave blank | Opportunity precedent: **never-infer four** (owner, stage, probability, visibility_tier). Establish the equivalent per type (e.g. account owner, contact owner). |
| **G6** Record-type routing | rep picks type vs AI infers | Brief default: **rep picks in v1**. The launcher (§2) is the natural place to pick. |
| **G7** Entry-point placement | where the launcher mounts | Brief default: one reusable launcher in a "Create new" affordance + a shortcut. Header has a clean slot; command palette absent (don't build it). |
| **G8** Commit gating | do "check this" fields block commit or warn | Brief default: block only revenue-affecting (stage, value); warn elsewhere. Review banner already computes `needsReview` per field. |
| **G9** Match-confidence threshold | below what confidence show **New** vs a shaky auto-match | Resolver is deterministic (exact-match only) today — there is **no confidence threshold** yet; ambiguous→`ambiguous`, none→`unmatched`. A threshold only becomes relevant if fuzzy matching is added. |

---

## 4. Proposed ticket breakdown (for review — not yet created)

Children of **ORR-732**. `T-0NN` numbers to be assigned in `BUILD_TICKETS.md` on sign-off. One ticket = one PR.

**Track A — Generalise the engine to Accounts + Contacts** *(brief Phase 3 — the core new build)*
- **A1** — Add `account_extraction` + `contact_extraction` `AiFeature` values (TS union `lib/ai/types.ts`, `lib/ai/features.ts` + `FEATURE_LABELS`, PG `ai_feature` enum migration).
- **A2** — Account extraction schema + prompts + resolver → `AccountPrefill`; reuse `pickRecord`, `extractJsonObject`, `aiCall`. Required field is only `name`.
- **A3** — Contact extraction schema + prompts + resolver → `ContactPrefill`; **account-first resolution** (resolve/queue the account, then scope the contact). Handles the deferred-creation conflict.
- **A4** — Provenance generalisation (**gate G3**): polymorphic `record_extraction_provenance(record_type, record_id, feature, model, source_kind, fields jsonb, …)` with per-type RLS, OR per-type tables. pgtap.
- **A5** — Record-type-parametric generator UI + review (extract a shared review component from `opportunity-generator.tsx`) + **record-type routing** (gate G6). Commit calls the existing `createAccount`/`createContact`/`createOpportunity` action for the chosen type.

**Track B — Voice capture + transcription** *(brief Phase 2)*
- **B1** — Browser audio capture (`MediaRecorder`) component + upload.
- **B2** — Transcription seam (**gate G2**): local Whisper on the lanbox vs cloud STT — a NEW path, not `aiCall`. Media retention/RLS per **gate G4**.
- **B3** — Wire transcript → the existing text pipeline (transcript becomes the `text` input to extraction).

**Track C — Reusable launcher** *(brief Phase 2, gate G7)*
- **C1** — One reusable global launcher (record-type chooser) mounted in a header "Create new" affordance + a keyboard shortcut. Deferred mount points (dashboard tile, command-palette slot) are NOT rebuilds. Do **not** build a command palette.

**Sequencing:** A1→A2/A3→A4→A5 (engine), then B (voice) and C (launcher) can parallelise. Track A is mostly reuse of the opportunity stack; the net-new surface is A4 (provenance shape) and A5 (parametric UI). Track B is the largest greenfield.

---

## 5. Open items to resolve before Phase 1

1. **Confirm the missing mockup** (`docs/mocks/opportunity-generator-review.html`) — accept the shipped `ReviewBanner` as the design, or supply the HTML.
2. **Resolve gates G1–G9** (esp. **G2** transcription residency, **G3** provenance shape, **G5** per-type auto-fill policy) — these block A4/B2.
3. **Acknowledge Phase 1 is done for opportunities** — confirm the "starting point" is Track A (accounts/contacts) + Track B (voice), not re-building the opportunity text→draft flow.
4. Assign `T-0NN` numbers + create ORR-732 children on sign-off.

**No implementation until this gate clears.**
