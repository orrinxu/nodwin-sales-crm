import { describe, it, expect, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ActivityComposer } from "./activity-composer"
import type { ActivityRecord } from "@/lib/data/activities"

vi.mock("server-only", () => ({}))

const mockResolved = {
  id: "act-1",
} as ActivityRecord

const mockCreateAction = vi.fn().mockResolvedValue(mockResolved)

const defaultProps = {
  opportunityId: "opp-1",
  accountId: "acct-1",
  createAction: mockCreateAction,
  onCreated: vi.fn(),
}

describe("ActivityComposer", () => {
  describe("smoke", () => {
    it("renders without throwing", () => {
      expect(() => <ActivityComposer {...defaultProps} />).not.toThrow()
    })

    it("renders with accountId null", () => {
      expect(() => (
        <ActivityComposer {...defaultProps} accountId={null} />
      )).not.toThrow()
    })

    it("renders both tab buttons", () => {
      render(<ActivityComposer {...defaultProps} />)
      expect(screen.getByRole("tab", { name: /note/i })).toBeInTheDocument()
      expect(screen.getByRole("tab", { name: /call/i })).toBeInTheDocument()
    })

    it("shows note form by default", () => {
      render(<ActivityComposer {...defaultProps} />)
      expect(screen.getByRole("textbox", { name: /note/i })).toBeInTheDocument()
    })
  })

  describe("NoteForm", () => {
    it("disables save button when body is empty", () => {
      render(<ActivityComposer {...defaultProps} />)
      expect(screen.getByRole("button", { name: /save note/i })).toBeDisabled()
    })

    it("enables save button when body has text", async () => {
      const user = userEvent.setup()
      render(<ActivityComposer {...defaultProps} />)
      const body = screen.getByRole("textbox", { name: /note/i })
      await user.type(body, "Met with client")
      expect(screen.getByRole("button", { name: /save note/i })).toBeEnabled()
    })

    it("calls createAction with correct data and clears form on save", async () => {
      const createAction = vi.fn().mockResolvedValue({
        id: "act-1",
      } as ActivityRecord)
      const onCreated = vi.fn()
      const user = userEvent.setup()

      render(
        <ActivityComposer
          {...defaultProps}
          createAction={createAction}
          onCreated={onCreated}
        />,
      )

      await user.type(screen.getByLabelText(/subject/i), "Quick sync")
      await user.type(screen.getByRole("textbox", { name: /note/i }), "Discussed timeline")
      await user.click(screen.getByRole("button", { name: /save note/i }))

      expect(createAction).toHaveBeenCalledWith("opp-1", {
        opportunityId: "opp-1",
        accountId: "acct-1",
        type: "note",
        subject: "Quick sync",
        body: "Discussed timeline",
        metadata: {},
      })
      expect(onCreated).toHaveBeenCalled()
      expect(screen.getByRole("textbox", { name: /note/i })).toHaveValue("")
    })

    it("clears only body and subject after save", async () => {
      const createAction = vi.fn().mockResolvedValue({
        id: "act-2",
      } as ActivityRecord)
      const user = userEvent.setup()

      render(
        <ActivityComposer {...defaultProps} createAction={createAction} />,
      )

      await user.type(screen.getByLabelText(/subject/i), "Follow-up")
      await user.type(screen.getByRole("textbox", { name: /note/i }), "Call back next week")
      await user.click(screen.getByRole("button", { name: /save note/i }))

      expect(screen.getByLabelText(/subject/i)).toHaveValue("")
      expect(screen.getByRole("textbox", { name: /note/i })).toHaveValue("")
    })

    it("saves note with empty subject", async () => {
      const createAction = vi.fn().mockResolvedValue({
        id: "act-3",
      } as ActivityRecord)
      const user = userEvent.setup()

      render(
        <ActivityComposer {...defaultProps} createAction={createAction} />,
      )

      await user.type(screen.getByRole("textbox", { name: /note/i }), "Just a quick note")
      await user.click(screen.getByRole("button", { name: /save note/i }))

      expect(createAction).toHaveBeenCalledWith("opp-1", {
        opportunityId: "opp-1",
        accountId: "acct-1",
        type: "note",
        subject: null,
        body: "Just a quick note",
        metadata: {},
      })
    })

    it("does not call createAction when body is only whitespace", async () => {
      const createAction = vi.fn()
      const user = userEvent.setup()

      render(
        <ActivityComposer {...defaultProps} createAction={createAction} />,
      )

      await user.type(screen.getByRole("textbox", { name: /note/i }), "   ")
      await user.click(screen.getByRole("button", { name: /save note/i }))

      expect(createAction).not.toHaveBeenCalled()
    })
  })

  describe("CallForm", () => {
    it("disables log call button when subject and notes are empty", async () => {
      const user = userEvent.setup()
      render(<ActivityComposer {...defaultProps} />)

      await user.click(screen.getByRole("tab", { name: /call/i }))

      expect(screen.getByRole("button", { name: /log call/i })).toBeDisabled()
    })

    it("enables log call button when subject is filled", async () => {
      const user = userEvent.setup()
      render(<ActivityComposer {...defaultProps} />)

      await user.click(screen.getByRole("tab", { name: /call/i }))
      await user.type(screen.getByPlaceholderText(/call subject/i), "Intro call")

      expect(screen.getByRole("button", { name: /log call/i })).toBeEnabled()
    })

    it("calls createAction with call data and clears form", async () => {
      const createAction = vi.fn().mockResolvedValue({
        id: "act-4",
      } as ActivityRecord)
      const onCreated = vi.fn()
      const user = userEvent.setup()

      render(
        <ActivityComposer
          {...defaultProps}
          createAction={createAction}
          onCreated={onCreated}
        />,
      )

      await user.click(screen.getByRole("tab", { name: /call/i }))
      await user.type(screen.getByPlaceholderText(/call subject/i), "Discovery call")
      await user.type(screen.getByLabelText(/duration/i), "30")
      await user.type(screen.getByLabelText(/notes/i), "Good conversation")
      await user.click(screen.getByRole("button", { name: /log call/i }))

      expect(createAction).toHaveBeenCalledWith("opp-1", {
        opportunityId: "opp-1",
        accountId: "acct-1",
        type: "call",
        subject: "Discovery call",
        body: "Good conversation",
        metadata: { duration_minutes: 30 },
      })
      expect(onCreated).toHaveBeenCalled()
      expect(screen.getByPlaceholderText(/call subject/i)).toHaveValue("")
      expect(screen.getByLabelText(/duration/i)).toHaveValue(null)
      expect(screen.getByLabelText(/notes/i)).toHaveValue("")
    })

    it("does not call createAction when subject and notes are only whitespace", async () => {
      const createAction = vi.fn()
      const user = userEvent.setup()

      render(
        <ActivityComposer {...defaultProps} createAction={createAction} />,
      )

      await user.click(screen.getByRole("tab", { name: /call/i }))
      await user.type(screen.getByPlaceholderText(/call subject/i), "   ")
      await user.click(screen.getByRole("button", { name: /log call/i }))

      expect(createAction).not.toHaveBeenCalled()
    })
  })
})
