import { Money, type CurrencyCode } from "@/lib/money"

// Pure working-capital derivation for a deal's cash-flow milestones (SOW §4.14).
// No IO, deterministic, currency-safe. Takes the milestones + the deal's revenue
// and financing rate; returns the monthly cumulative-cash series plus the headline
// working-capital figures. Display bucketing (monthly vs quarterly) is a UI
// concern — this always returns the fine-grained monthly series.

/** One planned cash event. `amount` is a non-negative decimal string; sign is
 *  carried by `direction`. `scheduledMonth` is a date string normalised to the
 *  month ("YYYY-MM" or "YYYY-MM-DD"). */
export interface CashflowMilestone {
  direction: "in" | "out"
  scheduledMonth: string
  amount: string
  currency: CurrencyCode
}

export interface WorkingCapitalPoint {
  /** "YYYY-MM". */
  month: string
  /** in − out for the month. */
  net: Money
  /** Running sum of net up to and including this month. */
  cumulative: Money
}

export interface WorkingCapitalResult {
  series: WorkingCapitalPoint[]
  /** Largest financed (negative-cumulative) position, as a positive amount. */
  peakFinanced: Money
  /** Count of months with a negative cumulative position. */
  monthsFinanced: number
  /** Σ over months of financed-balance × monthlyRate. Rounded once, at the end. */
  costOfCash: Money
  /** costOfCash ÷ revenue (0 when revenue ≤ 0). A ratio, not money. */
  deductionPct: number
}

function monthKey(scheduledMonth: string): string {
  return scheduledMonth.slice(0, 7)
}

/** Inclusive contiguous list of "YYYY-MM" from min to max. */
function enumerateMonths(min: string, max: string): string[] {
  const [minY, minM] = min.split("-").map(Number)
  const [maxY, maxM] = max.split("-").map(Number)
  const out: string[] = []
  let y = minY
  let m = minM
  while (y < maxY || (y === maxY && m <= maxM)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

/**
 * Derive the working-capital position for a set of cash-flow milestones.
 *
 * @param milestones cash events (any order). Empty → a zeroed result.
 * @param opts.annualRate annual cost-of-financing rate as a decimal (0.18 = 18%).
 * @param opts.revenue the deal's contract revenue (source of truth; the deduction
 *   denominator). Its currency is the required currency for every milestone.
 * @throws if any milestone's currency differs from the revenue currency.
 */
export function deriveWorkingCapital(
  milestones: CashflowMilestone[],
  opts: { annualRate: number; revenue: Money },
): WorkingCapitalResult {
  const currency = opts.revenue.currency

  // Never sum across currencies — assert single-currency up front.
  for (const m of milestones) {
    if (m.currency !== currency) {
      throw new Error(
        `Mixed-currency milestones are not supported: ${m.currency} ≠ revenue ${currency}.`,
      )
    }
  }

  const zero = Money.zero(currency)

  if (milestones.length === 0) {
    return { series: [], peakFinanced: zero, monthsFinanced: 0, costOfCash: zero, deductionPct: 0 }
  }

  // Net per month.
  const netByMonth = new Map<string, Money>()
  for (const m of milestones) {
    const key = monthKey(m.scheduledMonth)
    const amount = Money.fromAmount(m.amount, currency)
    const signed = m.direction === "in" ? amount : amount.negate()
    netByMonth.set(key, (netByMonth.get(key) ?? zero).add(signed))
  }

  const keys = [...netByMonth.keys()].sort()
  const months = enumerateMonths(keys[0], keys[keys.length - 1])

  const series: WorkingCapitalPoint[] = []
  let cumulative = zero
  let peakFinanced = zero
  let monthsFinanced = 0
  // Exact sum of financed balances; multiply by the (constant) monthly rate ONCE
  // at the end so rounding happens a single time, not per month.
  let totalFinanced = zero

  for (const month of months) {
    const net = netByMonth.get(month) ?? zero
    cumulative = cumulative.add(net)
    const financed = cumulative.isNegative() ? cumulative.negate() : zero
    if (cumulative.isNegative()) {
      monthsFinanced += 1
      totalFinanced = totalFinanced.add(financed)
      // financed > peakFinanced  ⇔  peakFinanced − financed < 0
      if (peakFinanced.subtract(financed).isNegative()) peakFinanced = financed
    }
    series.push({ month, net, cumulative })
  }

  const monthlyRate = opts.annualRate / 12
  const costOfCash = totalFinanced.multiply(monthlyRate, "round")

  /* eslint-disable custom/no-unsafe-numeric-coercion -- REASON: deductionPct is a
     dimensionless ratio (cost of cash ÷ revenue) — a display percentage, not a
     money value. Deriving a ratio needs the two amounts' magnitudes; no monetary
     quantity is produced, so the money-coercion guard doesn't apply here. */
  const revenueMagnitude = Number(opts.revenue.toAmount())
  const costOfCashMagnitude = Number(costOfCash.toAmount())
  const deductionPct = revenueMagnitude > 0 ? costOfCashMagnitude / revenueMagnitude : 0
  /* eslint-enable custom/no-unsafe-numeric-coercion */

  return { series, peakFinanced, monthsFinanced, costOfCash, deductionPct }
}
