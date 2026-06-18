import "server-only"
import { createServerClient } from "@/lib/supabase/server"

export interface ConvertParams {
  amount: bigint
  fromCurrency: string
  toCurrency: string
  asOfDate: string
}

export interface ConvertSuccess {
  convertedAmount: bigint
}

export interface ConvertFailure {
  convertedAmount: null
  error: "no_rate"
}

export type ConvertResult = ConvertSuccess | ConvertFailure

interface RawRate {
  rate: number
  from_currency: string
  to_currency: string
  source: string
  effective_date: string
}

async function lookupRate(
  fromCurrency: string,
  toCurrency: string,
  asOfDate: string,
): Promise<RawRate | null> {
  const supabase = await createServerClient()

  const { data: direct } = await supabase
    .from("fx_rates")
    .select("rate, from_currency, to_currency, source, effective_date")
    .eq("from_currency", fromCurrency)
    .eq("to_currency", toCurrency)
    .lte("effective_date", asOfDate)
    .order("effective_date", { ascending: false })
    .limit(1)

  if (direct && direct.length > 0) {
    return direct[0] as RawRate
  }

  const { data: reciprocal } = await supabase
    .from("fx_rates")
    .select("rate, from_currency, to_currency, source, effective_date")
    .eq("from_currency", toCurrency)
    .eq("to_currency", fromCurrency)
    .lte("effective_date", asOfDate)
    .order("effective_date", { ascending: false })
    .limit(1)

  if (reciprocal && reciprocal.length > 0) {
    return reciprocal[0] as RawRate
  }

  return null
}

function parseRate(rateNum: number): { scaled: bigint; decimals: number } {
  const str = rateNum.toString()
  const dotIndex = str.indexOf(".")
  if (dotIndex < 0) {
    return { scaled: BigInt(str), decimals: 0 }
  }
  const whole = str.slice(0, dotIndex).replace("-", "")
  const decimal = str.slice(dotIndex + 1)
  return { scaled: BigInt(whole + decimal), decimals: decimal.length }
}

function pow10(n: number): bigint {
  if (n < 0) throw new Error("Negative exponent not supported")
  if (n === 0) return 1n
  return BigInt("1" + "0".repeat(n))
}

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error("Cannot divide by zero")
  const sign = (numerator < 0n) !== (denominator < 0n) ? -1n : 1n
  const absNum = numerator < 0n ? -numerator : numerator
  const absDen = denominator < 0n ? -denominator : denominator
  const quotient = absNum / absDen
  const remainder = absNum % absDen
  if (remainder * 2n >= absDen) {
    return sign * (quotient + 1n)
  }
  return sign * quotient
}

function applyConversion(
  value: bigint,
  fromScale: number,
  toScale: number,
  rateRaw: RawRate,
  isReciprocal: boolean,
): bigint {
  const { scaled: rateScaled, decimals: rateDecimals } = parseRate(rateRaw.rate)

  if (isReciprocal) {
    // Reciprocal: targetCents = (sourceCents * 10^rateDecimals * 10^toScale) / (rateScaled * 10^fromScale)
    const numerator = value * pow10(rateDecimals) * pow10(toScale)
    const denominator = rateScaled * pow10(fromScale)
    return roundHalfUp(numerator, denominator)
  }

  // Direct: targetCents = (sourceCents * rateScaled * 10^toScale) / (10^fromScale * 10^rateDecimals)
  const numerator = value * rateScaled * pow10(toScale)
  const denominator = pow10(fromScale) * pow10(rateDecimals)
  return roundHalfUp(numerator, denominator)
}

export async function convert(params: ConvertParams): Promise<ConvertResult> {
  const { amount, fromCurrency, toCurrency, asOfDate } = params

  if (fromCurrency === toCurrency) {
    return { convertedAmount: amount }
  }

  if (amount === 0n) {
    return { convertedAmount: 0n }
  }

  const supabase = await createServerClient()

  const { data: currencies } = await supabase
    .from("currencies")
    .select("code, scale")
    .in("code", [fromCurrency, toCurrency])

  const currencyMap = new Map(
    (currencies ?? []).map((c: { code: string; scale: number }) => [c.code, c.scale]),
  )
  const fromScale = currencyMap.get(fromCurrency) ?? 2
  const toScale = currencyMap.get(toCurrency) ?? 2

  const rate = await lookupRate(fromCurrency, toCurrency, asOfDate)

  if (!rate) {
    return { convertedAmount: null, error: "no_rate" }
  }

  const isReciprocal = rate.from_currency === toCurrency

  return {
    convertedAmount: applyConversion(amount, fromScale, toScale, rate, isReciprocal),
  }
}

export function convertWithRate(
  amount: bigint,
  fromCurrency: string,
  toCurrency: string,
  fromScale: number,
  toScale: number,
  rate: RawRate,
): bigint {
  if (fromCurrency === toCurrency) return amount
  const isReciprocal = rate.from_currency === toCurrency
  return applyConversion(amount, fromScale, toScale, rate, isReciprocal)
}

export { applyConversion, parseRate, roundHalfUp, lookupRate, pow10 }
