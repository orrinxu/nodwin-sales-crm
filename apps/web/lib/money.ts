import {
  dinero,
  add,
  subtract,
  multiply as dineroMultiply,
  equal,
  greaterThan,
  greaterThanOrEqual,
  lessThan,
  lessThanOrEqual,
  isZero as dineroIsZero,
  isNegative as dineroIsNegative,
  minimum,
  maximum,
  toDecimal,
  toSnapshot,
  transformScale,
  trimScale,
  type Dinero,
  type DineroCurrency,
  halfUp,
  down,
  up,
} from "dinero.js"
import { USD } from "dinero.js"

export type RoundingMode = "round" | "floor" | "ceil"

export type CurrencyCode = string

const CURRENCY_CODE_PATTERN = /^[A-Z0-9]{1,8}$/

export function isValidCurrencyCode(code: string): boolean {
  return CURRENCY_CODE_PATTERN.test(code)
}

function toDineroCurrency(code: CurrencyCode): DineroCurrency<number> {
  const map: Record<string, DineroCurrency<number>> = {
    USD,
    EUR: { code: "EUR", base: 10, exponent: 2 },
    GBP: { code: "GBP", base: 10, exponent: 2 },
    INR: { code: "INR", base: 10, exponent: 2 },
    JPY: { code: "JPY", base: 10, exponent: 0 },
  }
  return map[code] ?? { code, base: 10, exponent: 2 }
}

function toDineroRounding(mode: RoundingMode) {
  switch (mode) {
    case "round":
      return halfUp
    case "floor":
      return down
    case "ceil":
      return up
  }
}

export interface MoneyData {
  cents: number
  currency: CurrencyCode
}

export class Money {
  private readonly d: Dinero<number>

  private constructor(d: Dinero<number>) {
    this.d = d
  }

  /** Raw cents value (integer in smallest currency unit). */
  get cents(): number {
    return toSnapshot(this.d).amount
  }

  get currency(): CurrencyCode {
    return toSnapshot(this.d).currency.code
  }

  static fromCents(cents: number | bigint, currency: CurrencyCode): Money {
    // eslint-disable-next-line custom/no-float-math-in-money-layer -- boundary conversion from bigint to number for dinero.js API
    const centsNum = typeof cents === "bigint" ? Number(cents) : cents
    if (!Number.isInteger(centsNum)) {
      throw new Error(`Money cents must be an integer, got ${centsNum}`)
    }
    const c = toDineroCurrency(currency)
    return new Money(dinero({ amount: centsNum, currency: c }))
  }

  static fromAmount(amount: number | string, currency: CurrencyCode): Money {
    if (typeof amount === "string") {
      return Money.fromString(amount, currency)
    }
    return Money.fromString(amount.toString(), currency)
  }

  static fromString(amount: string, currency: CurrencyCode): Money {
    // Reject BiDi control characters (used for visual spoofing)
    if (/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/.test(amount)) {
      throw new Error(`Cannot parse money from "${amount}": contains BiDi control characters`)
    }

    // Reject homoglyph digits — any Unicode decimal digit that is not an ASCII digit
    const withoutAsciiDigits = amount.replace(/[0-9]/g, "")
    if (/\p{Nd}/u.test(withoutAsciiDigits)) {
      throw new Error(`Cannot parse money from "${amount}": contains non-ASCII digits`)
    }

    // Clean: keep only allowed characters [0-9], comma, period, minus, parens, space
    let cleaned = amount.replace(/[^0-9.,\-( )]/g, "").trim()

    // Handle parentheses notation for negatives: (100) → -100
    if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
      cleaned = "-" + cleaned.slice(1, -1)
    }

    // Remove commas (thousands separators) before parsing
    cleaned = cleaned.replace(/,/g, "")

    const isNegative = cleaned.startsWith("-")
    const absStr = isNegative ? cleaned.slice(1) : cleaned

    if (absStr === "") {
      throw new Error(`Cannot parse money from "${amount}"`)
    }

    const c = toDineroCurrency(currency)
    const exponent = c.exponent

    const dotIndex = absStr.indexOf(".")
    const wholeStr = dotIndex >= 0 ? absStr.slice(0, dotIndex) : absStr
    const decimalStr = dotIndex >= 0 ? absStr.slice(dotIndex + 1) : ""

    if (!/^\d*$/.test(wholeStr) || !/^\d*$/.test(decimalStr)) {
      throw new Error(`Cannot parse money from "${amount}"`)
    }

    const whole = wholeStr === "" ? 0n : BigInt(wholeStr)

    let subUnitPart = 0n
    let roundUp = false

    if (decimalStr.length > 0 && exponent > 0) {
      const relevantDigits = decimalStr.slice(0, exponent)
      subUnitPart = relevantDigits === "" ? 0n : BigInt(relevantDigits.padEnd(exponent, "0"))
      const nextDigit = decimalStr.charAt(exponent)
      if (nextDigit !== undefined && nextDigit !== "") {
        roundUp = nextDigit >= "5"
      }
    }

    const multiplier = pow10BigInt(exponent)
    // eslint-disable-next-line custom/no-float-math-in-money-layer -- bigint arithmetic safe
    let units = whole * multiplier + subUnitPart
    if (roundUp) {
      units += 1n
    }

