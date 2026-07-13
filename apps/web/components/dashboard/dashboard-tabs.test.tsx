import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { DashboardTabs } from "./dashboard-tabs"

function renderTabs() {
  return render(
    <DashboardTabs
      myFocus={<div>MY FOCUS PANEL</div>}
      team={<div>TEAM PANEL</div>}
      group={<div>GROUP PANEL</div>}
    />,
  )
}

describe("DashboardTabs", () => {
  it("shows the My focus panel by default with all three tabs", () => {
    renderTabs()
    expect(screen.getByRole("tab", { name: "My focus" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tab", { name: "Team" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Group" })).toBeInTheDocument()
    expect(screen.getByText("MY FOCUS PANEL")).toBeInTheDocument()
    expect(screen.queryByText("TEAM PANEL")).not.toBeInTheDocument()
  })

  it("switches to the Team panel", async () => {
    const user = userEvent.setup()
    renderTabs()
    await user.click(screen.getByRole("tab", { name: "Team" }))
    expect(screen.getByText("TEAM PANEL")).toBeInTheDocument()
    expect(screen.queryByText("MY FOCUS PANEL")).not.toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Team" })).toHaveAttribute("aria-selected", "true")
  })

  it("switches to the Group panel", async () => {
    const user = userEvent.setup()
    renderTabs()
    await user.click(screen.getByRole("tab", { name: "Group" }))
    expect(screen.getByText("GROUP PANEL")).toBeInTheDocument()
    expect(screen.queryByText("MY FOCUS PANEL")).not.toBeInTheDocument()
  })
})
