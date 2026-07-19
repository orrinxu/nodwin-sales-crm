import "server-only"
import type { DealStage } from "@/lib/opportunity/stage"

/**
 * Salesforce → CRM field mapping for the importer (ORR-699).
 *
 * Salesforce export column names vary by org and report type ("Account Name" vs
 * "Name", "AccountId" vs "Account ID"), so each CRM field maps from a list of
 * candidate headers and takes the first non-empty match. This module only maps
 * and normalizes; validation is the create schema's job in salesforce-import.ts.
 */

export const SUPPORTED_IMPORT_ENTITIES = ["accounts", "contacts", "opportunities"] as const
export type ImportEntity = (typeof SUPPORTED_IMPORT_ENTITIES)[number]

export const IMPORT_ENTITY_LABELS: Record<ImportEntity, string> = {
  accounts: "Accounts",
  contacts: "Contacts",
  opportunities: "Opportunities",
}

/** First non-empty value among the candidate headers (case-insensitive). */
function pick(row: Record<string, string>, names: string[]): string {
  const lower = new Map(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]))
  for (const name of names) {
    const v = lower.get(name.toLowerCase())
    if (v != null && v.trim() !== "") return v.trim()
  }
  return ""
}

/** The Salesforce record Id column — tried in importer-friendly order. */
const ID_HEADERS = (entity: string) => [
  `${entity} ID`,
  `${entity}Id`,
  "18-Digit ID",
  `${entity} 18-Digit ID`,
  "Record ID",
  "Id",
]

const ACCOUNT_ID_HEADERS = ["Account ID", "AccountId", "Account", "Account 18-Digit ID"]

/** Headers that carry the record Owner's email, for Owner→CRM-user matching (b). */
const OWNER_EMAIL_HEADERS = [
  "Owner Email",
  "Owner: Email",
  "OwnerEmail",
  "Owner Email Address",
  "Opportunity Owner Email",
  "Account Owner Email",
]

/** Headers that carry a per-row currency (f). */
const CURRENCY_HEADERS = ["Currency", "Currency ISO Code", "CurrencyIsoCode"]

/** The importer's canonical Id-column label per entity, for column detection. */
const ID_ENTITY_LABEL: Record<ImportEntity, string> = {
  accounts: "Account",
  contacts: "Contact",
  opportunities: "Opportunity",
}

/** True if the header row carries any recognised record-Id column for `entity`.
 *  When false the import has no idempotency key — re-runs can duplicate (c). */
export function detectIdColumn(headers: string[], entity: ImportEntity): boolean {
  const present = new Set(headers.map((h) => h.trim().toLowerCase()))
  // eslint-disable-next-line security/detect-object-injection -- entity is a validated enum key
  return ID_HEADERS(ID_ENTITY_LABEL[entity]).some((c) => present.has(c.toLowerCase()))
}

/** True if the header row carries a currency column. When false, opportunities
 *  must be given a confirmed default currency rather than silently defaulting (f). */
export function hasCurrencyColumn(headers: string[]): boolean {
  const present = new Set(headers.map((h) => h.trim().toLowerCase()))
  return CURRENCY_HEADERS.some((c) => present.has(c.toLowerCase()))
}

