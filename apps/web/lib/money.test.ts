import { describe, it, expect } from "vitest"
import {
  moneyFromCents,
  moneyFromDecimal,
  addMoney,
  subtractMoney,
  multiplyMoney,
  allocateMoney,
  moneyToDecimal,
  moneyToCents,
  formatMoney,
  eqMoney,
  gtMoney,
  gteMoney,
  ltMoney,
  lteMoney,
  isPositiveMoney,
  isNegativeMoney,
  isZeroMoney,
  USD,
  INR,
} from "./money"

describe("money helpers", () => {
  describe("creation", () => {
    it("creates money from cents", () => {
      const m = moneyFromCents(1999, USD)
      expect(moneyToDecimal(m)).toBe("19.99")
    })

    it("creates money from decimal string", () => {
      const m = moneyFromDecimal("19.99", USD)
      expect(moneyToCents(m)).toBe(1999)
    })

    it("creates money from decimal number", () => {
      const m = moneyFromDecimal(19.99, USD)
      expect(moneyToCents(m)).toBe(1999)
    })

    it("pads fractional part to currency exponent", () => {
      const m = moneyFromDecimal("19.9", USD)
      expect(moneyToCents(m)).toBe(1990)
    })

    it("handles INR correctly", () => {
      const m = moneyFromDecimal("1500.50", INR)
      expect(moneyToCents(m)).toBe(150050)
    })

    it("defaults to USD", () => {
      const m = moneyFromCents(100)
      expect(moneyToDecimal(m)).toBe("1.00")
    })
  })

  describe("arithmetic", () => {
    it("adds money", () => {
      const a = moneyFromCents(1000, USD)
      const b = moneyFromCents(500, USD)
      expect(moneyToDecimal(addMoney(a, b))).toBe("15.00")
    })

    it("subtracts money", () => {
      const a = moneyFromCents(1000, USD)
      const b = moneyFromCents(250, USD)
      expect(moneyToDecimal(subtractMoney(a, b))).toBe("7.50")
    })

    it("multiplies money by number", () => {
      const a = moneyFromCents(1000, USD)
      expect(moneyToDecimal(multiplyMoney(a, 3))).toBe("30.00")
    })

    it("allocates money by ratios", () => {
      const a = moneyFromCents(1000, USD)
      const parts = allocateMoney(a, [1, 1])
      expect(parts.length).toBe(2)
      expect(moneyToCents(parts[0]) + moneyToCents(parts[1])).toBe(1000)
    })
  })

  describe("formatting", () => {
    it("formats to decimal string", () => {
      const m = moneyFromCents(1999, USD)
      expect(moneyToDecimal(m)).toBe("19.99")
    })

    it("formats to currency string", () => {
      const m = moneyFromCents(1999, USD)
      expect(formatMoney(m)).toBe("$19.99")
    })
  })

  describe("comparison", () => {
    it("checks equality", () => {
      const a = moneyFromCents(1000, USD)
      const b = moneyFromCents(1000, USD)
      const c = moneyFromCents(500, USD)
      expect(eqMoney(a, b)).toBe(true)
      expect(eqMoney(a, c)).toBe(false)
    })

    it("checks greater than", () => {
      const a = moneyFromCents(1000, USD)
      const b = moneyFromCents(500, USD)
      expect(gtMoney(a, b)).toBe(true)
      expect(gtMoney(b, a)).toBe(false)
    })

    it("checks greater than or equal", () => {
      const a = moneyFromCents(1000, USD)
      const b = moneyFromCents(1000, USD)
      const c = moneyFromCents(500, USD)
      expect(gteMoney(a, b)).toBe(true)
      expect(gteMoney(a, c)).toBe(true)
      expect(gteMoney(c, a)).toBe(false)
    })

    it("checks less than", () => {
      const a = moneyFromCents(500, USD)
      const b = moneyFromCents(1000, USD)
      expect(ltMoney(a, b)).toBe(true)
      expect(ltMoney(b, a)).toBe(false)
    })

    it("checks less than or equal", () => {
      const a = moneyFromCents(500, USD)
      const b = moneyFromCents(500, USD)
      const c = moneyFromCents(1000, USD)
      expect(lteMoney(a, b)).toBe(true)
      expect(lteMoney(a, c)).toBe(true)
      expect(lteMoney(c, a)).toBe(false)
    })

    it("checks positivity", () => {
      expect(isPositiveMoney(moneyFromCents(100, USD))).toBe(true)
      expect(isPositiveMoney(moneyFromCents(0, USD))).toBe(false)
    })

    it("checks negativity", () => {
      expect(isNegativeMoney(moneyFromCents(-100, USD))).toBe(true)
      expect(isNegativeMoney(moneyFromCents(0, USD))).toBe(false)
    })

    it("checks zero", () => {
      expect(isZeroMoney(moneyFromCents(0, USD))).toBe(true)
      expect(isZeroMoney(moneyFromCents(100, USD))).toBe(false)
    })
  })
})
