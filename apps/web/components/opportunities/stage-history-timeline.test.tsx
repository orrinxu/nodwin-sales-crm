import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { StageHistoryTimeline } from "./stage-history-timeline"
import type { StageHistoryRecord } from "@/lib/data/opportunity-stage-history"
import { getStageLabel } from "@/lib/data/opportunities.types"

vi.mock("server-only", () => ({}))

function makeEntry(
  overrides: Partial<StageHistoryRecord> = {},
): StageHistoryRecord {
  return {
    id: "entry-1",
    opportunityId: "opp-1",
    fromStage: "qualify",
    toStage: "meet_and_present",
    event: "ADVANCE",
    reason: null,
    createdBy: "user-1",
    createdByName: "Alice",
    createdAt: "2026-04-01T10:00:00Z",
    ...overrides,
  }
}

describe("StageHistoryTimeline", () => {
  it("shows empty state when history is empty", () => {
    render(<StageHistoryTimeline history={[]} />)
    expect(screen.getByText("No stage changes recorded yet.")).toBeInTheDocument()
  })

  it("renders a single history entry", () => {
    render(<StageHistoryTimeline history={[makeEntry()]} />)
    expect(screen.getByText("Qualify")).toBeInTheDocument()
    expect(screen.getByText("Meet & Present")).toBeInTheDocument()
    expect(screen.getByText("Advanced")).toBeInTheDocument()
    expect(screen.getByText("by Alice")).toBeInTheDocument()
  })

  it("renders CLOSE_WON event with correct label", () => {
    render(
      <StageHistoryTimeline
        history={[
          makeEntry({
            fromStage: "negotiate",
            toStage: "closed_won",
            event: "CLOSE_WON",
          }),
        ]}
      />,
    )
    expect(screen.getByText("Negotiate")).toBeInTheDocument()
    expect(screen.getAllByText("Closed Won")).toHaveLength(2)
  })

  it("renders CLOSE_LOST event with correct label", () => {
    render(
      <StageHistoryTimeline
        history={[
          makeEntry({
            fromStage: "propose",
            toStage: "closed_lost",
            event: "CLOSE_LOST",
          }),
        ]}
      />,
    )
    expect(screen.getByText("Propose")).toBeInTheDocument()
    expect(screen.getAllByText("Closed Lost")).toHaveLength(2)
  })

  it("renders MOVE_BACKWARD event", () => {
    render(
      <StageHistoryTimeline
        history={[
          makeEntry({
            fromStage: "negotiate",
            toStage: "propose",
            event: "MOVE_BACKWARD",
          }),
        ]}
      />,
    )
    expect(screen.getByText("Negotiate")).toBeInTheDocument()
    expect(screen.getByText("Propose")).toBeInTheDocument()
    expect(screen.getByText("Moved Back")).toBeInTheDocument()
  })

  it("renders REOPEN event", () => {
    render(
      <StageHistoryTimeline
        history={[
          makeEntry({
            fromStage: "closed_lost",
            toStage: "qualify",
            event: "REOPEN",
          }),
        ]}
      />,
    )
    expect(screen.getByText("Reopened")).toBeInTheDocument()
  })

  it("renders FORCE_STAGE event", () => {
    render(
      <StageHistoryTimeline
        history={[
          makeEntry({
            fromStage: "qualify",
            toStage: "closed_won",
            event: "FORCE_STAGE",
          }),
        ]}
      />,
    )
    expect(screen.getByText("Forced")).toBeInTheDocument()
  })

  it("displays reason when provided", () => {
    render(
      <StageHistoryTimeline
        history={[
          makeEntry({
            reason: "Client requested urgent change",
          }),
        ]}
      />,
    )
    expect(screen.getByText("Client requested urgent change")).toBeInTheDocument()
  })

  it("hides creator name when null", () => {
    render(
      <StageHistoryTimeline
        history={[
          makeEntry({ createdByName: null }),
        ]}
      />,
    )
    expect(screen.queryByText(/by/)).not.toBeInTheDocument()
  })

  it("displays all stages using getStageLabel", () => {
    const stages: [string, string][] = [
      ["qualify", "Qualify"],
      ["meet_and_present", "Meet & Present"],
      ["propose", "Propose"],
      ["negotiate", "Negotiate"],
      ["verbal_agreement", "Verbal Agreement"],
      ["closed_won", "Closed Won"],
      ["closed_lost", "Closed Lost"],
    ]
    for (const [stage, label] of stages) {
      const { unmount } = render(
        <StageHistoryTimeline
          history={[
            makeEntry({
              id: `entry-${stage}`,
              fromStage: stage as StageHistoryRecord["fromStage"],
              toStage: stage as StageHistoryRecord["toStage"],
            }),
          ]}
        />,
      )
      expect(screen.getAllByText(label)).toHaveLength(2)
      unmount()
    }
  })

  it("renders multiple entries in order", () => {
    const entries = [
      makeEntry({
        id: "entry-1",
        createdAt: "2026-04-02T10:00:00Z",
        fromStage: "meet_and_present",
        toStage: "propose",
      }),
      makeEntry({
        id: "entry-2",
        createdAt: "2026-04-01T10:00:00Z",
        fromStage: "qualify",
        toStage: "meet_and_present",
      }),
    ]
    render(<StageHistoryTimeline history={entries} />)
    expect(screen.getByText("Qualify")).toBeInTheDocument()
    expect(screen.getAllByText("Meet & Present")).toHaveLength(2)
    expect(screen.getByText("Propose")).toBeInTheDocument()
  })
})
