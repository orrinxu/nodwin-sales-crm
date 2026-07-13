import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}))

const logTouchAction = vi.fn()
vi.mock("@/app/(crm)/dashboard/actions", () => ({
  logTouchAction: (...args: unknown[]) => logTouchAction(...args),
}))

import { ReconnectButton } from "./reconnect-button"

describe("ReconnectButton", () => {
  beforeEach(() => {
    refresh.mockClear()
    logTouchAction.mockReset()
    logTouchAction.mockResolvedValue({ id: "act-1" })
  })

  it("renders a Reconnect trigger", () => {
    render(<ReconnectButton opportunityId="opp-1" dealName="BGMI Masters" />)
    expect(screen.getByRole("button", { name: /reconnect/i })).toBeInTheDocument()
  })

  it("opens the log-a-touch dialog with the deal name", async () => {
    const user = userEvent.setup()
    render(<ReconnectButton opportunityId="opp-1" dealName="BGMI Masters" />)
    await user.click(screen.getByRole("button", { name: /reconnect/i }))
    expect(await screen.findByText("Log a touch")).toBeInTheDocument()
    expect(screen.getByText("BGMI Masters")).toBeInTheDocument()
  })

  it("keeps submit disabled until a subject or note is entered", async () => {
    const user = userEvent.setup()
    render(<ReconnectButton opportunityId="opp-1" dealName="BGMI Masters" />)
    await user.click(screen.getByRole("button", { name: /reconnect/i }))
    const submit = await screen.findByRole("button", { name: /log touch/i })
    expect(submit).toBeDisabled()
    await user.type(screen.getByLabelText("Note"), "Left a voicemail")
    expect(submit).toBeEnabled()
  })

  it("logs the selected touch type against the deal and refreshes", async () => {
    const user = userEvent.setup()
    render(<ReconnectButton opportunityId="opp-1" dealName="BGMI Masters" />)
    await user.click(screen.getByRole("button", { name: /reconnect/i }))
    await screen.findByText("Log a touch")

    // Pick the Meeting touch type, then add a note.
    await user.click(screen.getByRole("button", { name: /meeting/i, pressed: false }))
    await user.type(screen.getByLabelText("Note"), "Booked Q3 renewal chat")
    await user.click(screen.getByRole("button", { name: /log touch/i }))

    await waitFor(() => expect(logTouchAction).toHaveBeenCalledTimes(1))
    expect(logTouchAction).toHaveBeenCalledWith(
      "opp-1",
      expect.objectContaining({
        opportunityId: "opp-1",
        type: "meeting",
        body: "Booked Q3 renewal chat",
        metadata: { logged_from: "dashboard_reconnect" },
      }),
    )
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })
})
