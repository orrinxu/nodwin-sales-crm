import { describe, it, expect } from "vitest"
import {
  normalizeToken,
  matchServiceType,
  matchServiceTypes,
  matchPropertyType,
  matchProjectType,
  matchRevenueCategory,
  matchRecurringSplitKind,
  validIsoDate,
  normalizeCurrency,
  parseAmount,
  parsePercent,
} from "./extraction-normalize"

describe("normalizeToken", () => {
  it("collapses case, spaces, underscores and hyphens", () => {
    expect(normalizeToken("Studio Production")).toBe("studioproduction")
    expect(normalizeToken("studio_production")).toBe("studioproduction")
    expect(normalizeToken("STUDIO-production")).toBe("studioproduction")
  })
})

describe("enum matching", () => {
  it("matches a service type by label or by key", () => {
    expect(matchServiceType("Studio Production")).toBe("studio_production")
    expect(matchServiceType("studio_production")).toBe("studio_production")
    expect(matchServiceType("PR")).toBe("pr")
    expect(matchServiceType("nonsense")).toBeNull()
  })
  it("splits an array into matched keys and unmatched raws (deduped)", () => {
    const { matched, unmatched } = matchServiceTypes(["PR", "Studio Production", "Studio Production", "unknown"])
    expect(matched).toEqual(["pr", "studio_production"])
    expect(unmatched).toEqual(["unknown"])
  })
  it("matches property / project / revenue / recurring vocabularies", () => {
    expect(matchPropertyType("Festival")).toBe("festival")
    expect(matchProjectType("media_rights")).toBe("media_rights")
    expect(matchProjectType("Media Rights")).toBe("media_rights")
    expect(matchRevenueCategory("live")).toBe("live")
    expect(matchRevenueCategory("Content")).toBe("content")
    expect(matchRecurringSplitKind("flat")).toBe("flat")
    expect(matchRecurringSplitKind("weird")).toBeNull()
  })
})

describe("validIsoDate", () => {
  it("accepts a real ISO date", () => {
    expect(validIsoDate("2026-03-04")).toBe("2026-03-04")
    expect(validIsoDate("  2026-12-31 ")).toBe("2026-12-31")
  })
  it("rejects ambiguous, non-ISO, or impossible dates", () => {
    expect(validIsoDate("3/4/2026")).toBeNull()
    expect(validIsoDate("04-03-2026")).toBeNull()
    expect(validIsoDate("2026-02-31")).toBeNull()
    expect(validIsoDate("2026-13-01")).toBeNull()
    expect(validIsoDate("next tuesday")).toBeNull()
  })
})

describe("normalizeCurrency", () => {
  const codes = new Set(["USD", "INR", "EUR"])
  it("maps symbols and words to a valid code", () => {
    expect(normalizeCurrency("₹", codes)).toBe("INR")
    expect(normalizeCurrency("$", codes)).toBe("USD")
    expect(normalizeCurrency("usd", codes)).toBe("USD")
    expect(normalizeCurrency("INR", codes)).toBe("INR")
  })
  it("returns null for a code not in the registry", () => {
    expect(normalizeCurrency("£", codes)).toBeNull() // GBP not active here
    expect(normalizeCurrency("XYZ", codes)).toBeNull()
  })
})

describe("parseAmount", () => {
  it("strips separators and a leading symbol/word", () => {
    expect(parseAmount("50,00,000")).toBe("5000000")
    expect(parseAmount("INR 50000")).toBe("50000")
    expect(parseAmount("$1,250.50")).toBe("1250.50")
    expect(parseAmount("  42 ")).toBe("42")
  })
  it("rejects non-numbers", () => {
    expect(parseAmount("a lot")).toBeNull()
    expect(parseAmount("")).toBeNull()
    expect(parseAmount("12.3.4")).toBeNull()
  })
})

describe("parsePercent", () => {
  it("parses in-range percentages", () => {
    expect(parsePercent("45%")).toBe(45)
    expect(parsePercent(30)).toBe(30)
  })
  it("rejects out-of-range or junk", () => {
    expect(parsePercent(150)).toBeNull()
    expect(parsePercent("abc")).toBeNull()
    expect(parsePercent(-5)).toBeNull()
  })
})
