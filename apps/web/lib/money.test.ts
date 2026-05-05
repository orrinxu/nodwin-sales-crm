import { describe, it, expect } from "vitest"
import { Money, isValidCurrencyCode } from "./money"

describe("Money.fromCents", () => {
  it("creates a Money instance from integer cents", () => {
    const m = Money.fromCents(10050, "USD")
    expect(m.cents).toBe(10050)
    expect(m.currency).toBe("USD")
  })

  it("rejects non-integer cents", () => {
    expect(() => Money.fromCents(100.5, "USD")).toThrow("integer")
  })
})

describe("Money.fromAmount", () => {
  it("creates a Money instance from decimal amount", () => {
    const m = Money.fromAmount(100.50, "USD")
    expect(m.cents).toBe(10050)
  })

  it("handles whole numbers", () => {
    const m = Money.fromAmount(50, "USD")
    expect(m.cents).toBe(5000)
  })

  it("handles zero", () => {
    const m = Money.fromAmount(0, "USD")
    expect(m.cents).toBe(0)
  })

  it("handles negative amounts", () => {
    const m = Money.fromAmount(-25.99, "USD")
    expect(m.cents).toBe(-2599)
  })

  it("rounds fractional cents to nearest cent", () => {
    const m = Money.fromAmount(10.005, "USD")
    expect(m.cents).toBe(1001)
  })

  it("avoids float precision bug for 2.675", () => {
    // 2.675 * 100 = 267.4999... in JS float, which Math.round gives 267
    // Our string-based parsing should correctly produce 268
    const m = Money.fromAmount(2.675, "USD")
    expect(m.cents).toBe(268)
  })

  it("accepts string input to avoid float issues", () => {
    const m = Money.fromAmount("2.675", "USD")
    expect(m.cents).toBe(268)
  })
})

describe("Money.fromString", () => {
  it("parses a simple decimal string", () => {
    const m = Money.fromString("99.99", "USD")
    expect(m.cents).toBe(9999)
  })

  it("parses string with currency symbol", () => {
    const m = Money.fromString("$199.99", "USD")
    expect(m.cents).toBe(19999)
  })

  it("parses string with commas", () => {
    const m = Money.fromString("1,234.56", "USD")
    expect(m.cents).toBe(123456)
  })

  it("parses negative string", () => {
    const m = Money.fromString("-50.00", "USD")
    expect(m.cents).toBe(-5000)
  })

  it("parses negative amount with parentheses", () => {
    const m = Money.fromString("(50.00)", "USD")
    expect(m.cents).toBe(-5000)
  })

  it("parses negative with commas and parentheses", () => {
    const m = Money.fromString("(1,234.56)", "USD")
    expect(m.cents).toBe(-123456)
  })

  it("avoids float precision bug for 2.675", () => {
    const m = Money.fromString("2.675", "USD")
    expect(m.cents).toBe(268)
  })

  it("throws on unparseable string", () => {
    expect(() => Money.fromString("abc", "USD")).toThrow("Cannot parse")
  })

  describe("Unicode validation", () => {
    it("rejects BiDi override characters", () => {
      expect(() => Money.fromString("99\u202E99", "USD")).toThrow("BiDi")
    })

    it("rejects left-to-right mark", () => {
      expect(() => Money.fromString("99\u200E99", "USD")).toThrow("BiDi")
    })

    it("rejects right-to-left mark", () => {
      expect(() => Money.fromString("99\u200F99", "USD")).toThrow("BiDi")
    })

    it("rejects Arabic-Indic digits (homoglyphs)", () => {
      expect(() => Money.fromString("\u0661\u0660\u0660", "USD")).toThrow("non-ASCII digits")
    })

    it("rejects fullwidth digits (homoglyphs)", () => {
      expect(() => Money.fromString("\uFF11\uFF10\uFF10", "USD")).toThrow("non-ASCII digits")
    })

    it("rejects Extended Arabic-Indic digits", () => {
      expect(() => Money.fromString("\u06F1\u06F0", "USD")).toThrow("non-ASCII digits")
    })

    it("rejects Devanagari digits", () => {
      expect(() => Money.fromString("\u0967\u0966", "USD")).toThrow("non-ASCII digits")
    })

    it("rejects Bengali digits", () => {
      expect(() => Money.fromString("\u09E7\u09E6", "USD")).toThrow("non-ASCII digits")
    })

    it("rejects Thai digits", () => {
      expect(() => Money.fromString("\u0E51\u0E50", "USD")).toThrow("non-ASCII digits")
    })

    it("rejects mixed ASCII and homoglyph digits", () => {
      expect(() => Money.fromString("10\u0968", "USD")).toThrow("non-ASCII digits")
    })

    it("rejects mathematical bold digits", () => {
      expect(() => Money.fromString("\uD835\uDFCE", "USD")).toThrow("non-ASCII digits")
    })
  })
})

