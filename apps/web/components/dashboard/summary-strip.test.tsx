/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"

import { SummaryStrip } from "./summary-strip"
import { selectSummaryStrip } from "./summary-strip-data"
import type { PipelineMetrics } from "@/lib/data/metrics"
import type { ForecastTileData } from "./forecast-tile-data"

function makeMetrics(overrides: Partial<PipelineMetrics> = {}): PipelineMetrics {
  return {
    pipelineValue: 4_200_000,
    dealsWon: 12,
    dealsLost: 8,
    winRate: 60,
    avgDealSize: 180_000,
    unconvertibleCount: 0,
    currency: "USD",
    ...overrides,
  }
}

function makeForecast(overrides: Partial<ForecastTileData> = {}): ForecastTileData {
  return {
    committed: 1_000_000,
    weighted: 1_800_000,
    weightedNextQuarter: 500_000,
    currency: "USD",
    unconvertibleCount: 0,
    ...overrides,
  }
}

describe("selectSummaryStrip", () => {
  it("maps pipeline metrics + weighted forecast into the strip view model", () => {
    const d = selectSummaryStrip(makeMetrics(), makeForecast())
    expect(d).toEqual({
      pipelineValue: 4_200_000,
      weighted: 1_800_000,
      winRate: 60,
      dealsWon: 12,
      dealsLost: 8,
      avgDealSize: 180_000,
      currency: "USD",
      unconvertibleCount: 0,
    })
  })
})

describe("SummaryStrip", () => {
  it("renders headline KPIs formatted in the reporting currency", () => {
    render(
      <SummaryStrip data={selectSummaryStrip(makeMetrics(), makeForecast())} locale="en-US" />,
    )
    expect(screen.getByText("$4,200,000")).toBeInTheDocument() // pipeline value
    expect(screen.getByText("$1,800,000")).toBeInTheDocument() // weighted forecast
    expect(screen.getByText("60%")).toBeInTheDocument() // win rate
    expect(screen.getByText("Deals Won")).toBeInTheDocument()
    expect(screen.getByText("12")).toBeInTheDocument()
  })

  it("formats money with the Indian locale (lakh/crore grouping)", () => {
    render(
      <SummaryStrip
        data={selectSummaryStrip(
          makeMetrics({ currency: "INR" }),
          makeForecast({ currency: "INR" }),
        )}
        locale="en-IN"
      />,
    )
    expect(screen.getByText("₹42,00,000")).toBeInTheDocument()
  })

  it("surfaces the unconverted tile only when subtotals were dropped for FX", () => {
    const { rerender } = render(
      <SummaryStrip data={selectSummaryStrip(makeMetrics(), makeForecast())} locale="en-US" />,
    )
    expect(screen.queryByText("Unconverted")).not.toBeInTheDocument()

    rerender(
      <SummaryStrip
        data={selectSummaryStrip(makeMetrics({ unconvertibleCount: 3 }), makeForecast())}
        locale="en-US"
      />,
    )
    expect(screen.getByText("Unconverted")).toBeInTheDocument()
    expect(screen.getByText("No FX rate to USD")).toBeInTheDocument()
  })
})
