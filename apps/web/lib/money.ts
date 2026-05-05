import {
  dinero,
  toDecimal,
  toSnapshot,
  add as dineroAdd,
  subtract as dineroSubtract,
  multiply as dineroMultiply,
  equal,
  greaterThan,
  greaterThanOrEqual,
  lessThan,
  lessThanOrEqual,
  isZero as dineroIsZero,
  isNegative as dineroIsNegative,
  haveSameCurrency,
  transformScale,
  type Dinero,
  type DineroCurrency,
  USD,
  EUR,
  GBP,
  INR,
  JPY,
  halfUp,
  down,
  up,
} from 'dinero.js'

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'INR' | 'JPY'
export type RoundingMode = 'round' | 'floor' | 'ceil'
export type Money = Dinero<number>

function getCurrency(code: CurrencyCode): DineroCurrency<number> {
  switch (code) {
    case 'USD':
      return USD
    case 'EUR':
      return EUR
    case 'GBP':
      return GBP
    case 'INR':
      return INR
    case 'JPY':
      return JPY
    default:
      throw new Error(`Unsupported currency: ${code}`)
  }
}

function getRoundingMode(mode: RoundingMode) {
  switch (mode) {
    case 'round':
      return halfUp
    case 'floor':
      return down
    case 'ceil':
      return up
    default:
      throw new Error(`Unsupported rounding mode: ${mode}`)
  }
}

/**
 * Parse a decimal string into an integer amount in the smallest currency unit.
 * Uses string manipulation only — no float intermediates.
 *
 * @param str - Decimal string like "123.45" or "1.005"
 * @param exponent - Number of decimal places for the currency (e.g. 2 for USD, 0 for JPY)
 * @returns Integer amount in smallest unit (e.g. cents)
 */
function parseDecimalString(str: string, exponent: number): number {
  const trimmed = str.trim()
  if (!trimmed) {
    throw new Error(`Cannot parse empty string as money`)
  }

  const isNegative = trimmed.startsWith('-')
  const absStr = isNegative ? trimmed.slice(1) : trimmed

  const dotIndex = absStr.indexOf('.')
  const wholeStr = dotIndex >= 0 ? absStr.slice(0, dotIndex) : absStr
  const decimalStr = dotIndex >= 0 ? absStr.slice(dotIndex + 1) : ''

  if (!/^\d*$/.test(wholeStr) || !/^\d*$/.test(decimalStr)) {
    throw new Error(`Cannot parse money from "${str}": invalid characters`)
  }

  const whole = wholeStr === '' ? 0 : Number(wholeStr)

  let decimalPart = 0
  let roundUp = false

  if (exponent === 0) {
    // JPY-style: no decimal places
    if (decimalStr.length > 0) {
      const firstDecimalDigit = Number(decimalStr[0])
      roundUp = firstDecimalDigit >= 5
    }
  } else {
    if (decimalStr.length > 0) {
      const relevantDigits = decimalStr.slice(0, exponent)
      decimalPart =
        relevantDigits === ''
          ? 0
          : Number(relevantDigits.padEnd(exponent, '0'))
      const nextDigit = decimalStr.charAt(exponent)
      if (nextDigit !== undefined) {
        roundUp = Number(nextDigit) >= 5
      }
    }
  }

  const scaleFactor = Math.pow(10, exponent)
  let amount = whole * scaleFactor + decimalPart
  if (roundUp) {
    amount += 1
  }

  return isNegative ? -amount : amount
}

/**
 * Create a Money value from an integer amount in the smallest currency unit.
 */
export function fromCents(cents: number, currency: CurrencyCode): Money {
  if (!Number.isInteger(cents)) {
    throw new Error(`Money amount must be an integer, got ${cents}`)
  }
  return dinero({ amount: cents, currency: getCurrency(currency) })
}

/**
 * Create a Money value from a decimal string.
 * Always use strings to avoid float precision bugs.
 */
export function fromAmount(amount: string, currency: CurrencyCode): Money {
  const integerAmount = parseDecimalString(amount, getCurrency(currency).exponent)
  return dinero({ amount: integerAmount, currency: getCurrency(currency) })
}

/**
 * Parse a money string that may contain currency symbols, commas, parentheses,
 * or other formatting characters.
 */
export function fromString(amount: string, currency: CurrencyCode): Money {
  // Reject BiDi control characters (used for visual spoofing)
  if (/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/.test(amount)) {
    throw new Error(
      `Cannot parse money from "${amount}": contains BiDi control characters`,
    )
  }

  // Reject homoglyph digits — any Unicode decimal digit that is not an ASCII digit
  const withoutAsciiDigits = amount.replace(/[0-9]/g, '')
  if (/\p{Nd}/u.test(withoutAsciiDigits)) {
    throw new Error(
      `Cannot parse money from "${amount}": contains non-ASCII digits`,
    )
  }

  // Clean: keep only allowed characters [0-9], comma, period, minus, parens, space
  let cleaned = amount.replace(/[^0-9.,\-( )]/g, '').trim()

  // Handle parentheses notation for negatives: (100) → -100
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    cleaned = '-' + cleaned.slice(1, -1)
  }

  // Remove commas (thousands separators) before parsing
  cleaned = cleaned.replace(/,/g, '')

  return fromAmount(cleaned, currency)
}

