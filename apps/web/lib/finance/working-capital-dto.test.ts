import { describe, it, expect } from "vitest"

import { Money } from "@/lib/money"
import { deriveWorkingCapital } from "./working-capital"
import { serializeWorkingCapital } from "./working-capital-dto"

describe("serializeWorkingCapital", () => {
  it("projects a derived result onto decimal strings, netting inflows against outflows", () => {
    // A cost outflow in Sep (financed) then the revenue inflow in Oct clears it.
    const result = deriveWorkingCapital(
      [
        { direction: "out", scheduledMonth: "2026-09-01", amount: "40000.00", currency: "INR" },
        { direction: "in", scheduledMonth: "2026-10-01", amount: "100000.00", currency: "INR" },
      ],
      { annualRate: 0.18, revenue: Money.fromAmount("100000.00", "INR") },
    )

    const dto = serializeWorkingCapital(result, "INR")

    expect(dto.currency).toBe("INR")
    expect(dto.monthsFinanced).toBe(1)
    expect(dto.peakFinanced).toBe("40000.00")
    expect(dto.series).toEqual([
      { month: "2026-09", net: "-40000.00", cumulative: "-40000.00" },
      { month: "2026-10", net: "100000.00", cumulative: "60000.00" },
    ])
    // costOfCash is a decimal string; deductionPct is a plain ratio.
    expect(typeof dto.costOfCash).toBe("string")
    expect(typeof dto.deductionPct).toBe("number")
  })

  it("serializes a zeroed result to zero strings and an empty series", () => {
    const result = deriveWorkingCapital([], {
      annualRate: 0.18,
      revenue: Money.fromAmount("0", "USD"),
    })
    const dto = serializeWorkingCapital(result, "USD")
    expect(dto.series).toEqual([])
    expect(dto.peakFinanced).toBe("0.00")
    expect(dto.costOfCash).toBe("0.00")
    expect(dto.monthsFinanced).toBe(0)
    expect(dto.deductionPct).toBe(0)
  })
})