describe("Money.zero", () => {
  it("creates a zero-value Money", () => {
    const m = Money.zero("USD")
    expect(m.cents).toBe(0)
    expect(m.currency).toBe("USD")
    expect(m.isZero()).toBe(true)
  })
})

describe("toAmount", () => {
  it("converts cents back to decimal", () => {
    expect(Money.fromCents(12345, "USD").toAmount()).toBe(123.45)
  })

  it("handles negative amounts", () => {
    expect(Money.fromCents(-500, "USD").toAmount()).toBe(-5.00)
  })
})

describe("toDisplay", () => {
  it("formats as US currency by default", () => {
    const m = Money.fromCents(1999, "USD")
    expect(m.toDisplay()).toBe("$19.99")
  })

  it("formats INR with locale", () => {
    const m = Money.fromAmount(100000, "INR")
    expect(m.toDisplay("en-IN")).toContain("₹1,00,000.00")
  })

  it("formats JPY (zero decimal currency)", () => {
    const m = Money.fromAmount(500, "JPY")
    expect(m.toDisplay("en-US")).toContain("¥500")
  })

  it("falls back to en-US for invalid locale", () => {
    const m = Money.fromCents(1999, "USD")
    expect(m.toDisplay("invalid-locale")).toBe("$19.99")
  })

  it("falls back to en-US for empty string locale", () => {
    const m = Money.fromCents(1999, "USD")
    expect(m.toDisplay("")).toBe("$19.99")
  })

  it("forces Latin numerals regardless of locale", () => {
    const m = Money.fromAmount(1234.56, "USD")
    const output = m.toDisplay("ar-SA")
    const digits = output.replace(/[^0-9]/g, "")
    expect(digits).toBe("123456")
  })

  it("forces Latin numerals even with u-nu-arab extension", () => {
    const m = Money.fromAmount(1234.56, "USD")
    const output = m.toDisplay("ar-SA-u-nu-arab")
    const digits = output.replace(/[^0-9]/g, "")
    expect(digits).toBe("123456")
  })
})

describe("toJSON", () => {
  it("serializes to cents and currency", () => {
    const m = Money.fromCents(5000, "USD")
    expect(m.toJSON()).toEqual({ cents: 5000, currency: "USD" })
  })
})

describe("add", () => {
  it("adds two same-currency amounts", () => {
    const a = Money.fromCents(1000, "USD")
    const b = Money.fromCents(2500, "USD")
    expect(a.add(b).cents).toBe(3500)
  })

  it("throws on currency mismatch", () => {
    const a = Money.fromCents(1000, "USD")
    const b = Money.fromCents(2000, "EUR")
    expect(() => a.add(b)).toThrow("Currency mismatch")
  })

  it("is commutative", () => {
    const a = Money.fromCents(300, "USD")
    const b = Money.fromCents(700, "USD")
    expect(a.add(b).cents).toBe(b.add(a).cents)
  })
})

describe("subtract", () => {
  it("subtracts same-currency amounts", () => {
    const a = Money.fromCents(5000, "USD")
    const b = Money.fromCents(1500, "USD")
    expect(a.subtract(b).cents).toBe(3500)
  })

  it("throws on currency mismatch", () => {
    expect(() =>
      Money.fromCents(100, "USD").subtract(Money.fromCents(100, "GBP")),
    ).toThrow("Currency mismatch")
  })

  it("can result in negative", () => {
    const a = Money.fromCents(100, "USD")
    const b = Money.fromCents(500, "USD")
    expect(a.subtract(b).cents).toBe(-400)
  })
})

