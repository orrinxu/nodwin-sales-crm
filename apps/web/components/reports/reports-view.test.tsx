import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { ReportsView } from "./reports-view"
import type { ReportData } from "@/lib/data/reports"

const mockData: ReportData = {
  pipelineByStage: [
    { stage: "qualify", label: "Qualify", count: 5, amount: 50000 },
    { stage: "meet_and_present", label: "Meet & Present", count: 3, amount: 75000 },
    { stage: "propose", label: "Propose", count: 2, amount: 120000 },
  ],
  wonLostRevenue: [
    { type: "won", amount: 200000, count: 4 },
    { type: "lost", amount: 50000, count: 2 },
    { type: "open", amount: 245000, count: 10 },
  ],
  monthlyTrends: [
    { month: "2026-01", created: 5, won: 1, amount: 50000 },
    { month: "2026-02", created: 3, won: 2, amount: 100000 },
    { month: "2026-03", created: 4, won: 1, amount: 50000 },
  ],
  topAccounts: [
    { name: "Acme Corp", amount: 150000, count: 3 },
    { name: "GlobalTech", amount: 100000, count: 2 },
    { name: "Startup Inc", amount: 50000, count: 1 },
  ],
  totalPipeline: 245000,
  totalWon: 200000,
  avgDealSize: 50000,
  winRate: 67,
}

const emptyData: ReportData = {
  pipelineByStage: [],
  wonLostRevenue: [
    { type: "won", amount: 0, count: 0 },
    { type: "lost", amount: 0, count: 0 },
    { type: "open", amount: 0, count: 0 },
  ],
  monthlyTrends: [],
  topAccounts: [],
  totalPipeline: 0,
  totalWon: 0,
  avgDealSize: 0,
  winRate: 0,
}

describe("ReportsView", () => {
  it("renders the reports heading", () => {
    render(<ReportsView data={mockData} />)
    expect(screen.getByRole("heading", { name: "Reports" })).toBeInTheDocument()
  })

  it("renders the pipeline, revenue, and activity subtitle", () => {
    render(<ReportsView data={mockData} />)
    expect(
      screen.getByText("Pipeline, revenue, and activity metrics."),
    ).toBeInTheDocument()
  })

  it("renders all four KPI cards", () => {
    render(<ReportsView data={mockData} />)
    expect(screen.getByText("Total Pipeline")).toBeInTheDocument()
    expect(screen.getByText("Closed Won")).toBeInTheDocument()
    expect(screen.getByText("Win Rate")).toBeInTheDocument()
    expect(screen.getByText("Avg Deal Size")).toBeInTheDocument()
  })

  it("formats currency values in KPI cards", () => {
    render(<ReportsView data={mockData} />)
    expect(screen.getByText("$245K")).toBeInTheDocument()
    expect(screen.getByText("$200K")).toBeInTheDocument()
    expect(screen.getByText("$50K")).toBeInTheDocument()
  })

  it("displays win rate as percentage", () => {
    render(<ReportsView data={mockData} />)
    expect(screen.getByText("67%")).toBeInTheDocument()
  })

  it("renders all four chart section titles", () => {
    render(<ReportsView data={mockData} />)
    expect(screen.getByText("Pipeline by Stage")).toBeInTheDocument()
    expect(screen.getByText("Revenue Breakdown")).toBeInTheDocument()
    expect(screen.getByText("Deal Trends")).toBeInTheDocument()
    expect(screen.getByText("Top Accounts by Revenue")).toBeInTheDocument()
  })

  it("handles empty data gracefully", () => {
    render(<ReportsView data={emptyData} />)
    expect(screen.getByText("Win Rate")).toBeInTheDocument()
    expect(screen.getByText("0%")).toBeInTheDocument()
  })

  it("handles zero win rate from no closed deals", () => {
    render(<ReportsView data={emptyData} />)
    expect(screen.getByText("0%")).toBeInTheDocument()
  })

  it("renders top accounts chart without error with long account names", () => {
    const dataWithLongName: ReportData = {
      ...mockData,
      topAccounts: [
        {
          name: "Very Long Corporation Name That Exceeds Twenty Characters",
          amount: 10000,
          count: 1,
        },
      ],
    }
    render(<ReportsView data={dataWithLongName} />)
    expect(screen.getByText("Top Accounts by Revenue")).toBeInTheDocument()
  })
})
