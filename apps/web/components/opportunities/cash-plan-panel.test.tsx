/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

import { CashPlanPanel } from "./cash-plan-panel"
import type { CashflowMilestoneRecord } from "@/lib/data/cashflow-milestones"
import type { WorkingCapitalDTO } from "@/lib/finance/working-capital-dto"

const WORKING_CAPITAL: WorkingCapitalDTO = {
  currency: "INR",
  series: [
    { month: "2026-09", net: "-40000.00", cumulative: "-40000.00" },
    { month: "2026-10", net: "100000.00", cumulative: "60000.00" },
  ],
  peakFinanced: "40000.00",
  monthsFinanced: 1,
  costOfCash: "600.00",
  deductionPct: 0.006,
}

const MILESTONES: CashflowMilestoneRecord[] = [
  {
    id: "m1",
    opportunityId: "opp1",
    direction: "out",
    label: "Talent advance",
    scheduledMonth: "2026-09-01",
    amount: "40000.00",
    currency: "INR",
    sortOrder: 0,
    createdBy: "u1",
    createdAt: "2026-07-13T00:00:00Z",
    updatedAt: "2026-07-13T00:00:00Z",
  },
]

function renderPanel(overrides: Partial<Parameters<typeof CashPlanPanel>[0]> = {}) {
  return render(
    <CashPlanPanel
      opportunityId="opp1"
      currency="INR"
      workingCapital={WORKING_CAPITAL}
      revenueSchedule={[{ month: "2026-10-01", amount: "100000.00" }]}
      costMilestones={MILESTONES}
      createAction={vi.fn(async () => MILESTONES[0])}
      updateAction={vi.fn(async () => MILESTONES[0])}
      deleteAction={vi.fn(async () => {})}
      {...overrides}
    />,
  )
}

describe("CashPlanPanel", () => {
  it("renders the P&L summary tiles from the working-capital DTO", () => {
    renderPanel()
    const peakTile = screen.getByText("Peak financed").parentElement as HTMLElement
    expect(within(peakTile).getByText("INR 40000.00")).toBeInTheDocument()
    expect(screen.getByText("Months financed")).toBeInTheDocument()
    expect(screen.getByText("Revenue deduction")).toBeInTheDocument()
    expect(screen.getByText("0.6%")).toBeInTheDocument()
  })

  it("lists cost milestones and the revenue schedule", () => {
    renderPanel()
    expect(screen.getByText("Talent advance")).toBeInTheDocument()
    expect(screen.getByText("Revenue schedule")).toBeInTheDocument()
    expect(screen.getByText("Cost milestones")).toBeInTheDocument()
  })

  it("renders the monthly cash position with a financed month flagged", () => {
    renderPanel()
    const heading = screen.getByText("Monthly cash position")
    expect(heading).toBeInTheDocument()
    // Sept's net and cumulative are both -40000; only the cumulative cell is
    // styled as financed (destructive).
    const cells = screen.getAllByText("INR -40000.00")
    expect(cells.some((c) => c.className.includes("text-destructive"))).toBe(true)
  })

  it("shows the empty state when there are no cost milestones", () => {
    renderPanel({ costMilestones: [] })
    expect(screen.getByText(/No cost milestones yet/)).toBeInTheDocument()
  })

  it("renders an Add cost control", () => {
    renderPanel()
    const addBtn = screen.getByRole("button", { name: /Add cost/ })
    expect(addBtn).toBeInTheDocument()
  })

  it("does not render the series table when the series is empty", () => {
    renderPanel({
      workingCapital: { ...WORKING_CAPITAL, series: [] },
    })
    expect(screen.queryByText("Monthly cash position")).not.toBeInTheDocument()
  })
})
