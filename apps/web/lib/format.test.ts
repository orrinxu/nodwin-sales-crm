import { describe, it, expect } from "vitest"
import { numberFormatLocale, formatPreferenceDate, formatPreferenceDateTime } from "./format"

describe("numberFormatLocale", () => {
  it("maps 'international' to en-US grouping (thousands/millions)", () => {
    const locale = numberFormatLocale("international")
    expect(locale).toBe("en-US")
    expect(new Intl.NumberFormat(locale).format(1234567)).toBe("1,234,567")
  })

  it("maps 'indian' to en-IN grouping (lakh/crore)", () => {
    const locale = numberFormatLocale("indian")
    expect(locale).toBe("en-IN")
    expect(new Intl.NumberFormat(locale).format(1234567)).toBe("12,34,567")
  })

  it("defaults to international for null/undefined (the app default)", () => {
    expect(numberFormatLocale(null)).toBe("en-US")
    expect(numberFormatLocale(undefined)).toBe("en-US")
  })

  it("compact notation differs: 1.2M international vs 12L indian", () => {
    const intl = new Intl.NumberFormat(numberFormatLocale("international"), { notation: "compact" })
    const ind = new Intl.NumberFormat(numberFormatLocale("indian"), { notation: "compact" })
    expect(intl.format(1_200_000)).toBe("1.2M")
    expect(ind.format(1_200_000)).toBe("12L")
  })
})

describe("formatPreferenceDate", () => {
  // Local-constructed so the assertion is timezone-independent.
  const d = new Date(2026, 6, 3) // 3 July 2026

  it("iso → 2026-07-03", () => expect(formatPreferenceDate(d, "iso")).toBe("2026-07-03"))
  it("us → Jul 3, 2026", () => expect(formatPreferenceDate(d, "us")).toBe("Jul 3, 2026"))
  it("international → 3 Jul 2026", () => expect(formatPreferenceDate(d, "international")).toBe("3 Jul 2026"))
  it("defaults to iso for null/undefined preference", () => {
    expect(formatPreferenceDate(d, undefined)).toBe("2026-07-03")
  })
  it("returns the fallback for a null/invalid date", () => {
    expect(formatPreferenceDate(null, "iso", "TBD")).toBe("TBD")
    expect(formatPreferenceDate("not-a-date", "iso", "—")).toBe("—")
  })
})

describe("formatPreferenceDateTime", () => {
  const dt = new Date(2026, 6, 3, 14, 30)
  it("prepends the preference-formatted date, then a time", () => {
    expect(formatPreferenceDateTime(dt, "iso")).toMatch(/^2026-07-03, /)
    expect(formatPreferenceDateTime(dt, "us")).toMatch(/^Jul 3, 2026, /)
    expect(formatPreferenceDateTime(dt, "international")).toMatch(/^3 Jul 2026, /)
  })
  it("returns the fallback for a null date", () => {
    expect(formatPreferenceDateTime(null, "iso", "—")).toBe("—")
  })
})
