/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"

import { ReportsView } from "./reports-view"
import type { ReportData } from "@/lib/data/reports"

function makeData(overrides: Partial<ReportData> = {}): ReportData {
  return {
    pipelineByStage: [
      { stage: "qualify", label: "Qualify", count: 1, amount: 83000000 },
    ],
    wonLostRevenue: [{ type: "won", amount: 83000000, count: 1 }],
    monthlyTrends: [],
    topAccounts: [],
    totalPipeline: 83000000,
    totalWon: 83000000,
    avgDealSize: 83000000,
    winRate: 50,
    currency: "USD",
    unconvertibleCount: 0,
    ...overrides,
  }
}

describe("ReportsView", () => {
  it("formats money in the reporting currency, not a hardcoded USD", () => {
    render(<ReportsView data={makeData({ currency: "INR" })} />)

    // The FX-normalised figures must render with the INR symbol …
    expect(screen.getAllByText(/₹/).length).toBeGreaterThan(0)
    // … and never as USD.
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument()
    // Header names the currency, mirroring the forecast section.
    expect(screen.getByText(/in INR/)).toBeInTheDocument()
  })

  it("formats in USD when the reporting currency is USD", () => {
    render(<ReportsView data={makeData({ currency: "USD" })} />)
    expect(screen.getAllByText(/\$/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/₹/)).not.toBeInTheDocument()
  })

  it("surfaces an excluded-deals note when buckets were dropped", () => {
    render(<ReportsView data={makeData({ currency: "INR", unconvertibleCount: 3 })} />)
    expect(screen.getByText(/3 deals excluded/)).toBeInTheDocument()
    expect(screen.getByText(/no FX rate to INR/)).toBeInTheDocument()
  })

  it("shows no exclusion note when nothing was dropped", () => {
    render(<ReportsView data={makeData({ unconvertibleCount: 0 })} />)
    expect(screen.queryByText(/excluded/)).not.toBeInTheDocument()
  })
})
