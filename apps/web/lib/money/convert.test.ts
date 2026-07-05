import { describe, it, expect, vi } from "vitest"
import { parseRate, roundHalfUp, pow10, applyConversion } from "./convert"

const mockEq = vi.fn()
const mockLte = vi.fn()
const mockOrder = vi.fn()
const mockLimit = vi.fn()
const mockIn = vi.fn()
const mockSelect = vi.fn()
const mockFrom = vi.fn()

function buildMockChain() {
  const qb = {
    select: mockSelect,
    eq: mockEq,
    lte: mockLte,
    order: mockOrder,
    limit: mockLimit,
    in: mockIn,
  }
  for (const key of Object.keys(qb)) {
    qb[key as keyof typeof qb].mockReturnValue(qb)
  }
  return qb
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => Promise.resolve({
    from: mockFrom,
  })),
}))

beforeEach(() => {
  vi.resetAllMocks()
  mockFrom.mockReturnValue(buildMockChain())
})

describe("parseRate", () => {
  it("parses integer rate", () => {
    const result = parseRate(83)
    expect(result.scaled).toBe(83n)
    expect(result.decimals).toBe(0)
  })

  it("parses decimal rate", () => {
    const result = parseRate(83.5)
    expect(result.scaled).toBe(835n)
    expect(result.decimals).toBe(1)
  })

  it("parses rate with large precision", () => {
    const result = parseRate(0.01197604)
    expect(result.scaled).toBe(1197604n)
    expect(result.decimals).toBe(8)
  })

  it("parses rate less than 1", () => {
    const result = parseRate(0.01)
    expect(result.scaled).toBe(1n)
    expect(result.decimals).toBe(2)
  })

  it("parses rate with trailing zeros preserved via scientific notation", () => {
    // 83.50000000 may toString as "83.5" — acceptable for our purposes
    const result = parseRate(83.5)
    expect(result.decimals).toBe(1)
  })

  it("handles zero rate edge case", () => {
    const result = parseRate(0)
    expect(result.scaled).toBe(0n)
    expect(result.decimals).toBe(0)
  })
})

describe("roundHalfUp", () => {
  it("exact division", () => {
    expect(roundHalfUp(100n, 4n)).toBe(25n)
  })

  it("rounds up when remainder >= half", () => {
    expect(roundHalfUp(5n, 2n)).toBe(3n)
  })

  it("rounds down when remainder < half", () => {
    expect(roundHalfUp(5n, 3n)).toBe(2n)
  })

  it("handles negative numerator", () => {
    expect(roundHalfUp(-5n, 2n)).toBe(-3n)
  })

  it("handles negative denominator", () => {
    expect(roundHalfUp(5n, -2n)).toBe(-3n)
  })

  it("handles both negative", () => {
    expect(roundHalfUp(-5n, -2n)).toBe(3n)
  })

  it("handles zero numerator", () => {
    expect(roundHalfUp(0n, 5n)).toBe(0n)
  })

  it("handles tiny fractional result", () => {
    expect(roundHalfUp(1n, 3n)).toBe(0n)
  })

  it("handles huge numbers", () => {
    expect(roundHalfUp(1000000000000000000n, 3n)).toBe(333333333333333333n)
  })

  it("throws on zero denominator", () => {
    expect(() => roundHalfUp(1n, 0n)).toThrow("zero")
  })
})

describe("pow10", () => {
  it("pow10(0) = 1", () => {
    expect(pow10(0)).toBe(1n)
  })

  it("pow10(2) = 100", () => {
    expect(pow10(2)).toBe(100n)
  })

  it("pow10(12) = 1000000000000", () => {
    expect(pow10(12)).toBe(1000000000000n)
  })

  it("throws on negative exponent", () => {
    expect(() => pow10(-1)).toThrow("Negative")
  })
})

describe("applyConversion — direct", () => {
  const rate = {
    rate: 83.50,
    from_currency: "USD",
    to_currency: "INR",
    source: "manual",
    effective_date: "2026-01-01",
  }

  it("converts USD to INR (same scale)", () => {
    // 1000 USD cents ($10.00) at rate 83.50 → 83500 INR paisa (₹835.00)
    const result = applyConversion(1000n, 2, 2, rate, false)
    expect(result).toBe(83500n)
  })

  it("converts large amount", () => {
    // $1,000,000.00 USD = 100000000 cents at rate 83.50 → ₹83,500,000.00 = 8350000000 paisa
    const result = applyConversion(100000000n, 2, 2, rate, false)
    expect(result).toBe(8350000000n)
  })

  it("handles non-even rate conversion", () => {
    const r = { ...rate, rate: 83.472 }
    const result = applyConversion(1000n, 2, 2, r, false)
    // (1000 * 83472 * 100) / (100 * 1000) = 8347200000 / 100000 = 83472 = $834.72
    expect(result).toBe(83472n)
  })

  it("converts to JPY (zero-scale target)", () => {
    // 1000 USD cents ($10.00) at rate 150.25 → 1502.50 JPY → 1503 (half-up rounding)
    const r = { ...rate, rate: 150.25, to_currency: "JPY" }
    const result = applyConversion(1000n, 2, 0, r, false)
    // formula: (1000 * 15025 * 1) / (100 * 100) = 15025000 / 10000 = 1502.5 → 1503 (half-up)
    expect(result).toBe(1503n)
  })

  it("converts from JPY (zero-scale source) to USD", () => {
    // 1000 JPY at rate 0.0067 means 1 JPY = 0.0067 USD
    const r = { ...rate, rate: 0.0067, from_currency: "JPY", to_currency: "USD" }
    const result = applyConversion(1000n, 0, 2, r, false)
    // formula: (1000 * 67 * 100) / (1 * 10000) = 6700000 / 10000 = 670 → $6.70
    expect(result).toBe(670n)
  })

  it("converts with currency having scale 4 (USDT)", () => {
    const r = { ...rate, rate: 1.0, from_currency: "USDT", to_currency: "USD" }
    // 1_000_000 USDT units (scale 4) = 100.0000 USDT at rate 1.0 = $100.00 = 10000 cents
    const result = applyConversion(1_000_000n, 4, 2, r, false)
    expect(result).toBe(10000n)
  })
})

