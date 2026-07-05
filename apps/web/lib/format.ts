// Pure formatting helpers shared by server and client components (no server-only
// imports here). Maps a user's number-format preference to an Intl locale.

export type NumberFormatPreference = "international" | "indian"

/**
 * Locale for a number-format preference:
 *  - "international" → en-US grouping (1,234,567 / compact 1.2M) — the default.
 *  - "indian"       → en-IN grouping (12,34,567 / compact 12L, 1.2Cr).
 * Currency/units are passed explicitly to Intl, so only the digit grouping and
 * compact notation differ by locale.
 */
export function numberFormatLocale(pref: NumberFormatPreference | null | undefined): string {
  return pref === "indian" ? "en-IN" : "en-US"
}

export type DateFormatPreference = "iso" | "us" | "international"

// Locale + options per date-format preference. Matches the Settings labels:
//   iso           → 2026-07-03
//   us            → Jul 3, 2026
//   international  → 3 Jul 2026
// (switch, not a lookup object, to avoid the object-injection lint on a keyed read.)
function dateParts(pref: DateFormatPreference | null | undefined): {
  locale: string
  opts: Intl.DateTimeFormatOptions
} {
  switch (pref) {
    case "us":
      return { locale: "en-US", opts: { year: "numeric", month: "short", day: "numeric" } }
    case "international":
      return { locale: "en-GB", opts: { year: "numeric", month: "short", day: "numeric" } }
    case "iso":
    default:
      return { locale: "en-CA", opts: { year: "numeric", month: "2-digit", day: "2-digit" } }
  }
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Format a date per the user's date-format preference (defaults to ISO). */
export function formatPreferenceDate(
  value: string | Date | null | undefined,
  pref: DateFormatPreference | null | undefined,
  fallback = "",
): string {
  const d = toDate(value)
  if (!d) return fallback
  const { locale, opts } = dateParts(pref)
  return d.toLocaleDateString(locale, opts)
}

/** Date + time per preference (12-hour clock except ISO, which uses 24-hour). */
export function formatPreferenceDateTime(
  value: string | Date | null | undefined,
  pref: DateFormatPreference | null | undefined,
  fallback = "",
): string {
  const d = toDate(value)
  if (!d) return fallback
  const { locale, opts } = dateParts(pref)
  const date = d.toLocaleDateString(locale, opts)
  const time = d.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
    hour12: pref !== "iso",
  })
  return `${date}, ${time}`
}
