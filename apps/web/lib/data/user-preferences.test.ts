import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn() }))

import {
  userPreferencesUpdateSchema,
  DEFAULT_USER_PREFERENCES,
} from "./user-preferences"

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
