import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { OpportunityLineItemsSummary } from "./opportunity-line-items-summary"
import type { LineItemsSummary } from "@/lib/data/opportunity-line-items"

const summary: LineItemsSummary = {
  lines: [
    {
      id: "l1",
      opportunityId: "o1",
      productId: null,
      description: "Banner",
      quantity: "2",
      unitPriceAmount: "100.00",
      unitCostAmount: "0.00",
      discountPct: 10,
      position: 0,
      lineTotal: "180.00",
    },
  ],
  currency: "USD",
  subtotal: "180.00",
  discountAmount: "30.00",
  overridden: false,
  total: "150.00",
}

describe("OpportunityLineItemsSummary", () => {
  it("renders the line breakdown and totals", () => {
    render(<OpportunityLineItemsSummary summary={summary} />)
    expect(screen.getByText("Banner")).toBeTruthy()
    expect(screen.getByText("10%")).toBeTruthy()
    // line total + subtotal both read "USD 180.00"
    expect(screen.getAllByText("USD 180.00").length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText("USD 150.00")).toBeTruthy() // deal amount
  })

  it("renders nothing when there are no lines", () => {
    const { container } = render(
      <OpportunityLineItemsSummary summary={{ ...summary, lines: [] }} />,
    )
    expect(container.firstChild).toBeNull()
  })
})
