import { describe, it, expect } from "vitest"
import { numberFormatLocale } from "./format"

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
