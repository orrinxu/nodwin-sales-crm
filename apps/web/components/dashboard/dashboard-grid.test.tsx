/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeAll } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

import { DashboardGrid } from "./dashboard-grid"

beforeAll(() => {
  // jsdom has no matchMedia; the grid uses it to detect the desktop breakpoint.
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: true, // desktop → the 12-col grid (not the mobile stack)
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
})

const widgets = [
  { id: "summary-strip", node: <div>Summary widget</div> },
  { id: "forecast", node: <div>Forecast widget</div> },
]
const layout = [
  { id: "summary-strip", colSpan: 12, rowSpan: 2 },
  { id: "forecast", colSpan: 6, rowSpan: 3 },
]

describe("DashboardGrid", () => {
  it("renders every widget and an Edit toggle in view mode", () => {
    render(
      <DashboardGrid
        widgets={widgets}
        initialLayout={layout}
        saveAction={vi.fn()}
        resetAction={vi.fn()}
      />,
    )
    expect(screen.getByText("Summary widget")).toBeInTheDocument()
    expect(screen.getByText("Forecast widget")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Edit layout/ })).toBeInTheDocument()
  })

  it("enters edit mode with Done + Reset and per-widget resize handles", () => {
    render(
      <DashboardGrid
        widgets={widgets}
        initialLayout={layout}
        saveAction={vi.fn()}
        resetAction={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /Edit layout/ }))
    expect(screen.getByRole("button", { name: /Done/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Reset/ })).toBeInTheDocument()
    // resize handles are exposed as sliders labelled with the widget title
    expect(screen.getByRole("slider", { name: /Resize Summary/ })).toBeInTheDocument()
    expect(screen.getByRole("slider", { name: /Resize Quarter forecast/ })).toBeInTheDocument()
    // widgets still render
    expect(screen.getByText("Summary widget")).toBeInTheDocument()
  })
})
