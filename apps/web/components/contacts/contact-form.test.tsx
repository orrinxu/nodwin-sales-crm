import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ContactForm } from "./contact-form"
import type { AccountOption } from "@/lib/data/contacts"

vi.mock("server-only", () => ({}))

const mockAccounts: AccountOption[] = [
  { id: "acct-1", name: "Acme Corp" },
  { id: "acct-2", name: "Globex Inc" },
]

const defaultProps = {
  accounts: mockAccounts,
  createAction: vi.fn(),
  onSuccess: vi.fn(),
}

describe("ContactForm", () => {
  it("renders create mode without throwing", () => {
    expect(() => <ContactForm {...defaultProps} />).not.toThrow()
  })

  it("renders edit mode without throwing", () => {
    expect(() => (
      <ContactForm
        {...defaultProps}
        contact={{
          id: "contact-1",
          fullName: "John Doe",
          primaryAccountId: "acct-1",
          title: "CEO",
          email: "john@acme.com",
          phone: "+1-555-0000",
          socials: { linkedin: "https://linkedin.com/in/john" },
          notes: "A note",
          ownerUserId: null,
          customData: {},
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-15T00:00:00Z",
        }}
        linkedAccountIds={["acct-2"]}
        updateAction={vi.fn()}
      />
    )).not.toThrow()
  })

  it("renders with minimal props", () => {
    expect(() => (
      <ContactForm
        accounts={[]}
        createAction={vi.fn()}
        onSuccess={vi.fn()}
      />
    )).not.toThrow()
  })

  it("submits a name-only contact (the default empty social row must not block submit)", async () => {
    const createAction = vi.fn().mockResolvedValue({ id: "c1" })
    const onSuccess = vi.fn()
    const user = userEvent.setup()

    render(
      <ContactForm
        accounts={mockAccounts}
        createAction={createAction}
        onSuccess={onSuccess}
      />,
    )

    // Open the sheet via the trigger.
    await user.click(screen.getByRole("button", { name: /create contact/i }))

    // Fill only the required field.
    await user.type(await screen.findByLabelText(/full name/i), "Jane Smith")

    // The submit button shares the "Create Contact" label with the trigger;
    // pick the type="submit" one inside the form.
    const submit = screen
      .getAllByRole("button", { name: /create contact/i })
      .find((b) => b.getAttribute("type") === "submit")
    await user.click(submit as HTMLElement)

    await waitFor(() => expect(createAction).toHaveBeenCalledTimes(1))
    expect(createAction.mock.calls[0][0]).toMatchObject({ fullName: "Jane Smith" })
    expect(onSuccess).toHaveBeenCalled()
  })

  it("renders NO launcher when the dialog is controlled (generator owns it)", () => {
    // Regression: a controlled ContactForm (used inside the AI generator) must not
    // render its default button, or the page shows two "Create Contact" buttons.
    render(
      <ContactForm
        accounts={[]}
        createAction={vi.fn()}
        onSuccess={vi.fn()}
        open={false}
        onOpenChange={vi.fn()}
      />,
    )
    expect(screen.queryByRole("button", { name: /create contact/i })).not.toBeInTheDocument()
  })
})
