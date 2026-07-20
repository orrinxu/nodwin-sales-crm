import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { OpportunitySplitsEditor } from "./opportunity-splits-editor"
import type { OpportunitySplit } from "@/lib/data/opportunities.types"

vi.mock("server-only", () => ({}))

const businessUnits = [
  { id: "bu-1", name: "East Asia Sales" },
  { id: "bu-2", name: "India Sales" },
]
const users = [
  { id: "user-1", fullName: "Alice" },
  { id: "user-2", fullName: "Bob" },
]

const oneHundredSplit: OpportunitySplit[] = [
  {
    id: "s-1",
    opportunityId: "opp-1",
    salesUnitId: "bu-1",
    userId: "user-1",
    pct: 100,
    notes: null,
    createdAt: "2026-01-01T00:00:00Z",
  },
]

describe("OpportunitySplitsEditor — unit-less row guard (ORR-812)", () => {
  function setup() {
    return userEvent.setup({ pointerEventsCheck: 0 })
  }

  it("blocks save when a row has a percentage but no sales unit", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const user = setup()
    render(
      <OpportunitySplitsEditor
        splits={oneHundredSplit}
        businessUnits={businessUnits}
        users={users}
        onSave={onSave}
      />,
    )

    // Add a second row and give it a percentage but leave its sales unit blank.
    await user.click(screen.getByRole("button", { name: /add split/i }))
    const pctInputs = screen.getAllByRole("spinbutton")
    await user.clear(pctInputs[1])
    await user.type(pctInputs[1], "20")

    await user.click(screen.getByRole("button", { name: /save splits/i }))

    expect(onSave).not.toHaveBeenCalled()
    expect(
      await screen.findByText(/every split with a percentage needs a sales unit/i),
    ).toBeInTheDocument()
  })

  it("saves when every row with a percentage has a sales unit", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const user = setup()
    render(
      <OpportunitySplitsEditor
        splits={oneHundredSplit}
        businessUnits={businessUnits}
        users={users}
        onSave={onSave}
      />,
    )

    await user.click(screen.getByRole("button", { name: /save splits/i }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave).toHaveBeenCalledWith([
      expect.objectContaining({ salesUnitId: "bu-1", pct: 100 }),
    ])
  })
})
