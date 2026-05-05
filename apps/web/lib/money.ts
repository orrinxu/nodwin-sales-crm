export type RoundingMode = "round" | "floor" | "ceil"

export type CurrencyCode = string

const CURRENCY_CODE_PATTERN = /^[A-Z0-9]{1,8}$/

export function isValidCurrencyCode(code: string): boolean {
  return CURRENCY_CODE_PATTERN.test(code)
}

export interface MoneyData {
  cents: number
  currency: CurrencyCode
}

export class Money {
  readonly cents: number
  readonly currency: CurrencyCode

  private constructor(cents: number, currency: CurrencyCode) {
    if (!Number.isInteger(cents)) {
      throw new Error(`Money cents must be an integer, got ${cents}`)
    }
    this.cents = cents
    this.currency = currency
  }

  static fromCents(cents: number, currency: CurrencyCode): Money {
    return new Money(cents, currency)
  }

  static fromAmount(amount: number | string, currency: CurrencyCode): Money {
    if (typeof amount === "string") {
      return Money.fromString(amount, currency)
    }
    // Convert to string to avoid floating-point multiplication errors
    // e.g. 2.675 * 100 = 267.4999... which rounds to 267 instead of 268
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

    const dotIndex = absStr.indexOf(".")
    const wholeStr = dotIndex >= 0 ? absStr.slice(0, dotIndex) : absStr
    const decimalStr = dotIndex >= 0 ? absStr.slice(dotIndex + 1) : ""

    if (!/^\d*$/.test(wholeStr) || !/^\d*$/.test(decimalStr)) {
      throw new Error(`Cannot parse money from "${amount}"`)
    }

    const whole = wholeStr === "" ? 0 : Number(wholeStr)

    let decimalPart = 0
    let roundUp = false

    if (decimalStr.length > 0) {
      const relevantDigits = decimalStr.slice(0, 2)
      decimalPart = relevantDigits === "" ? 0 : Number(relevantDigits.padEnd(2, "0"))
      const nextDigit = decimalStr.charAt(2)
      if (nextDigit !== undefined && nextDigit !== "") {
        roundUp = Number(nextDigit) >= 5
      }
    }

    let cents = whole * 100 + decimalPart
    if (roundUp) {
      cents += 1
    }

    return new Money(isNegative ? -cents : cents, currency)
  }

  static zero(currency: CurrencyCode): Money {
    return new Money(0, currency)
  }

  /**
   * Return the decimal string representation (e.g. "123.45").
   * No float intermediates — pure string manipulation.
   */
  toAmount(): string {
    const sign = this.cents < 0 ? "-" : ""
    const absCents = Math.abs(this.cents).toString().padStart(3, "0")
    const whole = absCents.slice(0, -2)
    const fraction = absCents.slice(-2)
    return `${sign}${whole}.${fraction}`
  }

  /** Display only. Output is locale-aware but always uses Latin (ASCII 0-9) digits. Not suitable for machine parsing. Use `toAmount()` for decimal string. */
  toDisplay(locale = "en-US"): string {
    try {
      Intl.getCanonicalLocales(locale)
    } catch {
      locale = "en-US"
    }
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: this.currency,
      numberingSystem: "latn",
    }).format(this.toAmount() as unknown as number)
  }

  toJSON(): MoneyData {
    return { cents: this.cents, currency: this.currency }
  }

  add(other: Money): Money {
    assertSameCurrency(this, other, "add")
    return new Money(this.cents + other.cents, this.currency)
  }

  subtract(other: Money): Money {
    assertSameCurrency(this, other, "subtract")
    return new Money(this.cents - other.cents, this.currency)
  }

  multiply(factor: string | number, mode: RoundingMode = "round"): Money {
    const factorStr = typeof factor === "number" ? factor.toString() : factor
    const { amount: scaledFactor, scale: factorScale } =
      decimalToScaledInteger(factorStr)
    const product = BigInt(this.cents) * scaledFactor
    const divisor = pow10BigInt(factorScale)
    const result = applyBigIntRounding(product, divisor, mode)
    return new Money(Number(result), this.currency)
  }

  divide(divisor: string | number, mode: RoundingMode = "round"): Money {
    const divisorStr = typeof divisor === "number" ? divisor.toString() : divisor
    const { amount: scaledDivisor, scale: divisorScale } =
      decimalToScaledInteger(divisorStr)
    if (scaledDivisor === 0n) throw new Error("Cannot divide money by zero")
    const dividend = BigInt(this.cents) * pow10BigInt(divisorScale)
    const result = applyBigIntRounding(dividend, scaledDivisor, mode)
    return new Money(Number(result), this.currency)
  }

  abs(): Money {
    return new Money(Math.abs(this.cents), this.currency)
  }

  negate(): Money {
    return new Money(-this.cents, this.currency)
  }

  eq(other: Money): boolean {
    assertSameCurrency(this, other, "eq")
    return this.cents === other.cents
  }

  gt(other: Money): boolean {
    assertSameCurrency(this, other, "gt")
    return this.cents > other.cents
  }

  gte(other: Money): boolean {
    assertSameCurrency(this, other, "gte")
    return this.cents >= other.cents
  }

  lt(other: Money): boolean {
    assertSameCurrency(this, other, "lt")
    return this.cents < other.cents
  }

  lte(other: Money): boolean {
    assertSameCurrency(this, other, "lte")
    return this.cents <= other.cents
  }

  isZero(): boolean {
    return this.cents === 0
  }

  isNegative(): boolean {
    return this.cents < 0
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
  const amountStr = whole + decimal
  return { amount: BigInt(amountStr || "0"), scale: decimal.length }
}

function pow10BigInt(n: number): bigint {
  if (n < 0) throw new Error("Negative exponent not supported")
  if (n === 0) return 1n
  return BigInt("1" + "0".repeat(n))
}

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

export const CURRENCIES = {
  USD: "USD",
  EUR: "EUR",
  GBP: "GBP",
  INR: "INR",
  JPY: "JPY",
} as const
