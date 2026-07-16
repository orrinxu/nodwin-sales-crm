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
 * Normalize a Salesforce date to YYYY-MM-DD. Accepts ISO (YYYY-MM-DD) and the
 * US M/D/YYYY that en_US Salesforce orgs export by default. Ambiguous or
 * unparseable values return undefined (the field is optional) rather than
 * guessing a wrong date.
 */
export function normalizeDate(raw: string): string | undefined {
  const v = raw.trim()
  if (!v) return undefined
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const us = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (us) {
    const [, m, d, y] = us
    const mm = m.padStart(2, "0")
    const dd = d.padStart(2, "0")
    if (Number(mm) >= 1 && Number(mm) <= 12 && Number(dd) >= 1 && Number(dd) <= 31) {
      return `${y}-${mm}-${dd}`
    }
  }
  return undefined
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

/** Map a Salesforce StageName to a CRM stage; unknown stages fall back to qualify. */
export function mapStage(raw: string): DealStage {
  return STAGE_MAP[raw.trim().toLowerCase()] ?? "qualify"
}

/** A row mapped to CRM shape, plus the Salesforce ids the service resolves. */
export interface MappedRow {
  /** This record's Salesforce Id (idempotency key); "" if the export omitted it. */
  legacyId: string
  /** Parent Account's Salesforce Id, for FK resolution (contacts/opportunities). */
  accountLegacyId?: string
  /** camelCase fields to feed the entity's create schema (excludes resolved FKs). */
  values: Record<string, unknown>
}

export function mapAccountRow(row: Record<string, string>): MappedRow {
  return {
    legacyId: pick(row, ID_HEADERS("Account")),
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
  const stage = mapStage(pick(row, ["Stage", "StageName"]))
  const values: Record<string, unknown> = {
    name: pick(row, ["Opportunity Name", "Name"]),
    stage,
    amount: pick(row, ["Amount"]) || undefined,
    currency: normalizeCurrency(pick(row, ["Currency", "Currency ISO Code", "CurrencyIsoCode"])),
    closeDate: normalizeDate(pick(row, ["Close Date", "CloseDate"])),
    description: pick(row, ["Description"]) || undefined,
  }
  const prob = pick(row, ["Probability (%)", "Probability"])
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
    values,
  }
}

export const ROW_MAPPERS: Record<ImportEntity, (row: Record<string, string>) => MappedRow> = {
  accounts: mapAccountRow,
  contacts: mapContactRow,
  opportunities: mapOpportunityRow,
}
