/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { AttachContactsDialog } from "./attach-contacts-dialog"

const contacts = [
  { id: "c-1", fullName: "Alice Smith", email: "alice@x.com", title: "CEO" },
  { id: "c-2", fullName: "Bob Jones", email: null, title: null },
]

function setup(attachable = contacts) {
  const attachAction = vi.fn().mockResolvedValue(undefined)
  const createAction = vi.fn().mockResolvedValue({})
  const onDone = vi.fn()
  render(
    <AttachContactsDialog
      accountId="acct-1"
      attachableContacts={attachable}
      attachAction={attachAction}
      createAction={createAction}
      onDone={onDone}
    />,
  )
  return { attachAction, createAction, onDone }
}

describe("AttachContactsDialog", () => {
  it("attaches selected existing contacts", async () => {
    const { attachAction, onDone } = setup()
    fireEvent.click(screen.getByRole("button", { name: "Attach" }))
    await waitFor(() => expect(screen.getByText("Attach contacts")).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText("Select Alice Smith"))
    fireEvent.click(screen.getByRole("button", { name: /Attach \(1\)/ }))

    await waitFor(() =>
      expect(attachAction).toHaveBeenCalledWith("acct-1", { contactIds: ["c-1"] }),
    )
    expect(onDone).toHaveBeenCalled()
  })

  it("filters the existing list by search", async () => {
    setup()
    fireEvent.click(screen.getByRole("button", { name: "Attach" }))
    await waitFor(() => expect(screen.getByText("Attach contacts")).toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText("Search contacts..."), { target: { value: "bob" } })
    expect(screen.queryByText("Alice Smith")).not.toBeInTheDocument()
    expect(screen.getByText("Bob Jones")).toBeInTheDocument()
  })

  it("creates a new contact from the New contact tab", async () => {
    const { createAction, onDone } = setup()
    fireEvent.click(screen.getByRole("button", { name: "Attach" }))
    await waitFor(() => expect(screen.getByText("Attach contacts")).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: "New contact" }))
    fireEvent.change(screen.getByLabelText(/Full Name/), { target: { value: "Carol Lee" } })
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "carol@x.com" } })
    fireEvent.click(screen.getByRole("button", { name: "Create & attach" }))

    await waitFor(() =>
      expect(createAction).toHaveBeenCalledWith("acct-1", {
        fullName: "Carol Lee",
        email: "carol@x.com",
        title: null,
      }),
    )
    expect(onDone).toHaveBeenCalled()
  })

  it("shows an empty message when there are no attachable contacts", async () => {
    setup([])
    fireEvent.click(screen.getByRole("button", { name: "Attach" }))
    await waitFor(() =>
      expect(screen.getByText("No other contacts available to attach.")).toBeInTheDocument(),
    )
  })
})
