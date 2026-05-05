import {
  dinero,
  add,
  subtract,
  multiply,
  allocate,
  toDecimal,
  toSnapshot,
  equal,
  greaterThan,
  greaterThanOrEqual,
  lessThan,
  lessThanOrEqual,
  isPositive,
  isNegative,
  isZero,
  type Dinero,
} from "dinero.js"
import { USD, INR, EUR, GBP } from "dinero.js/currencies"
import type { DineroCurrency } from "dinero.js/currencies"

export { USD, INR, EUR, GBP }
export type { DineroCurrency, Dinero }

export type SupportedCurrency = typeof USD | typeof INR | typeof EUR | typeof GBP

const DEFAULT_CURRENCY: SupportedCurrency = USD

export function moneyFromCents(amount: number, currency: SupportedCurrency = DEFAULT_CURRENCY): Dinero<number> {
  return dinero({ amount, currency })
}

export function moneyFromDecimal(decimal: string | number, currency: SupportedCurrency = DEFAULT_CURRENCY): Dinero<number> {
  const str = typeof decimal === "number" ? decimal.toString() : decimal
  const [whole = "0", fraction = "0"] = str.split(".")
  const exponent = currency.exponent
  const padded = fraction.padEnd(exponent, "0").slice(0, exponent)
  const amount = parseInt(`${whole}${padded}`, 10)
  return dinero({ amount, currency })
}

export function addMoney(a: Dinero<number>, b: Dinero<number>): Dinero<number> {
  return add(a, b)
}

export function subtractMoney(a: Dinero<number>, b: Dinero<number>): Dinero<number> {
  return subtract(a, b)
}

export function multiplyMoney(a: Dinero<number>, multiplier: number | string): Dinero<number> {
  return multiply(a, { amount: typeof multiplier === "string" ? parseInt(multiplier, 10) : multiplier })
}

export function allocateMoney(a: Dinero<number>, ratios: readonly number[]): Dinero<number>[] {
  return allocate(a, ratios)
}

export function moneyToDecimal(a: Dinero<number>): string {
  return toDecimal(a)
}

export function moneyToCents(a: Dinero<number>): number {
  return toSnapshot(a).amount
}

export function moneyToSnapshot(a: Dinero<number>) {
  return toSnapshot(a)
}

export function formatMoney(a: Dinero<number>, locale = "en-US"): string {
  const snap = toSnapshot(a)
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: snap.currency.code,
  })
  const decimal = parseFloat(toDecimal(a))
  return formatter.format(decimal)
}

export function eqMoney(a: Dinero<number>, b: Dinero<number>): boolean {
  return equal(a, b)
}

export function gtMoney(a: Dinero<number>, b: Dinero<number>): boolean {
  return greaterThan(a, b)
}

export function gteMoney(a: Dinero<number>, b: Dinero<number>): boolean {
  return greaterThanOrEqual(a, b)
}

export function ltMoney(a: Dinero<number>, b: Dinero<number>): boolean {
  return lessThan(a, b)
}

export function lteMoney(a: Dinero<number>, b: Dinero<number>): boolean {
  return lessThanOrEqual(a, b)
}

export function isPositiveMoney(a: Dinero<number>): boolean {
  return isPositive(a)
}

export function isNegativeMoney(a: Dinero<number>): boolean {
  return isNegative(a)
}

export function isZeroMoney(a: Dinero<number>): boolean {
  return isZero(a)
}
