/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { assign, remove } = vi.hoisted(() => ({ assign: vi.fn(), remove: vi.fn() }))
vi.mock("@/app/(crm)/direct-reports/actions", () => ({
  assignDirectReportAction: assign,
  removeDirectReportAction: remove,
}))

import { DirectReportsRoster } from "./direct-reports-roster"

const reports = [{ id: "r1", name: "Rep One", email: "one@n.com" }]
const manageable = [{ id: "m1", name: "Rep Two", email: "two@n.com" }]

describe("DirectReportsRoster (ORR-715)", () => {
  beforeEach(() => { assign.mockReset(); remove.mockReset() })

  it("lists current reports and addable reps", () => {
    render(<DirectReportsRoster directReports={reports} manageableReps={manageable} />)
    expect(screen.getByText("Rep One")).toBeInTheDocument()
    expect(screen.getByText("Rep Two")).toBeInTheDocument()
  })

  it("Add calls assign with the rep id", async () => {
    assign.mockResolvedValue({ ok: true })
    render(<DirectReportsRoster directReports={[]} manageableReps={manageable} />)
    await userEvent.click(screen.getByRole("button", { name: /add/i }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith("m1"))
  })

  it("Remove calls remove with the report id", async () => {
    remove.mockResolvedValue({ ok: true })
    render(<DirectReportsRoster directReports={reports} manageableReps={[]} />)
    await userEvent.click(screen.getByRole("button", { name: /remove/i }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith("r1"))
  })

  it("surfaces an action error", async () => {
    assign.mockResolvedValue({ ok: false, error: "You can only manage sales reps in your own entity and business unit." })
    render(<DirectReportsRoster directReports={[]} manageableReps={manageable} />)
    await userEvent.click(screen.getByRole("button", { name: /add/i }))
    await waitFor(() => expect(screen.getByText(/only manage sales reps/i)).toBeInTheDocument())
  })
})