describe("multiply", () => {
  it("multiplies by an integer factor", () => {
    const m = Money.fromCents(1000, "USD")
    expect(m.multiply(3).cents).toBe(3000)
  })

  it("multiplies by a decimal factor with round mode", () => {
    const m = Money.fromCents(100, "USD")
    expect(m.multiply(1.5, "round").cents).toBe(150)
  })

  it("rounds fractional cents with floor", () => {
    const m = Money.fromCents(100, "USD")
    expect(m.multiply(1.333, "floor").cents).toBe(133)
  })

  it("rounds fractional cents with ceil", () => {
    const m = Money.fromCents(100, "USD")
    expect(m.multiply(1.333, "ceil").cents).toBe(134)
  })
})

describe("divide", () => {
  it("divides by an integer divisor", () => {
    const m = Money.fromCents(1000, "USD")
    expect(m.divide(4).cents).toBe(250)
  })

  it("rounds to nearest cent by default", () => {
    const m = Money.fromCents(100, "USD")
    expect(m.divide(3).cents).toBe(33)
  })

  it("floors on divide", () => {
    const m = Money.fromCents(100, "USD")
    expect(m.divide(3, "floor").cents).toBe(33)
  })

  it("ceils on divide", () => {
    const m = Money.fromCents(100, "USD")
    expect(m.divide(3, "ceil").cents).toBe(34)
  })

  it("throws on division by zero", () => {
    expect(() => Money.fromCents(100, "USD").divide(0)).toThrow("zero")
  })
})

describe("abs and negate", () => {
  it("abs returns positive representation", () => {
    expect(Money.fromCents(-500, "USD").abs().cents).toBe(500)
  })

  it("abs on positive returns same", () => {
    expect(Money.fromCents(500, "USD").abs().cents).toBe(500)
  })

  it("negate flips sign", () => {
    expect(Money.fromCents(500, "USD").negate().cents).toBe(-500)
  })
})

describe("comparison operators", () => {
  const a = Money.fromCents(1000, "USD")
  const b = Money.fromCents(2000, "USD")

  it("eq", () => {
    expect(a.eq(Money.fromCents(1000, "USD"))).toBe(true)
    expect(a.eq(b)).toBe(false)
  })

  it("gt / gte", () => {
    expect(b.gt(a)).toBe(true)
    expect(a.gt(b)).toBe(false)
    expect(a.gte(a)).toBe(true)
    expect(b.gte(a)).toBe(true)
  })

  it("lt / lte", () => {
    expect(a.lt(b)).toBe(true)
    expect(b.lt(a)).toBe(false)
    expect(a.lte(a)).toBe(true)
    expect(a.lte(b)).toBe(true)
  })

  it("throws on cross-currency comparison", () => {
    const usd = Money.fromCents(100, "USD")
    const eur = Money.fromCents(100, "EUR")
    expect(() => usd.eq(eur)).toThrow("Currency mismatch")
    expect(() => usd.gt(eur)).toThrow("Currency mismatch")
    expect(() => usd.lt(eur)).toThrow("Currency mismatch")
  })
})

describe("isZero / isNegative", () => {
  it("isZero", () => {
    expect(Money.fromCents(0, "USD").isZero()).toBe(true)
    expect(Money.fromCents(1, "USD").isZero()).toBe(false)
  })

  it("isNegative", () => {
    expect(Money.fromCents(-1, "USD").isNegative()).toBe(true)
    expect(Money.fromCents(0, "USD").isNegative()).toBe(false)
    expect(Money.fromCents(1, "USD").isNegative()).toBe(false)
  })
})

describe("min / max", () => {
  const a = Money.fromCents(500, "USD")
  const b = Money.fromCents(1500, "USD")

  it("min returns the smaller amount", () => {
    expect(a.min(b).cents).toBe(500)
    expect(b.min(a).cents).toBe(500)
  })

  it("max returns the larger amount", () => {
    expect(a.max(b).cents).toBe(1500)
    expect(b.max(a).cents).toBe(1500)
  })
})