/** Prepend https:// when a website has no scheme so it passes URL validation. */
export function normalizeWebsite(raw: string): string | undefined {
  const v = raw.trim()
  if (!v) return undefined
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`
  try {
    // Reject values that still aren't URLs rather than failing the whole row.
    new URL(withScheme)
    return withScheme
  } catch {
    return undefined
  }
}

export function normalizeCurrency(raw: string): string | undefined {
  const v = raw.trim().toUpperCase()
  return /^[A-Z0-9]{1,8}$/.test(v) ? v : undefined
}

/**
 * Coerce a Salesforce numeric cell to a bare numeric string. SF *report* exports
 * render amounts and probabilities with formatting the DB can't ingest —
 * `"10%"`, `"$1,000.50"`, `"1,250"` — so strip currency symbols, `%`, spaces and
 * thousands separators before the create schema's numeric coercion runs (d).
 * Returns undefined when nothing numeric remains (the field is optional).
 */
export function normalizeNumber(raw: string): string | undefined {
  const v = raw.trim()
  if (!v) return undefined
  // Keep only digits, sign and separators, then drop thousands commas so the
  // remainder is a plain decimal ("$1,000.50" → "1000.50", "10%" → "10").
  const noGroups = v.replace(/[^0-9.,-]/g, "").replace(/,/g, "")
  if (!/^-?\d*\.?\d+$/.test(noGroups)) return undefined
  return noGroups
}

/** True when (y, m, d) is a real calendar date — Date normalises overflow (e.g.
 *  Feb 31 → Mar 3), so a round-trip mismatch means the components were invalid. */
function isRealDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  )
}

/**
 * Parse a Salesforce date to YYYY-MM-DD with real calendar validation and
 * ambiguity detection (e). Accepts ISO (YYYY-MM-DD) and slash dates. For
 * D/M vs M/D, a component > 12 disambiguates; when both are ≤ 12 the value is
 * genuinely ambiguous — we read it as US M/D (Salesforce's en_US default) and
 * return a warning so the admin can catch a wrong interpretation. Impossible
 * dates ("2/31/2026") return a warning and no `iso`, rather than emitting a
 * value that fails at the Postgres `date` insert with an opaque SQL error.
 */
export function parseSalesforceDate(raw: string): { iso?: string; warning?: string } {
  const v = raw.trim()
  if (!v) return {}
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) {
    const [, y, m, d] = iso
    if (isRealDate(Number(y), Number(m), Number(d))) return { iso: `${y}-${m}-${d}` }
    return { warning: `impossible date "${v}" (not a real calendar date) — close date dropped` }
  }
  const slash = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!slash) {
    return { warning: `unrecognised date format "${v}" (expected YYYY-MM-DD or M/D/YYYY) — close date dropped` }
  }
  const a = Number(slash[1])
  const b = Number(slash[2])
  const y = Number(slash[3])
  let month: number
  let day: number
  let warning: string | undefined
  if (a > 12 && b <= 12) {
    day = a
    month = b // unambiguously D/M
  } else if (b > 12 && a <= 12) {
    month = a
    day = b // unambiguously M/D
  } else if (a <= 12 && b <= 12) {
    month = a
    day = b // ambiguous — assume US M/D
    warning = `ambiguous date "${v}" read as US M/D (month ${a}); confirm if this export is D/M`
  } else {
    return { warning: `impossible date "${v}" (both parts > 12) — close date dropped` }
  }
  if (!isRealDate(y, month, day)) {
    return { warning: `impossible date "${v}" (day out of range for the month) — close date dropped` }
  }
  const mm = String(month).padStart(2, "0")
  const dd = String(day).padStart(2, "0")
  return { iso: `${y}-${mm}-${dd}`, warning }
}

/**
 * Normalize a Salesforce date to YYYY-MM-DD, or undefined when it can't be
 * parsed to a real date. Thin wrapper over {@link parseSalesforceDate} for
 * callers that only need the value (the mapper uses the full result to surface
 * ambiguity warnings).
 */
export function normalizeDate(raw: string): string | undefined {
  return parseSalesforceDate(raw).iso
}

const STAGE_MAP: Record<string, DealStage> = {
  prospecting: "qualify",
  qualification: "qualify",
  "needs analysis": "qualify",
  "value proposition": "meet_and_present",
  "id. decision makers": "meet_and_present",
  "identify decision makers": "meet_and_present",
  "perception analysis": "meet_and_present",
  "proposal/price quote": "propose",
  proposal: "propose",
  "negotiation/review": "negotiate",
  negotiation: "negotiate",
  "verbal agreement": "verbal_agreement",
  "closed won": "closed_won",
  won: "closed_won",
  "closed lost": "closed_lost",
  lost: "closed_lost",
}

/**
 * Map a Salesforce StageName to a CRM stage, or null when the stage isn't in the
 * map (a). Real SF orgs customise StageName heavily, so guessing `qualify` for
 * unknown stages silently re-enters historical won/lost revenue into the active
 * pipeline. The caller collects the distinct unmapped values and skips the row.
 */
export function mapStage(raw: string): DealStage | null {
  return STAGE_MAP[raw.trim().toLowerCase()] ?? null
}

/** A row mapped to CRM shape, plus the Salesforce ids the service resolves. */
export interface MappedRow {
  /** This record's Salesforce Id (idempotency key); "" if the export omitted it. */
  legacyId: string
  /** Parent Account's Salesforce Id, for FK resolution (contacts/opportunities). */
  accountLegacyId?: string
  /** camelCase fields to feed the entity's create schema (excludes resolved FKs). */
  values: Record<string, unknown>
  /** Record Owner's email from the export, to match to a CRM user (b); "" if absent. */
  ownerEmail: string
  /** Raw StageName when it isn't in the CRM map — the row must be skipped, not
   *  guessed. Only set for opportunities (a). */
  unmappedStage?: string
  /** Non-fatal per-row advisories (e.g. ambiguous/impossible dates) (e). */
  warnings: string[]
}

export function mapAccountRow(row: Record<string, string>): MappedRow {
  return {
    legacyId: pick(row, ID_HEADERS("Account")),
    ownerEmail: pick(row, OWNER_EMAIL_HEADERS),
    warnings: [],
    values: {
      name: pick(row, ["Account Name", "Name"]),
      legalName: pick(row, ["Legal Name", "Account Legal Name"]) || undefined,
      website: normalizeWebsite(pick(row, ["Website"])),
      country: pick(row, ["Billing Country", "BillingCountry", "Country"]) || undefined,
      industry: pick(row, ["Industry"]) || undefined,
      description: pick(row, ["Description"]) || undefined,
    },
  }
}

export function mapContactRow(row: Record<string, string>): MappedRow {
  const full = pick(row, ["Full Name", "Name"])
  const first = pick(row, ["First Name", "FirstName"])
  const last = pick(row, ["Last Name", "LastName"])
  const fullName = full || [first, last].filter(Boolean).join(" ")
  return {
    legacyId: pick(row, ID_HEADERS("Contact")),
    accountLegacyId: pick(row, ACCOUNT_ID_HEADERS) || undefined,
    ownerEmail: pick(row, OWNER_EMAIL_HEADERS),
    warnings: [],
    values: {
      fullName,
      email: pick(row, ["Email"]) || undefined,
      phone: pick(row, ["Phone", "Business Phone", "Mobile", "Mobile Phone"]) || undefined,
      title: pick(row, ["Title"]) || undefined,
      notes: pick(row, ["Description"]) || undefined,
    },
  }
}

export function mapOpportunityRow(row: Record<string, string>): MappedRow {
  const rawStage = pick(row, ["Stage", "StageName"])
  const stage = mapStage(rawStage)
  const warnings: string[] = []
  const values: Record<string, unknown> = {
    name: pick(row, ["Opportunity Name", "Name"]),
    amount: normalizeNumber(pick(row, ["Amount"])),
    currency: normalizeCurrency(pick(row, CURRENCY_HEADERS)),
    description: pick(row, ["Description"]) || undefined,
  }
  const closeDate = parseSalesforceDate(pick(row, ["Close Date", "CloseDate"]))
  if (closeDate.iso) values.closeDate = closeDate.iso
  if (closeDate.warning) warnings.push(closeDate.warning)

  if (stage) values.stage = stage
  const prob = normalizeNumber(pick(row, ["Probability (%)", "Probability"]))
  if (prob) values.probabilityPct = prob
  const lossReason = pick(row, ["Loss Reason", "Reason Lost", "Lost Reason"])
  // closed_lost requires a loss reason (create-schema superRefine); supply a
  // placeholder when the export didn't carry one so the row still imports.
  if (stage === "closed_lost") {
    values.lossReason = lossReason || "Imported from Salesforce (reason not captured)"
  } else if (lossReason) {
    values.lossReason = lossReason
  }
  return {
    legacyId: pick(row, ID_HEADERS("Opportunity")),
    accountLegacyId: pick(row, ACCOUNT_ID_HEADERS) || undefined,
    ownerEmail: pick(row, OWNER_EMAIL_HEADERS),
    unmappedStage: stage ? undefined : rawStage || "(blank)",
    warnings,
    values,
  }
}

export const ROW_MAPPERS: Record<ImportEntity, (row: Record<string, string>) => MappedRow> = {
  accounts: mapAccountRow,
  contacts: mapContactRow,
  opportunities: mapOpportunityRow,
}
