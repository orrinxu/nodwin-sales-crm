import "server-only"
import type {
  ServiceType,
  PropertyType,
  ProjectType,
  RevenueCategory,
  RecurringSplitKind,
} from "./opportunities.types"
import type { ExtractedOpportunityFields } from "@/lib/ai/opportunity-extraction"
import { searchAccountOptions, searchContactOptions } from "./contacts"
import { getBusinessUnitOptions } from "./opportunities"
import { getCurrencyOptions } from "./user-preferences"
import {
  normalizeToken,
  matchServiceTypes,
  matchPropertyType,
  matchProjectType,
  matchRevenueCategory,
  matchRecurringSplitKind,
  validIsoDate,
  normalizeCurrency,
  parseAmount,
  parsePercent,
} from "@/lib/opportunity/extraction-normalize"

// Opportunity Generator — extraction resolver (ORR-676, ticket 3/4).
//
// Turns the raw extracted fields (ORR-675) into a form-ready `prefill` plus a
// per-field `resolution` the review UI (ORR-677) uses to badge each value.
//
// v1 is DETERMINISTIC (Orrin's call): FK fields resolve by exact/ILIKE name (and
// the existing account lookup), never by fuzzy/semantic matching. When a match
// is unambiguous we pin it; when it's ambiguous we offer candidates; when there
// is no match we propose "create new" — nothing is ever silently wrong, and the
// user confirms everything before the existing createOpportunity path runs.

export type ResolutionStatus = "ok" | "matched" | "ambiguous" | "unmatched" | "invalid"

export interface ResolutionCandidate {
  id: string
  label: string
}

export interface FieldResolution {
  status: ResolutionStatus
  /** Verbatim snippet the value came from (from the extractor). */
  source: string | null
  confidence: number | null
  /** The original text the model extracted (for "create new …" / show-your-work). */
  raw: string | null
  /** Human label of the resolved value (account name, enum label, or the text). */
  display: string | null
  /** For ambiguous/unmatched FK fields: the options to pick from. */
  candidates?: ResolutionCandidate[]
}

/** Form-ready values — only fields we could resolve appear. Mirrors the create
 *  form field names (minus the never-infer four). */
export interface OpportunityPrefill {
  name?: string
  accountId?: string
  primaryContactId?: string
  salesUnitId?: string
  amount?: string
  currency?: string
  closeDate?: string
  servicePeriodStart?: string
  servicePeriodEnd?: string
  executionDate?: string
  countryExecution?: string
  serviceType?: ServiceType[]
  propertyType?: PropertyType
  projectType?: ProjectType
  revenueCategory?: RevenueCategory
  recurring?: boolean
  recurringSplitKind?: RecurringSplitKind
  barterValue?: string
  estimatedGrossMarginPct?: number
  description?: string
}

export interface ResolvedExtraction {
  prefill: OpportunityPrefill
  resolution: Record<string, FieldResolution>
  /** Human-readable notes for anything left blank on purpose (ambiguous dates, unknown currency). */
  notes: string[]
}

export interface ResolverRecord {
  id: string
  name: string
}

/** Data-access surface — injectable so the resolver is unit-testable without a DB. */
export interface ExtractionResolverDeps {
  searchAccounts: (query: string) => Promise<ResolverRecord[]>
  searchContacts: (query: string, accountId?: string) => Promise<ResolverRecord[]>
  listBusinessUnits: () => Promise<ResolverRecord[]>
  listCurrencyCodes: () => Promise<string[]>
}

export interface ExtractionResolverContext {
  user: { id: string; email?: string; role?: string }
  source: "web" | "mcp" | "webhook" | "system"
}

function defaultDeps(ctx: ExtractionResolverContext): ExtractionResolverDeps {
  // The existing lookups are RLS-scoped (createServerClient) — the resolver only
  // ever matches records the current user can already see.
  const cc = ctx as never
  return {
    searchAccounts: (q) => searchAccountOptions(cc, q).then((rows) => rows.map((r) => ({ id: r.id, name: r.name }))),
    searchContacts: (q, accountId) =>
      searchContactOptions(cc, { query: q, accountId }).then((rows) => rows.map((r) => ({ id: r.id, name: r.name }))),
    listBusinessUnits: () => getBusinessUnitOptions(cc).then((rows) => rows.map((r) => ({ id: r.id, name: r.name }))),
    listCurrencyCodes: () => getCurrencyOptions(cc).then((rows) => rows.map((r) => r.code)),
  }
}

/** Match a raw name against candidate records: exact (normalized) first, then a
 *  single ILIKE hit, else ambiguous / unmatched. */
