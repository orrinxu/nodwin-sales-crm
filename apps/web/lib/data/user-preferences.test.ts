import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn() }))

import { createServerClient } from "@/lib/supabase/server"
import {
  userPreferencesUpdateSchema,
  DEFAULT_USER_PREFERENCES,
  getUserPreferences,
  getDisplayCurrency,
  getNumberFormat,
  getDateFormat,
} from "./user-preferences"

const USER = { id: "a0000001-0001-0001-0001-000000000001", email: "a@b.c", role: "admin" }
const CTX = { user: USER, source: "web" as const }

// Minimal supabase stub for .from("user_preferences").select("*").eq(...).maybeSingle().
// Captures the selected columns so we can assert the granular getters go through the
// single full-row read (select "*"), not a per-field query.
function stubClient(row: Record<string, unknown> | null) {
  const selected: string[] = []
  const maybeSingle = vi.fn(async () => ({ data: row, error: null }))
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn((cols: string) => {
    selected.push(cols)
    return { eq }
  })
  const from = vi.fn(() => ({ select }))
  ;(createServerClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ from })
  return { selected }
}

describe("userPreferencesUpdateSchema", () => {
  it("accepts valid preferences", () => {
    const parsed = userPreferencesUpdateSchema.parse({
      displayCurrency: "INR",
      entryCurrencyDefault: "USD",
      numberFormat: "indian",
      dateFormat: "us",
      theme: "dark",
      jobTitle: "Sales Manager",
    })
    expect(parsed.displayCurrency).toBe("INR")
    expect(parsed.numberFormat).toBe("indian")
  })

  it("allows null currencies (org default / match display)", () => {
    const parsed = userPreferencesUpdateSchema.parse({
      displayCurrency: null,
      entryCurrencyDefault: null,
    })
    expect(parsed.displayCurrency).toBeNull()
    expect(parsed.entryCurrencyDefault).toBeNull()
  })

  it("rejects an invalid currency code", () => {
    expect(() => userPreferencesUpdateSchema.parse({ displayCurrency: "us dollar" })).toThrow()
  })

  it("rejects an unknown theme", () => {
    expect(() => userPreferencesUpdateSchema.parse({ theme: "neon" })).toThrow()
  })

  it("rejects an unknown number format", () => {
    expect(() => userPreferencesUpdateSchema.parse({ numberFormat: "martian" })).toThrow()
  })

  it("accepts a partial update", () => {
    const parsed = userPreferencesUpdateSchema.parse({ theme: "light" })
    expect(parsed.theme).toBe("light")
    expect("displayCurrency" in parsed).toBe(false)
  })
})

describe("DEFAULT_USER_PREFERENCES", () => {
  it("defaults currencies to null and theme to system", () => {
    expect(DEFAULT_USER_PREFERENCES.displayCurrency).toBeNull()
    expect(DEFAULT_USER_PREFERENCES.entryCurrencyDefault).toBeNull()
    expect(DEFAULT_USER_PREFERENCES.theme).toBe("system")
    expect(DEFAULT_USER_PREFERENCES.numberFormat).toBe("international")
  })
})

describe("preference reads (ORR-709 memoized full-row read)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("maps a stored row onto the domain record", async () => {
    stubClient({
      display_currency: "INR",
      entry_currency_default: "USD",
      timezone: "Asia/Kolkata",
      number_format: "indian",
      date_format: "us",
      theme: "dark",
      job_title: "Sales Manager",
    })
    const prefs = await getUserPreferences(CTX)
    expect(prefs).toEqual({
      displayCurrency: "INR",
      entryCurrencyDefault: "USD",
      timezone: "Asia/Kolkata",
      numberFormat: "indian",
      dateFormat: "us",
      theme: "dark",
      jobTitle: "Sales Manager",
    })
  })

  it("returns defaults when the user has no row", async () => {
    stubClient(null)
    expect(await getUserPreferences(CTX)).toEqual(DEFAULT_USER_PREFERENCES)
  })

  it("granular getters derive their field from the full-row read (select *)", async () => {
    const { selected } = stubClient({ display_currency: "INR", number_format: "indian", date_format: "us" })
    expect(await getDisplayCurrency(CTX)).toBe("INR")
    expect(await getNumberFormat(CTX)).toBe("indian")
    expect(await getDateFormat(CTX)).toBe("us")
    // Every read goes through the full-row select, so a request that also loads full
    // preferences pays no extra column-scoped round-trips.
    expect(selected.every((c) => c === "*")).toBe(true)
  })

  it("granular getters fall back to defaults when no row exists", async () => {
    stubClient(null)
    expect(await getDisplayCurrency(CTX)).toBeNull()
    expect(await getNumberFormat(CTX)).toBe("international")
    expect(await getDateFormat(CTX)).toBe("iso")
  })
})