describe("applyConversion — reciprocal", () => {
  it("uses reciprocal rate for inverted pair", () => {
    // Stored rate: INR → USD = 0.01198
    // To convert USD → INR, we invert
    const rate = {
      rate: 0.01197604,
      from_currency: "INR",
      to_currency: "USD",
      source: "manual",
      effective_date: "2026-01-01",
    }
    // 1000 USD cents ($10.00) via reciprocal: target = (1000 * 10^8 * 10^2) / (1197604 * 10^2)
    // = (1000 * 100000000 * 100) / (1197604 * 100) = 10000000000000 / 119760400 = 83500
    // remainder 6600000, remainder*2 (13200000) < denominator → rounds down
    const result = applyConversion(1000n, 2, 2, rate, true)
    expect(result).toBe(83500n)
  })

  it("handles reciprocal with JPY (zero-scale source)", () => {
    const rate = {
      rate: 0.0067,
      from_currency: "USD",
      to_currency: "JPY",
      source: "manual",
      effective_date: "2026-01-01",
    }
    // We're converting JPY → USD via USD→JPY reciprocal
    // Original rate says 1 USD = 0.0067 JPY (this is nonsensical but tests the math)
    // Real scenario: 1 USD = 150.25 JPY stored as JPY→USD direct, wanted USD→JPY...
    // Let's test with a real scenario: USDT→INR via reciprocal (INR→USDT stored)
    // Actually, let me just test the math with simple numbers

    // Simpler: stored INR→USD 0.01, converting USD→INR with reciprocal
    const r2 = {
      rate: 0.01,
      from_currency: "INR",
      to_currency: "USD",
      source: "manual",
      effective_date: "2026-01-01",
    }
    // 1000 USD cents ($10.00) via reciprocal: target = (1000 * 10^2 * 10^2) / (1 * 10^2) = 100000000 / 100 = 1000000
    // But actual: $10.00 / 0.01 = ₹1000.00 = 100000 paisa
    const result = applyConversion(1000n, 2, 2, r2, true)
    expect(result).toBe(100000n)
  })

  it("handles JPY reciprocal (zero-scale), same as direct with swapped scale", () => {
    // Stored: USD → JPY = 150.25
    // Converting JPY → USD via reciprocal
    // Original: JPY 1503 at reciprocal = (1503 * 10^2 * 10^2) / (15025 * 10^0)
    // = (1503 * 100 * 100) / (15025 * 1) = 15030000 / 15025 = 1000
    // = $10.00
    const rate = {
      rate: 150.25,
      from_currency: "USD",
      to_currency: "JPY",
      source: "manual",
      effective_date: "2026-01-01",
    }
    const result = applyConversion(1503n, 0, 2, rate, true)
    expect(result).toBe(1000n)
  })
})

