/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"

import { ConversionFunnel } from "./conversion-funnel"
import { buildConversionFunnel } from "@/lib/opportunity/conversion-funnel"

describe("ConversionFunnel", () => {
  it("renders each funnel stage with its reached count and the lost context", () => {
    const data = buildConversionFunnel({
      qualify: 10,
      propose: 5,
      closed_won: 2,
      closed_lost: 4,
    })
    render(<ConversionFunnel data={data} locale="en-US" />)

    expect(screen.getByText("Conversion by Stage")).toBeInTheDocument()
    expect(screen.getByText("Qualify")).toBeInTheDocument()
    expect(screen.getByText("Closed Won")).toBeInTheDocument()
    expect(screen.getByText(/closed-lost/)).toBeInTheDocument() // 4 lost, shown as context
  })

  it("summarises entered / won / overall conversion in the header", () => {
    const data = buildConversionFunnel({ qualify: 8, closed_won: 2 })
    render(<ConversionFunnel data={data} locale="en-US" />)
    // topCount = 8 + 2 = 10, won 2, overall = round(2/10 × 100) = 20
    expect(screen.getByText(/10 entered/)).toBeInTheDocument()
    expect(screen.getByText(/2 won/)).toBeInTheDocument()
    expect(screen.getByText(/20% overall/)).toBeInTheDocument()
  })

  it("shows the empty state when no deals are in the funnel", () => {
    render(<ConversionFunnel data={buildConversionFunnel({})} locale="en-US" />)
    expect(screen.getByText("No deals in the funnel")).toBeInTheDocument()
  })
})