describe("rounding edge cases", () => {
  it("handles amounts smaller than a cent", () => {
    const m = Money.fromAmount(0.001, "USD")
    expect(m.cents).toBe(0)
  })

  it("handles amounts that round up from sub-cent", () => {
    const m = Money.fromAmount(0.009, "USD")
    expect(m.cents).toBe(1)
  })

  it("handles very large amounts without precision loss", () => {
    const m = Money.fromCents(1_000_000_000_000, "USD")
    expect(m.toAmount()).toBe(10_000_000_000)
  })

  it("parses large numeric(20,4) string without precision loss", () => {
    const m = Money.fromAmount("123456789012.3456", "USD")
    expect(m.cents).toBe(12_345_678_901_235)
    expect(m.toAmount()).toBe(123_456_789_012.35)
  })

  it("round-trips large numeric(20,4) string through fromAmount", () => {
    const original = "9999999999999.9999"
    const m = Money.fromAmount(original, "USD")
    expect(m.cents).toBe(1_000_000_000_000_000)
    expect(m.toAmount()).toBe(10_000_000_000_000)
  })

  it("multiply by zero", () => {
    expect(Money.fromCents(500, "USD").multiply(0).isZero()).toBe(true)
  })

  it("divide by one does nothing", () => {
    const m = Money.fromCents(999, "USD")
    expect(m.divide(1).cents).toBe(999)
  })

  it("multiply by fraction results in fractional cent floor", () => {
    const m = Money.fromCents(1, "USD")
    expect(m.multiply(0.333, "floor").cents).toBe(0)
  })

  it("multiply by fraction results in fractional cent ceil", () => {
    const m = Money.fromCents(1, "USD")
    expect(m.multiply(0.333, "ceil").cents).toBe(1)
  })
})

describe("isValidCurrencyCode", () => {
  it("accepts standard ISO 4217 codes", () => {
    expect(isValidCurrencyCode("USD")).toBe(true)
    expect(isValidCurrencyCode("EUR")).toBe(true)
    expect(isValidCurrencyCode("INR")).toBe(true)
    expect(isValidCurrencyCode("JPY")).toBe(true)
  })

  it("accepts USDT (4-letter code)", () => {
    expect(isValidCurrencyCode("USDT")).toBe(true)
  })

  it("accepts single-letter codes", () => {
    expect(isValidCurrencyCode("X")).toBe(true)
  })

  it("accepts 8-character codes", () => {
    expect(isValidCurrencyCode("ABCDEF12")).toBe(true)
  })

  it("accepts codes with digits", () => {
    expect(isValidCurrencyCode("USD1")).toBe(true)
  })

  it("rejects codes with lowercase letters", () => {
    expect(isValidCurrencyCode("usd")).toBe(false)
    expect(isValidCurrencyCode("Usd")).toBe(false)
  })

  it("rejects codes with special characters", () => {
    expect(isValidCurrencyCode("US-D")).toBe(false)
    expect(isValidCurrencyCode("US_D")).toBe(false)
    expect(isValidCurrencyCode("US.D")).toBe(false)
  })

  it("rejects codes longer than 8 characters", () => {
    expect(isValidCurrencyCode("ABCDEFG12")).toBe(false)
    expect(isValidCurrencyCode("TOOLONGFORME")).toBe(false)
  })

  it("rejects empty string", () => {
    expect(isValidCurrencyCode("")).toBe(false)
  })

  it("rejects codes with spaces", () => {
    expect(isValidCurrencyCode("US D")).toBe(false)
    expect(isValidCurrencyCode(" USD")).toBe(false)
  })

  it("rejects codes with Unicode characters", () => {
    expect(isValidCurrencyCode("US\u00C9")).toBe(false)
    expect(isValidCurrencyCode("\u0420\u0423\u0411")).toBe(false)
  })

  it("rejects codes with emoji", () => {
    expect(isValidCurrencyCode("\u{1F4B0}")).toBe(false)
  })
})

describe("serialization round-trip", () => {
  it("JSON round-trips through toJSON", () => {
    const original = Money.fromCents(4242, "USD")
    const json = JSON.stringify(original)
    const parsed = JSON.parse(json)
    const restored = Money.fromCents(parsed.cents, parsed.currency)
    expect(restored.cents).toBe(4242)
    expect(restored.currency).toBe("USD")
    expect(original.eq(restored)).toBe(true)
  })
})
