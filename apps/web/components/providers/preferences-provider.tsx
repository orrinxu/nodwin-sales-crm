"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"

import type { DateFormat } from "@/lib/data/user-preferences"
import { formatPreferenceDate, formatPreferenceDateTime } from "@/lib/format"

// The subset of the user's preferences that display formatting depends on.
// Seeded once by the server (crm) layout from getUserPreferences and made
// available to every client component under it, so date/time formatting no
// longer has to be prop-threaded page by page.
type PreferencesState = {
  dateFormat: DateFormat
  /** IANA timezone (e.g. "Asia/Kolkata"), or null to use the ambient zone. */
  timezone: string | null
  /** Format a date honouring both the date-format and timezone preferences. */
  formatDate: (value: string | Date | null | undefined, fallback?: string) => string
  /** Format a date + time honouring both preferences. */
  formatDateTime: (
    value: string | Date | null | undefined,
    fallback?: string,
  ) => string
}

const PreferencesContext = createContext<PreferencesState | undefined>(undefined)

// A stored timezone should always be a valid IANA name (the Settings combobox
// only offers Intl.supportedValuesOf values), but guard against a bad value so
// one row can't throw a RangeError on every formatted date app-wide.
function normalizeTimeZone(timezone: string | null | undefined): string | null {
  if (!timezone) return null
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone })
    return timezone
  } catch {
    return null
  }
}

export function PreferencesProvider({
  children,
  dateFormat,
  timezone,
}: {
  children: ReactNode
  dateFormat: DateFormat
  timezone: string | null
}) {
  const value = useMemo<PreferencesState>(() => {
    const tz = normalizeTimeZone(timezone)
    return {
      dateFormat,
      timezone: tz,
      formatDate: (v, fallback = "") =>
        formatPreferenceDate(v, dateFormat, fallback, tz),
      formatDateTime: (v, fallback = "") =>
        formatPreferenceDateTime(v, dateFormat, fallback, tz),
    }
  }, [dateFormat, timezone])

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences(): PreferencesState {
  const ctx = useContext(PreferencesContext)
  if (!ctx) {
    throw new Error("usePreferences must be used within a PreferencesProvider")
  }
  return ctx
}
