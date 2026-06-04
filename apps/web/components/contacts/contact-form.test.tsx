import { describe, it, expect, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ContactForm } from "./contact-form"
import type { AccountOption } from "@/lib/data/contacts"

vi.mock("server-only", () => ({}))

const mockAccounts: AccountOption[] = [
  { id: "acct-1", name: "Acme Corp" },
  { id: "acct-2", name: "Globex Inc" },
]

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Create Contact/ }))
  await screen.findByRole("dialog")
}

function submitForm() {
  const form = screen
    .getByRole("dialog")
    .querySelector("form") as HTMLFormElement
  fireEvent.submit(form)
}

async function clickFormSubmit(
  user: ReturnType<typeof userEvent.setup>,
) {
  const btn = screen
    .getByRole("dialog")
    .querySelector('button[type="submit"]') as HTMLButtonElement
  await user.click(btn)
}

function queryInDialog(selector: string) {
  return screen.getByRole("dialog").querySelector(selector) as HTMLElement
}

describe("ContactForm", () => {
  describe("submission", () => {
    it("calls createAction with form data and calls onSuccess", async () => {
      const createAction = vi.fn().mockResolvedValue({ id: "new-1" })
      const onSuccess = vi.fn()
      const user = userEvent.setup()

      render(
        <ContactForm
          accounts={mockAccounts}
          createAction={createAction}
          onSuccess={onSuccess}
        />,
      )

      await openSheet(user)

      await user.type(queryInDialog("#fullName"), "John Smith")
      await user.type(queryInDialog("#title"), "CTO")
      await user.type(queryInDialog("#email"), "john@example.com")
      await user.type(queryInDialog("input[type='tel']"), "+1-555-1234")
      await user.selectOptions(queryInDialog("#primaryAccountId"), "acct-1")
      await user.type(queryInDialog("#notes"), "Met at conference")

      await user.selectOptions(screen.getByDisplayValue("Select"), "linkedin")
      await user.type(
        screen.getAllByPlaceholderText("Profile URL")[0],
        "https://linkedin.com/in/john",
      )

      await clickFormSubmit(user)

      await waitFor(() => {
        expect(createAction).toHaveBeenCalledWith(
          expect.objectContaining({
            fullName: "John Smith",
            title: "CTO",
            email: "john@example.com",
            phone: "+1-555-1234",
            primaryAccountId: "acct-1",
            notes: "Met at conference",
          }),
        )
      })
      expect(onSuccess).toHaveBeenCalled()
    })

    it("calls updateAction with edited fields in edit mode", async () => {
      const updateAction = vi.fn().mockResolvedValue({ id: "contact-1" })
      const onSuccess = vi.fn()
      const user = userEvent.setup()

      render(
        <ContactForm
          accounts={mockAccounts}
          contact={{
            id: "contact-1",
            fullName: "John Doe",
            primaryAccountId: "acct-1",
            title: "CEO",
            email: "john@acme.com",
            phone: "+1-555-0000",
            socials: { linkedin: "https://linkedin.com/in/john" },
            notes: null,
            ownerUserId: null,
            status: "active",
            customData: {},
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-15T00:00:00Z",
          }}
          createAction={vi.fn()}
          updateAction={updateAction}
          onSuccess={onSuccess}
        />,
      )

      await openSheet(user)

      const dialog = screen.getByRole("dialog", { name: /Edit Contact/ })
      expect(dialog).toBeInTheDocument()

      await user.clear(dialog.querySelector("#email")!)
      await user.type(dialog.querySelector("#email")!, "john.doe@acme.com")

      const saveBtn = dialog.querySelector(
        'button[type="submit"]',
      ) as HTMLButtonElement
      await user.click(saveBtn)

      await waitFor(() => {
        expect(updateAction).toHaveBeenCalledWith(
          "contact-1",
          expect.objectContaining({ email: "john.doe@acme.com" }),
        )
      })
      expect(onSuccess).toHaveBeenCalled()
    })
  })

  describe("validation", () => {
    it("shows required error when full name is empty", async () => {
      const createAction = vi.fn()
      const user = userEvent.setup()

      render(
        <ContactForm
          accounts={mockAccounts}
          createAction={createAction}
          onSuccess={vi.fn()}
        />,
      )

      await openSheet(user)

      submitForm()

      expect(
        await screen.findByText("Full name is required"),
      ).toBeInTheDocument()
      expect(createAction).not.toHaveBeenCalled()
    })

    it("shows invalid email error for bad email format", async () => {
      const createAction = vi.fn()
      const user = userEvent.setup()

      render(
        <ContactForm
          accounts={mockAccounts}
          createAction={createAction}
          onSuccess={vi.fn()}
        />,
      )

      await openSheet(user)

      await user.type(queryInDialog("#fullName"), "Jane")
      await user.type(queryInDialog("#email"), "not-an-email")

      submitForm()

      expect(
        await screen.findByText("Must be a valid email"),
      ).toBeInTheDocument()
      expect(createAction).not.toHaveBeenCalled()
    })
  })

  describe("error handling", () => {
    it("displays error message when createAction throws", async () => {
      const createAction = vi
        .fn()
        .mockRejectedValue(new Error("Network failure"))
      const user = userEvent.setup()

      render(
        <ContactForm
          accounts={mockAccounts}
          createAction={createAction}
          onSuccess={vi.fn()}
        />,
      )

      await openSheet(user)

      await user.type(queryInDialog("#fullName"), "Jane")
      await user.selectOptions(screen.getByDisplayValue("Select"), "linkedin")
      await user.type(
        screen.getAllByPlaceholderText("Profile URL")[0],
        "https://linkedin.com/in/jane",
      )

      await clickFormSubmit(user)

      expect(
        await screen.findByText("Network failure"),
      ).toBeInTheDocument()
    })

    it("shows generic message for non-Error rejections", async () => {
      const createAction = vi.fn().mockRejectedValue("something broke")
      const user = userEvent.setup()

      render(
        <ContactForm
          accounts={mockAccounts}
          createAction={createAction}
          onSuccess={vi.fn()}
        />,
      )

      await openSheet(user)

      await user.type(queryInDialog("#fullName"), "Jane")
      await user.selectOptions(screen.getByDisplayValue("Select"), "linkedin")
      await user.type(
        screen.getAllByPlaceholderText("Profile URL")[0],
        "https://linkedin.com/in/jane",
      )

      await clickFormSubmit(user)

      expect(
        await screen.findByText("An unexpected error occurred"),
      ).toBeInTheDocument()
    })
  })

  describe("social profiles", () => {
    it("adds a new social profile row when Add is clicked", async () => {
      const user = userEvent.setup()

      render(
        <ContactForm
          accounts={mockAccounts}
          createAction={vi.fn().mockResolvedValue({ id: "new-1" })}
          onSuccess={vi.fn()}
        />,
      )

      await openSheet(user)

      expect(screen.getAllByPlaceholderText("Profile URL")).toHaveLength(1)

      await user.click(screen.getByRole("button", { name: /^Add$/ }))

      expect(screen.getAllByPlaceholderText("Profile URL")).toHaveLength(2)
    })

    it("removes a social profile row by clicking X button", async () => {
      const user = userEvent.setup()

      render(
        <ContactForm
          accounts={mockAccounts}
          createAction={vi.fn().mockResolvedValue({ id: "new-1" })}
          onSuccess={vi.fn()}
        />,
      )

      await openSheet(user)

      await user.click(screen.getByRole("button", { name: /^Add$/ }))
      expect(screen.getAllByPlaceholderText("Profile URL")).toHaveLength(2)

      const xButtons = screen
        .getAllByRole("button", { name: "" })
        .filter((btn) => btn.querySelector(".lucide-x"))
      await user.click(xButtons[0])

      await waitFor(() => {
        expect(screen.getAllByPlaceholderText("Profile URL")).toHaveLength(1)
      })
    })
  })

  describe("account links", () => {
    it("adds and shows an account link badge", async () => {
      const user = userEvent.setup()

      render(
        <ContactForm
          accounts={mockAccounts}
          createAction={vi.fn().mockResolvedValue({ id: "new-1" })}
          onSuccess={vi.fn()}
        />,
      )

      await openSheet(user)

      await user.selectOptions(
        screen.getByDisplayValue("Add account link..."),
        "acct-2",
      )

      const badges = screen.getAllByText("Globex Inc")
      expect(badges.some((el) => el.tagName === "SPAN")).toBe(true)
    })

    it("removes an account link badge", async () => {
      const user = userEvent.setup()

      render(
        <ContactForm
          accounts={mockAccounts}
          createAction={vi.fn().mockResolvedValue({ id: "new-1" })}
          onSuccess={vi.fn()}
        />,
      )

      await openSheet(user)

      await user.selectOptions(
        screen.getByDisplayValue("Add account link..."),
        "acct-1",
      )

      const allAcme = screen.getAllByText("Acme Corp")
      const badge = allAcme.find((el) => el.tagName === "SPAN") as HTMLElement
      expect(badge).toBeTruthy()

      const removeBtn = badge.querySelector("button") as HTMLElement
      await user.click(removeBtn)

      const remaining = screen.queryAllByText("Acme Corp")
      expect(remaining.every((el) => el.tagName !== "SPAN")).toBe(true)
    })
  })
})
