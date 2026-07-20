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

describe("formatPreferenceDate date-only strings (ORR-814a)", () => {
  // PG `date` columns arrive as "YYYY-MM-DD". These must render as the literal
  // entered calendar date — never shifted a day by a west-of-UTC preference zone.
  it("renders the entered day, not UTC-midnight localized a day early", () => {
    expect(formatPreferenceDate("2026-07-19", "iso")).toBe("2026-07-19")
    expect(formatPreferenceDate("2026-07-19", "us")).toBe("Jul 19, 2026")
    expect(formatPreferenceDate("2026-07-19", "international")).toBe("19 Jul 2026")
  })

  it("is immune to a west-of-UTC preference timezone (the day-early bug)", () => {
    // Before the fix, LA (UTC-7/8) rendered "2026-07-18" for a 2026-07-19 date column.
    expect(formatPreferenceDate("2026-07-19", "iso", "", "America/Los_Angeles")).toBe("2026-07-19")
    expect(formatPreferenceDate("2026-01-01", "iso", "", "America/Los_Angeles")).toBe("2026-01-01")
    // And an east-of-UTC zone must not push it forward either.
    expect(formatPreferenceDate("2026-07-19", "iso", "", "Asia/Kolkata")).toBe("2026-07-19")
  })

  it("still formats full timestamptz strings via the ambient/zone path", () => {
    // A value carrying a time component is NOT date-only, so timezone still applies.
    expect(formatPreferenceDate("2026-07-03T20:00:00Z", "iso", "", "Asia/Kolkata")).toBe("2026-07-04")
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

describe("timezone awareness", () => {
  // A fixed UTC instant near the day boundary: 2026-07-03 20:00 UTC.
  // In Asia/Kolkata (+5:30) this is already 2026-07-04 01:30; in UTC it is
  // still 2026-07-03. So an explicit timeZone shifts the rendered calendar day.
  const instant = new Date("2026-07-03T20:00:00Z")

  it("renders the date in the supplied IANA zone", () => {
    expect(formatPreferenceDate(instant, "iso", "", "UTC")).toBe("2026-07-03")
    expect(formatPreferenceDate(instant, "iso", "", "Asia/Kolkata")).toBe("2026-07-04")
    expect(formatPreferenceDate(instant, "iso", "", "America/Los_Angeles")).toBe("2026-07-03")
  })

  it("renders both date and time in the supplied zone", () => {
    expect(formatPreferenceDateTime(instant, "iso", "", "UTC")).toBe("2026-07-03, 20:00")
    expect(formatPreferenceDateTime(instant, "iso", "", "Asia/Kolkata")).toBe("2026-07-04, 01:30")
  })

  it("no timezone is identical to null/undefined timezone (ambient-zone parity)", () => {
    // Whatever the ambient zone, omitting the arg must equal passing null/undefined,
    // so users with no timezone preference see exactly today's behaviour.
    const bare = formatPreferenceDate(instant, "us")
    expect(formatPreferenceDate(instant, "us", "", null)).toBe(bare)
    expect(formatPreferenceDate(instant, "us", "", undefined)).toBe(bare)
    const bareDt = formatPreferenceDateTime(instant, "us")
    expect(formatPreferenceDateTime(instant, "us", "", null)).toBe(bareDt)
    expect(formatPreferenceDateTime(instant, "us", "", undefined)).toBe(bareDt)
  })
})