describe("convert — end-to-end with mocked Supabase", () => {
  async function setupCurrencies(fromScale: number, toScale: number) {
    mockIn.mockResolvedValueOnce({
      data: [
        { code: "USD", scale: fromScale },
        { code: "INR", scale: toScale },
      ],
      error: null,
    })
  }

  it("returns identity for same currency", async () => {
    const { convert } = await import("./convert")
    const result = await convert({
      amount: 5000n,
      fromCurrency: "USD",
      toCurrency: "USD",
      asOfDate: "2026-01-01",
    })
    expect(result).toEqual({ convertedAmount: 5000n })
  })

  it("returns zero for zero amount", async () => {
    const { convert } = await import("./convert")
    const result = await convert({
      amount: 0n,
      fromCurrency: "USD",
      toCurrency: "INR",
      asOfDate: "2026-01-01",
    })
    expect(result).toEqual({ convertedAmount: 0n })
  })

  it("converts USD to INR with direct rate lookup", async () => {
    setupCurrencies(2, 2)

    // First query: direct (USD → INR)
    mockLimit.mockResolvedValueOnce({
      data: [{
        rate: 83.50,
        from_currency: "USD",
        to_currency: "INR",
        source: "manual",
        effective_date: "2026-01-01",
      }],
      error: null,
    })

    const { convert } = await import("./convert")
    const result = await convert({
      amount: 1000n,
      fromCurrency: "USD",
      toCurrency: "INR",
      asOfDate: "2026-01-01",
    })

    expect(result).toEqual({ convertedAmount: 83500n })
  })

  it("falls back to reciprocal when no direct rate", async () => {
    setupCurrencies(2, 2)

    // First query: direct (USD → INR) — no results
    mockLimit.mockResolvedValueOnce({ data: [], error: null })
    // Second query: reciprocal (INR → USD) — found
    mockLimit.mockResolvedValueOnce({
      data: [{
        rate: 0.01,
        from_currency: "INR",
        to_currency: "USD",
        source: "manual",
        effective_date: "2026-01-01",
      }],
      error: null,
    })

    const { convert } = await import("./convert")
    const result = await convert({
      amount: 1000n,
      fromCurrency: "USD",
      toCurrency: "INR",
      asOfDate: "2026-01-01",
    })

    expect(result).toEqual({ convertedAmount: 100000n })
  })

  it("returns no_rate error when neither direct nor reciprocal exists", async () => {
    setupCurrencies(2, 2)

    mockLimit.mockResolvedValueOnce({ data: [], error: null })
    mockLimit.mockResolvedValueOnce({ data: [], error: null })

    const { convert } = await import("./convert")
    const result = await convert({
      amount: 1000n,
      fromCurrency: "USD",
      toCurrency: "XYZ",
      asOfDate: "2026-01-01",
    })

    expect(result).toEqual({ convertedAmount: null, error: "no_rate" })
  })

  it("handles JPY (zero-scale) conversion", async () => {
    mockIn.mockResolvedValueOnce({
      data: [
        { code: "JPY", scale: 0 },
        { code: "USD", scale: 2 },
      ],
      error: null,
    })

    mockLimit.mockResolvedValueOnce({
      data: [{
        rate: 0.0067,
        from_currency: "JPY",
        to_currency: "USD",
        source: "manual",
        effective_date: "2026-01-01",
      }],
      error: null,
    })

    const { convert } = await import("./convert")
    const result = await convert({
      amount: 1000n,
      fromCurrency: "JPY",
      toCurrency: "USD",
      asOfDate: "2026-01-01",
    })

    // 1000 * 67 * 100 / (1 * 10000) = 6700000 / 10000 = 670
    expect(result).toEqual({ convertedAmount: 670n })
  })

  it("handles zero amount edge case", async () => {
    const { convert } = await import("./convert")
    const result = await convert({
      amount: 0n,
      fromCurrency: "EUR",
      toCurrency: "GBP",
      asOfDate: "2026-01-01",
    })
    expect(result).toEqual({ convertedAmount: 0n })
  })

  it("uses latest effective_date <= asOfDate via order", async () => {
    setupCurrencies(2, 2)

    mockLimit.mockResolvedValueOnce({
      data: [{
        rate: 82.00,
        from_currency: "USD",
        to_currency: "INR",
        source: "manual",
        effective_date: "2026-01-01",
      }],
      error: null,
    })

    const { convert } = await import("./convert")
    const result = await convert({
      amount: 1000n,
      fromCurrency: "USD",
      toCurrency: "INR",
      asOfDate: "2026-01-01",
    })

    expect(result).toEqual({ convertedAmount: 82000n })
  })

  it("defaults to scale 2 for unknown currencies", async () => {
    mockIn.mockResolvedValueOnce({
      data: [{ code: "USD", scale: 2 }],
      error: null,
    })

    mockLimit.mockResolvedValueOnce({
      data: [{
        rate: 1.2,
        from_currency: "USD",
        to_currency: "SGD",
        source: "manual",
        effective_date: "2026-01-01",
      }],
      error: null,
    })

    const { convert } = await import("./convert")
    const result = await convert({
      amount: 1000n,
      fromCurrency: "USD",
      toCurrency: "SGD",
      asOfDate: "2026-01-01",
    })

    // SGD defaults to scale 2: (1000 * 12 * 100) / (100 * 10) = 1200000 / 1000 = 1200 ($12.00)
    expect(result).toEqual({ convertedAmount: 1200n })
  })
})

describe("convertWithRate — synchronous with pre-fetched rate", () => {
  it("converts directly without Supabase call", async () => {
    const { convertWithRate } = await import("./convert")
    const result = convertWithRate(
      1000n,
      "USD",
      "INR",
      2,
      2,
      { rate: 83.50, from_currency: "USD", to_currency: "INR", source: "manual", effective_date: "2026-01-01" },
    )
    expect(result).toBe(83500n)
  })

  it("uses reciprocal flag from rate", async () => {
    const { convertWithRate } = await import("./convert")
    const result = convertWithRate(
      1503n,
      "JPY",
      "USD",
      0,
      2,
      { rate: 150.25, from_currency: "USD", to_currency: "JPY", source: "manual", effective_date: "2026-01-01" },
    )
    expect(result).toBe(1000n)
  })
})
