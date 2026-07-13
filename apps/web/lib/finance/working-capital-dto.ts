import type { WorkingCapitalResult } from "@/lib/finance/working-capital"

// Serializable form of WorkingCapitalResult for crossing the server → client
// boundary: Money instances don't survive RSC serialization, so every monetary
// field becomes a decimal string in the deal's currency. deductionPct stays a
// plain ratio (dimensionless). The currency travels alongside for display.
//
// This module is deliberately NOT "use server": it exports types + a pure
// serializer, and a "use server" file may only export async functions. The P&L
// server actions import this, then hand DTOs to client components.

export interface WorkingCapitalPointDTO {
  /** "YYYY-MM". */
  month: string
  /** in − out for the month, decimal string. */
  net: string
  /** Running cumulative position through this month, decimal string. */
  cumulative: string
}

export interface WorkingCapitalDTO {
  currency: string
  series: WorkingCapitalPointDTO[]
  /** Largest financed (negative-cumulative) position, as a positive decimal string. */
  peakFinanced: string
  /** Count of months with a negative cumulative position. */
  monthsFinanced: number
  /** Total cost of financing, decimal string. */
  costOfCash: string
  /** costOfCash ÷ revenue (0 when revenue ≤ 0). A ratio, not money. */
  deductionPct: number
}

export function serializeWorkingCapital(
  result: WorkingCapitalResult,
  currency: string,
): WorkingCapitalDTO {
  return {
    currency,
    series: result.series.map((p) => ({
      month: p.month,
      net: p.net.toAmount(),
      cumulative: p.cumulative.toAmount(),
    })),
    peakFinanced: result.peakFinanced.toAmount(),
    monthsFinanced: result.monthsFinanced,
    costOfCash: result.costOfCash.toAmount(),
    deductionPct: result.deductionPct,
  }
}
