import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"

import { StageBadge } from "@/components/primitives/stage-badge"
import { STAGE } from "@/lib/theme/stage"

afterEach(cleanup)

describe("StageBadge", () => {
  it("renders the default human label for a stage", () => {
    render(<StageBadge stage="meet_and_present" />)
    expect(screen.getByText("Meet & Present")).toBeTruthy()
  })

  it("renders an override label when provided", () => {
    render(<StageBadge stage="qualify" label="Custom" />)
    expect(screen.getByText("Custom")).toBeTruthy()
  })

  it("applies the mapped STAGE colours via inline style", () => {
    render(<StageBadge stage="closed_won" label="Won" />)
    const el = screen.getByText("Won")
    // Colours are CSS var() references resolved to the fixed 7-stage ramp.
    expect(el.style.backgroundColor).toBe(STAGE.closed_won.badgeBg)
    expect(el.style.color).toBe(STAGE.closed_won.badgeFg)
    expect(el.getAttribute("data-stage")).toBe("closed_won")
  })

  it("maps every canonical stage to a distinct chart colour", () => {
    const charts = Object.values(STAGE).map((c) => c.chartSolid)
    expect(new Set(charts).size).toBe(charts.length)
  })
})
