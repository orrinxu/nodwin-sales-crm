const CENTS_PER_UNIT = 100

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

  static fromAmount(amount: number, currency: CurrencyCode): Money {
    // This method IS the safe dinero.js helper; arithmetic here is intentional
    // eslint-disable-next-line custom/no-unsafe-numeric-coercion
    const cents = Math.round(amount * CENTS_PER_UNIT)
    return new Money(cents, currency)
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

    const parsed = parseFloat(cleaned)
    if (isNaN(parsed)) {
      throw new Error(`Cannot parse money from "${amount}"`)
    }
    return Money.fromAmount(parsed, currency)
  }

  static zero(currency: CurrencyCode): Money {
    return new Money(0, currency)
  }

  toAmount(): number {
    return this.cents / CENTS_PER_UNIT
  }

  /** Display only. Output is locale-aware but always uses Latin (ASCII 0-9) digits. Not suitable for machine parsing. Use `toAmount()` for numeric computations. */
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
    }).format(this.toAmount())
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

  multiply(factor: number, mode: RoundingMode = "round"): Money {
    return new Money(applyRounding(this.cents * factor, mode), this.currency)
  }

  divide(divisor: number, mode: RoundingMode = "round"): Money {
    if (divisor === 0) throw new Error("Cannot divide money by zero")
    return new Money(applyRounding(this.cents / divisor, mode), this.currency)
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

function applyRounding(value: number, mode: RoundingMode): number {
  switch (mode) {
    case "round":
      return Math.round(value)
    case "floor":
      return Math.floor(value)
    case "ceil":
      return Math.ceil(value)
  }
}

export const CURRENCIES = {
  USD: "USD",
  EUR: "EUR",
  GBP: "GBP",
  INR: "INR",
  JPY: "JPY",
} as const
