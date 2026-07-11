import { describe, it, expect } from "vitest"
import { Money } from "@/lib/money"
import { deriveWorkingCapital, type CashflowMilestone } from "./working-capital"

const USD = "USD"
const m = (direction: "in" | "out", scheduledMonth: string, amount: string): CashflowMilestone => ({
  direction,
  scheduledMonth,
  amount,
  currency: USD,
})
const rev = (a: string) => Money.fromAmount(a, USD)

describe("deriveWorkingCapital", () => {
  it("canonical vector: out 21,950 @ Sep, in 34,500 @ Dec, 12%, rev 34,500", () => {
    const r = deriveWorkingCapital(
      [m("out", "2026-09", "21950"), m("in", "2026-12", "34500")],
      { annualRate: 0.12, revenue: rev("34500") },
    )
    // Span Sep–Dec (4 months); cumulative −21950 / −21950 / −21950 / +12550
    expect(r.series.map((p) => p.month)).toEqual(["2026-09", "2026-10", "2026-11", "2026-12"])
    expect(r.series.map((p) => p.cumulative.toAmount())).toEqual([
      "-21950.00", "-21950.00", "-21950.00", "12550.00",
    ])
    expect(r.peakFinanced.toAmount()).toBe("21950.00")
    expect(r.monthsFinanced).toBe(3)
    expect(r.costOfCash.toAmount()).toBe("658.50")
    expect(r.deductionPct).toBeCloseTo(0.0191, 4)
  })

  it("no milestones → zeroed result", () => {
    const r = deriveWorkingCapital([], { annualRate: 0.18, revenue: rev("1000") })
    expect(r.series).toEqual([])
    expect(r.peakFinanced.toAmount()).toBe("0.00")
    expect(r.monthsFinanced).toBe(0)
    expect(r.costOfCash.toAmount()).toBe("0.00")
    expect(r.deductionPct).toBe(0)
  })

  it("all-positive (never financed) → cost of cash 0", () => {
    const r = deriveWorkingCapital(
      [m("in", "2026-01", "5000"), m("in", "2026-02", "5000")],
      { annualRate: 0.18, revenue: rev("10000") },
    )
    expect(r.monthsFinanced).toBe(0)
    expect(r.peakFinanced.toAmount()).toBe("0.00")
    expect(r.costOfCash.toAmount()).toBe("0.00")
    expect(r.deductionPct).toBe(0)
  })

  it("single month", () => {
    const r = deriveWorkingCapital([m("out", "2026-05", "1000")], { annualRate: 0.12, revenue: rev("1000") })
    expect(r.series).toHaveLength(1)
    expect(r.series[0].cumulative.toAmount()).toBe("-1000.00")
    expect(r.monthsFinanced).toBe(1)
    expect(r.costOfCash.toAmount()).toBe("10.00") // 1000 × 0.01
  })

  it("is order-independent", () => {
    const inOrder = deriveWorkingCapital(
      [m("out", "2026-09", "21950"), m("in", "2026-12", "34500")],
      { annualRate: 0.12, revenue: rev("34500") },
    )
    const shuffled = deriveWorkingCapital(
      [m("in", "2026-12", "34500"), m("out", "2026-09", "21950")],
      { annualRate: 0.12, revenue: rev("34500") },
    )
    expect(shuffled.costOfCash.toAmount()).toBe(inOrder.costOfCash.toAmount())
    expect(shuffled.series.map((p) => p.cumulative.toAmount())).toEqual(
      inOrder.series.map((p) => p.cumulative.toAmount()),
    )
  })

  it("captures TWO separate financed periods (integral, not peak×duration)", () => {
    // Dip, recover to 0, dip again — a retainer shape. Peak is 100 both times,
    // but the integral must count both financed stretches (total financed 200).
    const r = deriveWorkingCapital(
      [
        m("out", "2026-01", "100"), m("in", "2026-02", "100"),
        m("out", "2026-04", "100"), m("in", "2026-05", "100"),
      ],
      { annualRate: 0.12, revenue: rev("100") },
    )
    expect(r.series.map((p) => p.cumulative.toAmount())).toEqual([
      "-100.00", "0.00", "0.00", "-100.00", "0.00",
    ])
    expect(r.monthsFinanced).toBe(2)
    expect(r.peakFinanced.toAmount()).toBe("100.00")
    expect(r.costOfCash.toAmount()).toBe("2.00") // (100 + 100) × 0.01 — both dips
  })

  it("handles a zero-amount milestone", () => {
    const r = deriveWorkingCapital(
      [m("out", "2026-01", "0"), m("in", "2026-02", "500")],
      { annualRate: 0.12, revenue: rev("500") },
    )
    expect(r.monthsFinanced).toBe(0)
    expect(r.costOfCash.toAmount()).toBe("0.00")
  })

  it("revenue = 0 → deductionPct 0 (no divide-by-zero)", () => {
    const r = deriveWorkingCapital([m("out", "2026-01", "100")], { annualRate: 0.12, revenue: rev("0") })
    expect(r.costOfCash.toAmount()).toBe("1.00")
    expect(r.deductionPct).toBe(0)
  })

  it("throws on mixed currencies", () => {
    expect(() =>
      deriveWorkingCapital(
        [{ direction: "in", scheduledMonth: "2026-01", amount: "100", currency: "EUR" }],
        { annualRate: 0.12, revenue: rev("100") },
      ),
    ).toThrow(/Mixed-currency/)
  })
})
