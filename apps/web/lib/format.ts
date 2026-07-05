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
