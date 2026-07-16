import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { OpportunityLineItemsEditor } from "./opportunity-line-items-editor"
import type { LineItemsSummary } from "@/lib/data/opportunity-line-items"

const products = [
  { id: "p1", name: "Banner", sku: "B1", unitPriceAmount: "100.00", unitCostAmount: "20.00" },
]

const summary: LineItemsSummary = {
  lines: [
    {
      id: "l1",
      opportunityId: "o1",
      productId: null,
      description: "Existing",
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
  discountAmount: "0.00",
  overridden: false,
  total: "180.00",
}

describe("OpportunityLineItemsEditor", () => {
  it("renders existing lines and saves the mapped payload", () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <OpportunityLineItemsEditor currency="USD" summary={summary} products={products} onSave={onSave} />,
    )
    // Existing line renders and its total is derived (2 × 100 × 0.9 = 180).
    expect(screen.getByDisplayValue("Existing")).toBeTruthy()
    expect(screen.getAllByText("USD 180.00").length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText(/Deal discount/), { target: { value: "30" } })
    fireEvent.click(screen.getByRole("button", { name: /Save line items/ }))

    expect(onSave).toHaveBeenCalledTimes(1)
    const arg = onSave.mock.calls[0][0]
    expect(arg.discountAmount).toBe("30")
    expect(arg.overridden).toBe(false)
    expect(arg.lines).toHaveLength(1)
    expect(arg.lines[0]).toMatchObject({
      description: "Existing",
      quantity: 2,
      unitPriceAmount: "100.00",
      discountPct: 10,
      position: 0,
    })
  })

  it("drops blank-description rows and reflects the override toggle", () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <OpportunityLineItemsEditor currency="USD" summary={summary} products={products} onSave={onSave} />,
    )
    // Add an empty row — it must not be saved (no description).
    fireEvent.click(screen.getByRole("button", { name: /Add line/ }))
    fireEvent.click(screen.getByRole("checkbox"))
    fireEvent.click(screen.getByRole("button", { name: /Save line items/ }))

    const arg = onSave.mock.calls[0][0]
    expect(arg.lines).toHaveLength(1) // the blank row was filtered out
    expect(arg.overridden).toBe(true)
  })
})