    return Money.fromCents(isNegative ? -units : units, currency)
  }

  static zero(currency: CurrencyCode): Money {
    return Money.fromCents(0, currency)
  }

  /**
   * Return the decimal string representation (e.g. "123.45").
   * No float intermediates — dinero.js toDecimal produces a string.
   */
  toAmount(): string {
    return toDecimal(this.d)
  }

  /** Display only. Output is locale-aware but always uses Latin (ASCII 0-9) digits. Not suitable for machine parsing. Use `toAmount()` for decimal string. */
  toDisplay(locale = "en-US"): string {
    try {
      Intl.getCanonicalLocales(locale)
    } catch {
      locale = "en-US"
    }
    const formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: this.currency,
      numberingSystem: "latn",
    })
    // @ts-expect-error Intl.NumberFormat.prototype.format accepts decimal strings at runtime
    return formatter.format(this.toAmount())
  }

  toJSON(): MoneyData {
    return { cents: this.cents, currency: this.currency }
  }

  add(other: Money): Money {
    assertSameCurrency(this, other, "add")
    return new Money(add(this.d, other.d))
  }

  subtract(other: Money): Money {
    assertSameCurrency(this, other, "subtract")
    return new Money(subtract(this.d, other.d))
  }

  multiply(factor: string | number, mode: RoundingMode = "round"): Money {
    const factorStr = typeof factor === "number" ? factor.toString() : factor
    const { amount: scaledFactor, scale: factorScale } =
      decimalToScaledInteger(factorStr)
    const snap = toSnapshot(this.d)
    const product = BigInt(snap.amount) * scaledFactor
    const divisor = pow10BigInt(factorScale)
    const result = applyBigIntRounding(product, divisor, mode)
    return Money.fromCents(result, this.currency)
  }

  divide(divisor: string | number, mode: RoundingMode = "round"): Money {
    const divisorStr = typeof divisor === "number" ? divisor.toString() : divisor
    const { amount: scaledDivisor, scale: divisorScale } =
      decimalToScaledInteger(divisorStr)
    if (scaledDivisor === 0n) throw new Error("Cannot divide money by zero")
    const snap = toSnapshot(this.d)
    const dividend = BigInt(snap.amount) * pow10BigInt(divisorScale)
    const result = applyBigIntRounding(dividend, scaledDivisor, mode)
    return Money.fromCents(result, this.currency)
  }

  abs(): Money {
    return this.cents < 0 ? new Money(dineroMultiply(this.d, -1)) : new Money(this.d)
  }

  negate(): Money {
    return new Money(dineroMultiply(this.d, -1))
  }

  eq(other: Money): boolean {
    assertSameCurrency(this, other, "eq")
    return equal(this.d, other.d)
  }

  gt(other: Money): boolean {
    assertSameCurrency(this, other, "gt")
    return greaterThan(this.d, other.d)
  }

  gte(other: Money): boolean {
    assertSameCurrency(this, other, "gte")
    return greaterThanOrEqual(this.d, other.d)
  }

  lt(other: Money): boolean {
    assertSameCurrency(this, other, "lt")
    return lessThan(this.d, other.d)
  }

  lte(other: Money): boolean {
    assertSameCurrency(this, other, "lte")
    return lessThanOrEqual(this.d, other.d)
  }

  isZero(): boolean {
    return dineroIsZero(this.d)
  }

  isNegative(): boolean {
    return dineroIsNegative(this.d)
  }

  min(other: Money): Money {
    return this.lte(other) ? this : other
  }

  max(other: Money): Money {
    return this.gte(other) ? this : other
  }
}

function assertSameCurrency(a: Money, b: Money, operation: string): void {
  if (a.currency !== b.currency) {
    throw new Error(
      `Currency mismatch: cannot ${operation} ${a.currency} and ${b.currency}`,
    )
  }
}

function decimalToScaledInteger(str: string): { amount: bigint; scale: number } {
  const trimmed = str.trim()
  if (trimmed === "") {
    return { amount: 0n, scale: 0 }
  }
  const dotIndex = trimmed.indexOf(".")
  if (dotIndex < 0) {
    return { amount: BigInt(trimmed), scale: 0 }
  }
  const whole = trimmed.slice(0, dotIndex)
  const decimal = trimmed.slice(dotIndex + 1)
  // eslint-disable-next-line custom/no-float-math-in-money-layer -- string concatenation
  const amountStr = whole + decimal
  return { amount: BigInt(amountStr || "0"), scale: decimal.length }
}

function pow10BigInt(n: number): bigint {
  if (n < 0) throw new Error("Negative exponent not supported")
  if (n === 0) return 1n
  return BigInt("1" + "0".repeat(n))
}

/* eslint-disable custom/no-float-math-in-money-layer -- All arithmetic in this function is bigint-safe */
function applyBigIntRounding(
  dividend: bigint,
  divisor: bigint,
  mode: RoundingMode,
): bigint {
  if (divisor === 0n) throw new Error("Cannot divide by zero")
  const sign = (dividend < 0n) !== (divisor < 0n) ? -1n : 1n
  const absDividend = dividend < 0n ? -dividend : dividend
  const absDivisor = divisor < 0n ? -divisor : divisor

  const quotient = absDividend / absDivisor
  const remainder = absDividend % absDivisor

  switch (mode) {
    case "round": {
      if (remainder * 2n >= absDivisor) {
        return sign * (quotient + 1n)
      }
      return sign * quotient
    }
    case "floor": {
      if (sign < 0n && remainder > 0n) {
        return sign * (quotient + 1n)
      }
      return sign * quotient
    }
    case "ceil": {
      if (sign > 0n && remainder > 0n) {
        return sign * (quotient + 1n)
      }
      return sign * quotient
    }
  }
}
/* eslint-enable custom/no-float-math-in-money-layer */

export const CURRENCIES = {
  USD: "USD",
  EUR: "EUR",
  GBP: "GBP",
  INR: "INR",
  JPY: "JPY",
} as const
