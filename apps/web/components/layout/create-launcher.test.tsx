/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))

import { CreateLauncher } from "./create-launcher"

describe("CreateLauncher (ORR-746)", () => {
  beforeEach(() => push.mockClear())

  it("renders the '+ New' trigger", () => {
    render(<CreateLauncher />)
    expect(screen.getByRole("button", { name: /create new/i })).toBeInTheDocument()
  })

  it("opens the menu and routes each record type with ?create=1", async () => {
    render(<CreateLauncher />)
    await userEvent.click(screen.getByRole("button", { name: /create new/i }))

    await waitFor(() => expect(screen.getByText("New opportunity")).toBeInTheDocument())
    expect(screen.getByText("New account")).toBeInTheDocument()
    expect(screen.getByText("New contact")).toBeInTheDocument()

    await userEvent.click(screen.getByText("New account"))
    expect(push).toHaveBeenCalledWith("/accounts?create=1")
  })

  it("opens the menu on the 'c' shortcut", async () => {
    render(<CreateLauncher />)
    expect(screen.queryByText("New opportunity")).not.toBeInTheDocument()
    await userEvent.keyboard("c")
    await waitFor(() => expect(screen.getByText("New opportunity")).toBeInTheDocument())
  })

  it("ignores 'c' while typing in an input", async () => {
    render(
      <div>
        <input aria-label="probe" />
        <CreateLauncher />
      </div>,
    )
    const input = screen.getByLabelText("probe")
    input.focus()
    await userEvent.keyboard("c")
    expect(screen.queryByText("New opportunity")).not.toBeInTheDocument()
    expect(input).toHaveValue("c")
  })
})
