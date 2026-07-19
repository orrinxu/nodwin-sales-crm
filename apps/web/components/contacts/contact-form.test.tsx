import { useState } from "react"
import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ContactForm } from "./contact-form"
import type { AccountOption, ContactRecord } from "@/lib/data/contacts"

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

  describe("inline account create (ORR-738)", () => {
    it("uses a creatable account combobox when createAccountQuickAction is given (new contact)", async () => {
      const createAccountQuickAction = vi
        .fn()
        .mockResolvedValue({ id: "acct-new", name: "Newco Industries" })
      const user = userEvent.setup({ pointerEventsCheck: 0 })

      render(
        <ContactForm
          {...defaultProps}
          createAccountQuickAction={createAccountQuickAction}
        />,
      )
      await user.click(screen.getByRole("button", { name: /create contact/i }))

      // The primary-account picker is now the combobox (shows its placeholder),
      // not the native <select> (which has a "No primary account" <option>).
      const trigger = screen.getByText("No primary account")
      await user.click(trigger)
      await user.type(
        screen.getByPlaceholderText(/search or create an account/i),
        "Newco Industries",
      )
      await user.click(
        screen.getByRole("button", { name: 'Create "Newco Industries"' }),
      )

      await waitFor(() =>
        expect(createAccountQuickAction).toHaveBeenCalledWith({ name: "Newco Industries" }),
      )
    })

    it("uses a non-creating account combobox when no quick-create action is given", async () => {
      // ORR-767: the picker is always a typeahead combobox now; without a
      // quick-create action it just can't create (search-only placeholder).
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(<ContactForm {...defaultProps} />)
      await user.click(screen.getByRole("button", { name: /create contact/i }))

      // Combobox trigger (placeholder text), not a native <select> <option>.
      expect(screen.queryByRole("option", { name: /no primary account/i })).toBeNull()
      await user.click(screen.getByText("No primary account"))
      // Search-only placeholder — no "or create" affordance.
      expect(screen.getByPlaceholderText(/^search an account/i)).toBeInTheDocument()
      expect(screen.queryByPlaceholderText(/search or create/i)).toBeNull()
    })

    it("uses a non-creating account combobox when editing, even with a quick-create action", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <ContactForm
          {...defaultProps}
          createAccountQuickAction={vi.fn()}
          updateAction={vi.fn()}
          contact={{
            id: "contact-1",
            fullName: "John Doe",
            primaryAccountId: "acct-1",
            title: null,
            email: null,
            phone: null,
            socials: {},
            notes: null,
            ownerUserId: null,
            customData: {},
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-15T00:00:00Z",
          }}
        />,
      )
      // Default trigger button is labelled "Create Contact" even when editing.
      await user.click(screen.getByRole("button", { name: /create contact/i }))
      // No native <select> option; editing disables inline create. The combobox
      // trigger shows the selected account's name (acct-1 → "Acme Corp").
      expect(screen.queryByRole("option", { name: /no primary account/i })).toBeNull()
      await user.click(screen.getByText("Acme Corp"))
      expect(screen.getByPlaceholderText(/^search an account/i)).toBeInTheDocument()
      expect(screen.queryByPlaceholderText(/search or create/i)).toBeNull()
    })
  })

  describe("ORR-801: edit dialog re-seeds from the current contact prop", () => {
    const baseContact: ContactRecord = {
      id: "contact-1",
      fullName: "John Doe",
      primaryAccountId: "acct-1",
      title: "CEO",
      email: "john@acme.com",
      phone: "+1-555-0000",
      socials: {},
      notes: "A note",
      ownerUserId: null,
      customData: {},
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-15T00:00:00Z",
    }

    // Stands in for the parent RSC + router.refresh(): a successful save persists
    // the edit and feeds the updated record back as the `contact` prop, exactly as
    // the real page does after revalidation.
    function EditHarness({
      onUpdate,
    }: {
      onUpdate?: (id: string, input: Record<string, unknown>) => void
    }) {
      const [contact, setContact] = useState<ContactRecord>(baseContact)
      const updateAction = vi.fn(
        async (id: string, input: Record<string, unknown>): Promise<ContactRecord> => {
          onUpdate?.(id, input)
          const next: ContactRecord = {
            ...contact,
            ...(input as Partial<ContactRecord>),
            socials: (input.socials as Record<string, string>) ?? contact.socials,
          }
          setContact(next)
          return next
        },
      )
      return (
        <ContactForm
          accounts={mockAccounts}
          contact={contact}
          updateAction={updateAction}
          createAction={vi.fn()}
          onSuccess={vi.fn()}
        />
      )
    }

    async function openDialog(user: ReturnType<typeof userEvent.setup>) {
      // The launcher keeps the "Create Contact" label even in edit mode; pick the
      // non-submit one (the submit button is labelled "Save Changes" when editing).
      await user.click(screen.getByRole("button", { name: /create contact/i }))
    }

    it("reopening after a save shows the saved value, not the pre-edit one", async () => {
      const user = userEvent.setup()
      render(<EditHarness />)

      // Open, change phone, save.
      await openDialog(user)
      const phone = (await screen.findByLabelText(/phone/i)) as HTMLInputElement
      expect(phone.value).toBe("+1-555-0000")
      await user.clear(phone)
      await user.type(phone, "+1-555-9999")
      await user.click(screen.getByRole("button", { name: /save changes/i }))

      // Dialog closes after a successful save.
      await waitFor(() =>
        expect(screen.queryByRole("button", { name: /save changes/i })).not.toBeInTheDocument(),
      )

      // Reopen — the dialog must reflect the persisted value, not the mount-time one.
      await openDialog(user)
      const reopenedPhone = (await screen.findByLabelText(/phone/i)) as HTMLInputElement
      expect(reopenedPhone.value).toBe("+1-555-9999")
    })

    it("does not silently revert a previously-saved field when a second field is edited", async () => {
      const updates: Array<Record<string, unknown>> = []
      const user = userEvent.setup()
      render(<EditHarness onUpdate={(_id, input) => updates.push(input)} />)

      // First save: change phone.
      await openDialog(user)
      await user.clear((await screen.findByLabelText(/phone/i)) as HTMLInputElement)
      await user.type(screen.getByLabelText(/phone/i), "+1-555-9999")
      await user.click(screen.getByRole("button", { name: /save changes/i }))
      await waitFor(() =>
        expect(screen.queryByRole("button", { name: /save changes/i })).not.toBeInTheDocument(),
      )

      // Second save: change title only — the phone must NOT revert to the old value.
      await openDialog(user)
      await user.clear((await screen.findByLabelText(/^title$/i)) as HTMLInputElement)
      await user.type(screen.getByLabelText(/^title$/i), "Founder")
      await user.click(screen.getByRole("button", { name: /save changes/i }))

      await waitFor(() => expect(updates).toHaveLength(2))
      // The second submission carries the already-saved phone, proving no revert.
      expect(updates[1]).toMatchObject({ phone: "+1-555-9999", title: "Founder" })
    })

    it("reopening after Cancel shows persisted values, not abandoned edits", async () => {
      const user = userEvent.setup()
      render(<EditHarness />)

      await openDialog(user)
      const title = (await screen.findByLabelText(/^title$/i)) as HTMLInputElement
      await user.clear(title)
      await user.type(title, "Abandoned Title")
      await user.click(screen.getByRole("button", { name: /cancel/i }))

      await waitFor(() =>
        expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument(),
      )

      await openDialog(user)
      const reopenedTitle = (await screen.findByLabelText(/^title$/i)) as HTMLInputElement
      expect(reopenedTitle.value).toBe("CEO")
    })
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
