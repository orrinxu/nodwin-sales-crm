/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { ForecastTile, selectForecastTile } from "./forecast-tile"
import type { ForecastTileData } from "./forecast-tile"
import type { ForecastData } from "@/lib/data/forecast"

// A fully-populated ForecastData as the data layer would return it. The tile must
// consume ONLY the current-quarter (+ next-quarter) totals — it does not
// re-aggregate the period/stage/scorecard breakdowns.
function makeForecastData(overrides: Partial<ForecastData> = {}): ForecastData {
  return {
    currency: "INR",
    weightedThisQuarter: 4_200_000,
    committedThisQuarter: 9_000_000,
    weightedNextQuarter: 1_500_000,
    openPipelineTotal: 12_000_000,
    weightedPipelineTotal: 5_700_000,
    periodBreakdown: [
      {
        period: "this_quarter",
        label: "This quarter",
        weighted: 4_200_000,
        committed: 9_000_000,
        openPipeline: 8_000_000,
      },
      {
        period: "next_quarter",
        label: "Next quarter",
        weighted: 1_500_000,
        committed: 0,
        openPipeline: 4_000_000,
      },
    ],
    stageBreakdown: [],
    revenueCurve: [],
    scorecard: [],
    unconvertibleCount: 0,
    ...overrides,
  }
}

describe("selectForecastTile", () => {
  it("picks the current-quarter committed and weighted totals (not next quarter)", () => {
    const view = selectForecastTile(makeForecastData())
    expect(view.committed).toBe(9_000_000)
    expect(view.weighted).toBe(4_200_000)
    // Committed and weighted must be distinct fields, not swapped.
    expect(view.committed).not.toBe(view.weighted)
  })

  it("carries next-quarter weighted separately from this quarter", () => {
    const view = selectForecastTile(makeForecastData())
    expect(view.weightedNextQuarter).toBe(1_500_000)
    expect(view.weightedNextQuarter).not.toBe(view.weighted)
  })

  it("passes through the FX-normalised reporting currency and unconvertible count", () => {
    const view = selectForecastTile(
      makeForecastData({ currency: "USD", unconvertibleCount: 2 }),
    )
    expect(view.currency).toBe("USD")
    expect(view.unconvertibleCount).toBe(2)
  })
})

describe("ForecastTile", () => {
  const populated: ForecastTileData = {
    committed: 9_000_000,
    weighted: 4_200_000,
    weightedNextQuarter: 1_500_000,
    currency: "USD",
    unconvertibleCount: 0,
  }

  it("renders committed, weighted, and next-quarter tiles with FX-normalised, locale-formatted values", () => {
    render(<ForecastTile data={populated} locale="en-US" />)

    expect(screen.getByText("Committed — this quarter")).toBeInTheDocument()
    expect(screen.getByText("Weighted — this quarter")).toBeInTheDocument()
    expect(screen.getByText("Weighted — next quarter")).toBeInTheDocument()

    // Values formatted in the reporting currency with the given locale.
    expect(screen.getByText("$9,000,000")).toBeInTheDocument()
    expect(screen.getByText("$4,200,000")).toBeInTheDocument()
    expect(screen.getByText("$1,500,000")).toBeInTheDocument()

    expect(screen.queryByText("No forecast yet")).not.toBeInTheDocument()
  })

  it("groups digits per the Indian locale when requested", () => {
    render(<ForecastTile data={{ ...populated, currency: "INR" }} locale="en-IN" />)
    // 42,00,000 grouping (lakh) rather than 4,200,000.
    expect(screen.getByText("₹42,00,000")).toBeInTheDocument()
  })

  it("surfaces excluded currency subtotals when some had no FX rate", () => {
    render(
      <ForecastTile data={{ ...populated, unconvertibleCount: 1 }} locale="en-US" />,
    )
    expect(
      screen.getByText(/1 currency subtotal excluded — no FX rate to USD\./),
    ).toBeInTheDocument()
  })

  it("renders a clean empty state when there is no forecast data", () => {
    render(
      <ForecastTile
        data={{
          committed: 0,
          weighted: 0,
          weightedNextQuarter: 0,
          currency: "INR",
          unconvertibleCount: 0,
        }}
        locale="en-US"
      />,
    )
    expect(screen.getByText("No forecast yet")).toBeInTheDocument()
    expect(screen.queryByText("Committed — this quarter")).not.toBeInTheDocument()
  })
})
