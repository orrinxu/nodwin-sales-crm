// Opportunity Generator — pure extraction normalizers (ORR-676, part of ticket 3/4).
//
// Client-safe, DB-free helpers that turn the raw text the extractor produced
// (ORR-675) into validated enum keys / dates / currency codes / numbers. The
// server resolver composes these with the record-matching (account/contact/unit)
// lookups. Kept pure so the mapping rules are exhaustively unit-testable without
// a database.

import {
  SERVICE_TYPES,
  SERVICE_TYPE_LABELS,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  PROJECT_TYPES,
  REVENUE_CATEGORIES,
  RECURRING_SPLIT_KINDS,
  type ServiceType,
  type PropertyType,
  type ProjectType,
  type RevenueCategory,
  type RecurringSplitKind,
} from "@/lib/data/opportunities.types"

/** Lowercase and strip everything but a-z0-9 so "Studio Production", "studio_production"
 *  and "studio-production" all collapse to the same token. */
export function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

/** Titleize a snake_case enum key for display when no label map exists. */
export function titleizeKey(key: string): string {
  return key
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
}

interface EnumOption<K extends string> {
  key: K
  label: string
}

/**
 * Match a raw string to one enum key by comparing its normalized token against
 * each option's normalized key AND label. Returns the key, or null if nothing
 * matches (the resolver flags it as unresolved rather than guessing).
 */
export function matchEnumOption<K extends string>(raw: string, options: EnumOption<K>[]): K | null {
  const token = normalizeToken(raw)
  if (!token) return null
  for (const opt of options) {
    if (normalizeToken(opt.key) === token || normalizeToken(opt.label) === token) return opt.key
  }
  return null
}

// Option lists built once from the frozen vocabularies.
const SERVICE_TYPE_OPTIONS: EnumOption<ServiceType>[] = SERVICE_TYPES.map((key) => ({
  key,
  // eslint-disable-next-line security/detect-object-injection -- key is a ServiceType from the frozen SERVICE_TYPES
  label: SERVICE_TYPE_LABELS[key],
}))
const PROPERTY_TYPE_OPTIONS: EnumOption<PropertyType>[] = PROPERTY_TYPES.map((key) => ({
  key,
  // eslint-disable-next-line security/detect-object-injection -- key is a PropertyType from the frozen PROPERTY_TYPES
  label: PROPERTY_TYPE_LABELS[key],
}))
const PROJECT_TYPE_OPTIONS: EnumOption<ProjectType>[] = PROJECT_TYPES.map((key) => ({
  key,
  label: titleizeKey(key),
}))
const REVENUE_CATEGORY_OPTIONS: EnumOption<RevenueCategory>[] = REVENUE_CATEGORIES.map((key) => ({
  key,
  label: titleizeKey(key),
}))
const RECURRING_SPLIT_OPTIONS: EnumOption<RecurringSplitKind>[] = RECURRING_SPLIT_KINDS.map((key) => ({
  key,
  label: titleizeKey(key),
}))

export const matchServiceType = (raw: string): ServiceType | null =>
  matchEnumOption(raw, SERVICE_TYPE_OPTIONS)
export const matchPropertyType = (raw: string): PropertyType | null =>
  matchEnumOption(raw, PROPERTY_TYPE_OPTIONS)
export const matchProjectType = (raw: string): ProjectType | null =>
  matchEnumOption(raw, PROJECT_TYPE_OPTIONS)
export const matchRevenueCategory = (raw: string): RevenueCategory | null =>
  matchEnumOption(raw, REVENUE_CATEGORY_OPTIONS)
export const matchRecurringSplitKind = (raw: string): RecurringSplitKind | null =>
  matchEnumOption(raw, RECURRING_SPLIT_OPTIONS)

/** Map each raw service-type string to a key; returns the matched keys (deduped)
 *  and the raw strings that matched nothing (surfaced for review). */
export function matchServiceTypes(raws: string[]): { matched: ServiceType[]; unmatched: string[] } {
  const matched: ServiceType[] = []
  const unmatched: string[] = []
  for (const raw of raws) {
    const key = matchServiceType(raw)
    if (key) {
      if (!matched.includes(key)) matched.push(key)
    } else {
      unmatched.push(raw)
    }
  }
  return { matched, unmatched }
}

/**
 * Accept only an unambiguous ISO calendar date (YYYY-MM-DD) that is a real date.
 * The extractor is told to emit ISO or omit; anything else (e.g. a leftover
 * "3/4/2026") is rejected here so the resolver leaves the field blank + flagged
 * rather than guessing day/month order.
 */
export function validIsoDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const [, y, mo, d] = m
  const year = Number(y)
  const month = Number(mo)
  const day = Number(d)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const dt = new Date(Date.UTC(year, month - 1, day))
  // Reject rollovers like 2026-02-31 → the Date normalizes to a different day.
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
    return null
  }
  return `${y}-${mo}-${d}`
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  "$": "USD",
  "€": "EUR",
  "£": "GBP",
  "₹": "INR",
  "¥": "JPY",
  rs: "INR",
  "rs.": "INR",
  inr: "INR",
  usd: "USD",
  eur: "EUR",
  gbp: "GBP",
  jpy: "JPY",
}

/**
 * Normalize a raw currency string to a code, then confirm it is a real active
 * code (`validCodes`, from the currencies registry). Handles common symbols and
 * words. Returns null when it can't be confirmed — the resolver proposes it as
 * unresolved rather than writing an unknown code (transaction currency is
 * immutable once set).
 */
export function normalizeCurrency(raw: string, validCodes: Set<string>): string | null {
  const trimmed = raw.trim()
  const bySymbol = CURRENCY_SYMBOLS[trimmed.toLowerCase()]
  const candidate = (bySymbol ?? trimmed).toUpperCase()
  return validCodes.has(candidate) ? candidate : null
}

/**
 * Parse a money-ish string to a plain decimal string (no separators). Rejects
 * anything that isn't a clean non-negative number so it never reaches the money
 * layer as a float or garbage. Strips thousands separators and a leading symbol.
 */
export function parseAmount(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^[^\d.]+/, "") // strip a leading currency symbol/word
    .replace(/,/g, "") // thousands separators
    .replace(/\s+/g, "")
  // eslint-disable-next-line security/detect-unsafe-regex -- anchored and linear (no nested unbounded quantifiers); matches a plain decimal
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null
  return cleaned
}

/** Parse a percentage-ish value to a number in [0,100] (or null). */
export function parsePercent(raw: string | number): number | null {
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[%\s]/g, ""))
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  return n
}