function pickRecord(
  raw: string,
  options: ResolverRecord[],
): { status: ResolutionStatus; id?: string; display?: string; candidates?: ResolutionCandidate[] } {
  const token = normalizeToken(raw)
  const exact = options.filter((o) => normalizeToken(o.name) === token)
  if (exact.length === 1) return { status: "matched", id: exact[0].id, display: exact[0].name }
  if (exact.length > 1) return { status: "ambiguous", candidates: toCandidates(exact) }
  if (options.length === 1) return { status: "matched", id: options[0].id, display: options[0].name }
  if (options.length > 1) return { status: "ambiguous", candidates: toCandidates(options) }
  return { status: "unmatched" }
}

function toCandidates(records: ResolverRecord[]): ResolutionCandidate[] {
  return records.slice(0, 5).map((r) => ({ id: r.id, label: r.name }))
}

type ExtractedField<T> = { value: T; confidence: number; source: string } | undefined

function meta<T>(f: ExtractedField<T>): Pick<FieldResolution, "source" | "confidence" | "raw"> {
  return {
    source: f?.source ?? null,
    confidence: f?.confidence ?? null,
    raw: f == null ? null : String(f.value),
  }
}

/**
 * Resolve extracted opportunity fields to a form-ready prefill + per-field
 * resolution. Never writes anything. Deterministic (v1).
 */
