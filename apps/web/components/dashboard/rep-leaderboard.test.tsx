/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"

import { RepLeaderboard } from "./rep-leaderboard"
import type { RepScorecardRow } from "@/lib/data/forecast"

function row(
  o: Partial<RepScorecardRow> & { ownerId: string | null; ownerName: string },
): RepScorecardRow {
  return {
    openPipeline: 0,
    weightedPipeline: 0,
    won: 0,
    winRate: null,
    avgSalesCycleDays: null,
    ...o,
  }
}

// Won-leader (Bob) differs from weighted-leader (Alice) so the toggle is observable.
const SCORECARD = [
  row({ ownerId: "a", ownerName: "Alice", won: 100_000, weightedPipeline: 500_000, winRate: 40 }),
  row({ ownerId: "b", ownerName: "Bob", won: 300_000, weightedPipeline: 100_000, winRate: 70 }),
]

function firstRowText(container: HTMLElement): string {
  return within(container).getAllByRole("listitem")[0].textContent ?? ""
}

describe("RepLeaderboard", () => {
  it("ranks by Won by default and marks the signed-in rep", () => {
    const { container } = render(
      <RepLeaderboard scorecard={SCORECARD} currentUserId="a" currency="USD" locale="en-US" />,
    )
    expect(screen.getByText("Team leaderboard")).toBeInTheDocument()
    expect(firstRowText(container)).toContain("Bob") // 300k won leads
    expect(screen.getByText("$300K")).toBeInTheDocument()
    expect(screen.getByText("(you)")).toBeInTheDocument() // Alice is the viewer
  })

  it("re-ranks when the metric toggle changes to Weighted", () => {
    const { container } = render(
      <RepLeaderboard scorecard={SCORECARD} currentUserId="a" currency="USD" locale="en-US" />,
    )
    expect(firstRowText(container)).toContain("Bob")
    fireEvent.click(screen.getByRole("button", { name: "Weighted" }))
    expect(firstRowText(container)).toContain("Alice") // 500k weighted leads now
  })

  it("formats the win-rate metric as a percentage", () => {
    render(
      <RepLeaderboard scorecard={SCORECARD} currentUserId="a" currency="USD" locale="en-US" />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Win rate" }))
    expect(screen.getByText("70%")).toBeInTheDocument()
    expect(screen.getByText("40%")).toBeInTheDocument()
  })

  it("shows the empty state when there are no rankable reps", () => {
    render(
      <RepLeaderboard
        scorecard={[row({ ownerId: null, ownerName: "Unassigned", won: 10 })]}
        currentUserId="a"
        currency="USD"
        locale="en-US"
      />,
    )
    expect(screen.getByText("No reps to rank")).toBeInTheDocument()
  })
})