/**
 * Create a zero-value Money.
 */
export function zero(currency: CurrencyCode): Money {
  return dinero({ amount: 0, currency: getCurrency(currency) })
}

/**
 * Get the integer amount in the smallest currency unit.
 */
export function toCents(money: Money): number {
  return toSnapshot(money).amount
}

/**
 * Get the decimal string representation (e.g. "123.45").
 */
export function toDecimalString(money: Money): string {
  return toDecimal(money)
}

/**
 * Format the money for display using Intl.NumberFormat.
 */
export function toDisplay(money: Money, locale = 'en-US'): string {
  const { currency } = toSnapshot(money)
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.code,
  }).format(Number(toDecimal(money)))
}

/**
 * Add two Money values. Must be the same currency.
 */
export function addMoney(a: Money, b: Money): Money {
  return dineroAdd(a, b)
}

/**
 * Subtract b from a. Must be the same currency.
 */
export function subtractMoney(a: Money, b: Money): Money {
  return dineroSubtract(a, b)
}

/**
 * Convert a decimal string to a scaled integer representation for dinero.js multiply.
 */
function decimalToScaledInteger(str: string): { amount: number; scale: number } {
  const trimmed = str.trim()
  const dotIndex = trimmed.indexOf('.')
  if (dotIndex < 0) {
    return { amount: Number(trimmed), scale: 0 }
  }
  const whole = trimmed.slice(0, dotIndex)
  const decimal = trimmed.slice(dotIndex + 1)
  const amountStr = whole + decimal
  return { amount: Number(amountStr), scale: decimal.length }
}

/**
 * Multiply a Money value by a factor.
 * The factor is a string to avoid float precision issues.
 */
export function multiplyMoney(
  money: Money,
  factor: string,
  mode: RoundingMode = 'round',
): Money {
  const { amount: factorAmount, scale: factorScale } =
    decimalToScaledInteger(factor)
  const product = dineroMultiply(money, {
    amount: factorAmount,
    scale: factorScale,
  })
  const { currency } = toSnapshot(money)
  return transformScale(product, currency.exponent, getRoundingMode(mode))
}

/**
 * Divide a Money value by a divisor.
 * The divisor is a string to avoid float precision issues in the dividend.
 */
export function divideMoney(
  money: Money,
  divisor: string,
  mode: RoundingMode = 'round',
): Money {
  const d = Number(divisor)
  if (d === 0) throw new Error('Cannot divide money by zero')
  if (!isFinite(d)) throw new Error(`Invalid divisor: ${divisor}`)

  const { amount, currency } = toSnapshot(money)
  let result: number
  switch (mode) {
    case 'round':
      result = Math.round(amount / d)
      break
    case 'floor':
      result = Math.floor(amount / d)
      break
    case 'ceil':
      result = Math.ceil(amount / d)
      break
  }

  if (!Number.isInteger(result)) {
    throw new Error(`Division result is not an integer: ${result}`)
  }

  return dinero({ amount: result, currency })
}

/**
 * Absolute value of a Money.
 */
export function absMoney(money: Money): Money {
  const { amount, currency } = toSnapshot(money)
  return dinero({ amount: Math.abs(amount), currency })
}

/**
 * Negate a Money value.
 */
export function negateMoney(money: Money): Money {
  const { amount, currency } = toSnapshot(money)
  return dinero({ amount: -amount, currency })
}

/**
 * Check if two Money values are equal. Must be the same currency.
 */
export function eq(a: Money, b: Money): boolean {
  if (!haveSameCurrency([a, b])) {
    throw new Error(
      `Currency mismatch: cannot compare ${toSnapshot(a).currency.code} and ${toSnapshot(b).currency.code}`
    )
  }
  return equal(a, b)
}

/**
 * Check if a > b. Must be the same currency.
 */
export function gt(a: Money, b: Money): boolean {
  return greaterThan(a, b)
}

/**
 * Check if a >= b. Must be the same currency.
 */
export function gte(a: Money, b: Money): boolean {
  return greaterThanOrEqual(a, b)
}

/**
 * Check if a < b. Must be the same currency.
 */
export function lt(a: Money, b: Money): boolean {
  return lessThan(a, b)
}

/**
 * Check if a <= b. Must be the same currency.
 */
export function lte(a: Money, b: Money): boolean {
  return lessThanOrEqual(a, b)
}

/**
 * Check if a Money value is zero.
 */
export function isZeroMoney(money: Money): boolean {
  return dineroIsZero(money)
}

/**
 * Check if a Money value is negative.
 */
export function isNegativeMoney(money: Money): boolean {
  return dineroIsNegative(money)
}

/**
 * Return the smaller of two Money values.
 */
export function min(a: Money, b: Money): Money {
  return lte(a, b) ? a : b
}

/**
 * Return the larger of two Money values.
 */
export function max(a: Money, b: Money): Money {
  return gte(a, b) ? a : b
}

export const CURRENCIES = {
  USD: 'USD',
  EUR: 'EUR',
  GBP: 'GBP',
  INR: 'INR',
  JPY: 'JPY',
} as const