export async function resolveExtractedOpportunity(
  ctx: ExtractionResolverContext,
  fields: ExtractedOpportunityFields,
  deps: ExtractionResolverDeps = defaultDeps(ctx),
): Promise<ResolvedExtraction> {
  const prefill: OpportunityPrefill = {}
  const resolution: Record<string, FieldResolution> = {}
  const notes: string[] = []

  // ── Plain text pass-throughs ──
  if (fields.name) {
    prefill.name = fields.name.value
    resolution.name = { status: "ok", display: fields.name.value, ...meta(fields.name) }
  }
  if (fields.description) {
    prefill.description = fields.description.value
    resolution.description = { status: "ok", display: fields.description.value, ...meta(fields.description) }
  }
  if (fields.countryExecution) {
    prefill.countryExecution = fields.countryExecution.value
    resolution.countryExecution = {
      status: "ok",
      display: fields.countryExecution.value,
      ...meta(fields.countryExecution),
    }
  }
  if (fields.recurring) {
    prefill.recurring = fields.recurring.value
    resolution.recurring = {
      status: "ok",
      display: fields.recurring.value ? "Yes" : "No",
      ...meta(fields.recurring),
    }
  }

  // ── Account (FK) — resolve, then scope the contact to it ──
  let matchedAccountId: string | undefined
  if (fields.account) {
    const options = await deps.searchAccounts(fields.account.value)
    const pick = pickRecord(fields.account.value, options)
    matchedAccountId = pick.id
    if (pick.id) prefill.accountId = pick.id
    resolution.account = {
      status: pick.status,
      display: pick.display ?? fields.account.value,
      candidates: pick.candidates,
      ...meta(fields.account),
    }
    if (pick.status === "unmatched") notes.push(`No existing account matches "${fields.account.value}" — you can create it.`)
  }

  // ── Primary contact (FK) — scoped to the matched account when we have one ──
  if (fields.primaryContact) {
    const options = await deps.searchContacts(fields.primaryContact.value, matchedAccountId)
    const pick = pickRecord(fields.primaryContact.value, options)
    if (pick.id) prefill.primaryContactId = pick.id
    resolution.primaryContact = {
      status: pick.status,
      display: pick.display ?? fields.primaryContact.value,
      candidates: pick.candidates,
      ...meta(fields.primaryContact),
    }
  }

  // ── Sales unit (FK) — fuzzy-contains against the business-unit list ──
  if (fields.salesUnit) {
    const token = normalizeToken(fields.salesUnit.value)
    const all = await deps.listBusinessUnits()
    const narrowed = token
      ? all.filter((u) => {
          const n = normalizeToken(u.name)
          return n === token || n.includes(token) || token.includes(n)
        })
      : []
    const pick = pickRecord(fields.salesUnit.value, narrowed)
    if (pick.id) prefill.salesUnitId = pick.id
    resolution.salesUnit = {
      status: pick.status,
      display: pick.display ?? fields.salesUnit.value,
      candidates: pick.candidates,
      ...meta(fields.salesUnit),
    }
  }

  // ── Money ──
  if (fields.amount) {
    const parsed = parseAmount(String(fields.amount.value))
    if (parsed) {
      prefill.amount = parsed
      resolution.amount = { status: "ok", display: parsed, ...meta(fields.amount) }
    } else {
      resolution.amount = { status: "invalid", display: String(fields.amount.value), ...meta(fields.amount) }
      notes.push(`Could not read the amount "${fields.amount.value}" — enter it manually.`)
    }
  }
  if (fields.barterValue) {
    const parsed = parseAmount(String(fields.barterValue.value))
    if (parsed) {
      prefill.barterValue = parsed
      resolution.barterValue = { status: "ok", display: parsed, ...meta(fields.barterValue) }
    } else {
      resolution.barterValue = { status: "invalid", display: String(fields.barterValue.value), ...meta(fields.barterValue) }
    }
  }
  if (fields.currency) {
    const validCodes = new Set(await deps.listCurrencyCodes())
    const code = normalizeCurrency(fields.currency.value, validCodes)
    if (code) {
      prefill.currency = code
      resolution.currency = { status: "matched", display: code, ...meta(fields.currency) }
    } else {
      resolution.currency = { status: "invalid", display: fields.currency.value, ...meta(fields.currency) }
      notes.push(`Currency "${fields.currency.value}" wasn't recognised — pick one before saving.`)
    }
  }
  if (fields.estimatedGrossMarginPct) {
    const pct = parsePercent(fields.estimatedGrossMarginPct.value)
    if (pct != null) {
      prefill.estimatedGrossMarginPct = pct
      resolution.estimatedGrossMarginPct = { status: "ok", display: `${pct}%`, ...meta(fields.estimatedGrossMarginPct) }
    } else {
      resolution.estimatedGrossMarginPct = {
        status: "invalid",
        display: String(fields.estimatedGrossMarginPct.value),
        ...meta(fields.estimatedGrossMarginPct),
      }
    }
  }

  // ── Dates (ISO, unambiguous only) ──
  const dateKeys = ["closeDate", "servicePeriodStart", "servicePeriodEnd", "executionDate"] as const
  for (const key of dateKeys) {
    // eslint-disable-next-line security/detect-object-injection -- key iterates the fixed dateKeys literal tuple
    const f = fields[key]
    if (!f) continue
    const iso = validIsoDate(f.value)
    if (iso) {
      // eslint-disable-next-line security/detect-object-injection -- key is a fixed dateKeys literal
      prefill[key] = iso
      // eslint-disable-next-line security/detect-object-injection -- key is a fixed dateKeys literal
      resolution[key] = { status: "ok", display: iso, ...meta(f) }
    } else {
      // eslint-disable-next-line security/detect-object-injection -- key is a fixed dateKeys literal
      resolution[key] = { status: "invalid", display: f.value, ...meta(f) }
      notes.push(`Date "${f.value}" for ${key} was ambiguous or invalid and left blank.`)
    }
  }

  // ── Enums (validate against frozen vocabularies) ──
  if (fields.serviceType) {
    const { matched, unmatched } = matchServiceTypes(fields.serviceType.value)
    if (matched.length > 0) prefill.serviceType = matched
    resolution.serviceType = {
      status: unmatched.length === 0 && matched.length > 0 ? "matched" : matched.length > 0 ? "ambiguous" : "unmatched",
      display: matched.join(", ") || fields.serviceType.value.join(", "),
      ...meta(fields.serviceType),
    }
    if (unmatched.length > 0) notes.push(`Unrecognised service type(s): ${unmatched.join(", ")}.`)
  }
  resolveEnum("propertyType", fields.propertyType, matchPropertyType, (v) => (prefill.propertyType = v), resolution)
  resolveEnum("projectType", fields.projectType, matchProjectType, (v) => (prefill.projectType = v), resolution)
  resolveEnum("revenueCategory", fields.revenueCategory, matchRevenueCategory, (v) => (prefill.revenueCategory = v), resolution)
  if (fields.recurringSplitKind) {
    const key = matchRecurringSplitKind(fields.recurringSplitKind.value)
    if (key) prefill.recurringSplitKind = key
    resolution.recurringSplitKind = {
      status: key ? "matched" : "unmatched",
      display: key ?? fields.recurringSplitKind.value,
      ...meta(fields.recurringSplitKind),
    }
  }

  return { prefill, resolution, notes }
}

/** Shared enum-field resolution: match → set prefill + resolution, else flag unmatched. */
function resolveEnum<T extends string>(
  key: string,
  f: ExtractedField<string>,
  match: (raw: string) => T | null,
  set: (value: T) => void,
  resolution: Record<string, FieldResolution>,
): void {
  if (!f) return
  const mapped = match(f.value)
  if (mapped) set(mapped)
  // eslint-disable-next-line security/detect-object-injection -- key is a fixed literal passed by the caller, not user input
  resolution[key] = {
    status: mapped ? "matched" : "unmatched",
    display: mapped ?? f.value,
    ...meta(f),
  }
}
