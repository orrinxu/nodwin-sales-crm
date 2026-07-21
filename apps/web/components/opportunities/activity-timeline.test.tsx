import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { render, screen } from "@testing-library/react"
import { ActivityTimeline } from "./activity-timeline"
import type { ActivityRecord, ActivityType } from "@/lib/data/activities"

vi.mock("server-only", () => ({}))

const baseActivity: ActivityRecord = {
  id: "act-1",
  opportunityId: "opp-1",
  opportunityName: "Big Deal",
  accountId: "acct-1",
  accountName: "Acme Corp",
  contactId: null,
  contactName: null,
  userId: "user-1",
  userName: "Alice",
  type: "note",
  externalThreadId: null,
  subject: null,
  body: null,
  startsAt: null,
  endsAt: null,
  timeZone: null,
  allDay: false,
  externalEventId: null,
  externalMessageId: null,
  metadata: {},
  createdAt: "2026-05-07T10:00:00Z",
  updatedAt: "2026-05-07T10:00:00Z",
}

function makeActivity(
  overrides: Partial<ActivityRecord> = {},
): ActivityRecord {
  return { ...baseActivity, ...overrides }
}

describe("ActivityTimeline", () => {
  describe("empty state", () => {
    it("shows empty message when no activities", () => {
      render(<ActivityTimeline activities={[]} />)
      expect(
        screen.getByText("No activities yet. Log a note or call above."),
      ).toBeInTheDocument()
    })
  })

  describe("rendering", () => {
    it("renders a note activity with correct label", () => {
      render(<ActivityTimeline activities={[makeActivity({ type: "note" })]} />)
      expect(screen.getByText("Note")).toBeInTheDocument()
    })

    it("renders a call activity with correct label", () => {
      render(<ActivityTimeline activities={[makeActivity({ type: "call" })]} />)
      expect(screen.getByText("Call")).toBeInTheDocument()
    })

    it("renders an inbound email activity", () => {
      render(
        <ActivityTimeline
          activities={[makeActivity({ type: "email_inbound" })]}
        />,
      )
      expect(screen.getByText("Inbound Email")).toBeInTheDocument()
    })

    it("renders a meeting activity", () => {
      render(
        <ActivityTimeline activities={[makeActivity({ type: "meeting" })]} />,
      )
      expect(screen.getByText("Meeting")).toBeInTheDocument()
    })

    it("renders a task activity", () => {
      render(<ActivityTimeline activities={[makeActivity({ type: "task" })]} />)
      expect(screen.getByText("Task")).toBeInTheDocument()
    })

    it("shows subject when provided", () => {
      render(
        <ActivityTimeline
          activities={[makeActivity({ type: "call", subject: "Intro call" })]}
        />,
      )
      expect(screen.getByText("Intro call")).toBeInTheDocument()
    })

    it("shows body when provided", () => {
      render(
        <ActivityTimeline
          activities={[makeActivity({ body: "Discussed pricing" })]}
        />,
      )
      expect(screen.getByText("Discussed pricing")).toBeInTheDocument()
    })

    it("shows user name", () => {
      render(
        <ActivityTimeline
          activities={[makeActivity({ userName: "Bob" })]}
        />,
      )
      expect(screen.getByText("Bob")).toBeInTheDocument()
    })

    it("shows Unknown when userName is null", () => {
      render(
        <ActivityTimeline
          activities={[makeActivity({ userName: null })]}
        />,
      )
      expect(screen.getByText("Unknown")).toBeInTheDocument()
    })

    it("shows call duration when metadata has duration_minutes", () => {
      render(
        <ActivityTimeline
          activities={[
            makeActivity({
              type: "call",
              metadata: { duration_minutes: 15 },
            }),
          ]}
        />,
      )
      expect(screen.getByText("15 min")).toBeInTheDocument()
    })

    it("omits duration when not present in metadata", () => {
      render(
        <ActivityTimeline
          activities={[makeActivity({ type: "call", metadata: {} })]}
        />,
      )
      expect(screen.queryByText(/min/)).not.toBeInTheDocument()
    })

    it("does not show subject text when subject is null", () => {
      render(<ActivityTimeline activities={[makeActivity({ subject: null })]} />)
      expect(screen.queryByText("Intro call")).not.toBeInTheDocument()
    })

    it("renders multiple activities", () => {
      render(
        <ActivityTimeline
          activities={[
            makeActivity({ id: "act-1", type: "note", body: "First note" }),
            makeActivity({ id: "act-2", type: "call", subject: "Second call" }),
          ]}
        />,
      )
      expect(screen.getByText("First note")).toBeInTheDocument()
      expect(screen.getByText("Second call")).toBeInTheDocument()
    })
  })

  describe("meeting detail (ORR-828)", () => {
    it("shows the time range for a timed meeting", () => {
      render(
        <ActivityTimeline
          activities={[
            makeActivity({
              type: "meeting",
              startsAt: "2026-05-07T14:00:00Z",
              endsAt: "2026-05-07T15:00:00Z",
              timeZone: "UTC",
            }),
          ]}
        />,
      )
      expect(
        screen.getByText("May 7, 2026 · 2:00 PM – 3:00 PM"),
      ).toBeInTheDocument()
    })

    it("shows a date + All day for an all-day meeting", () => {
      render(
        <ActivityTimeline
          activities={[
            makeActivity({
              type: "meeting",
              startsAt: "2026-05-07T00:00:00Z",
              endsAt: "2026-05-08T00:00:00Z",
              timeZone: "UTC",
              allDay: true,
            }),
          ]}
        />,
      )
      expect(screen.getByText("May 7, 2026 · All day")).toBeInTheDocument()
    })

    it("shows location, attendees, and a Join link", () => {
      render(
        <ActivityTimeline
          activities={[
            makeActivity({
              type: "meeting",
              startsAt: "2026-05-07T14:00:00Z",
              endsAt: "2026-05-07T15:00:00Z",
              timeZone: "UTC",
              metadata: {
                location: "Room 4",
                hangoutLink: "https://meet.example.com/xyz",
                attendees: [
                  { displayName: "Alice" },
                  { email: "bob@example.com" },
                ],
              },
            }),
          ]}
        />,
      )
      expect(screen.getByText("Room 4")).toBeInTheDocument()
      expect(screen.getByText("Alice, bob@example.com")).toBeInTheDocument()
      const link = screen.getByRole("link", { name: /Join/ })
      expect(link).toHaveAttribute("href", "https://meet.example.com/xyz")
    })

    it("does not render meeting detail for a non-meeting activity", () => {
      render(
        <ActivityTimeline
          activities={[
            makeActivity({
              type: "call",
              startsAt: "2026-05-07T14:00:00Z",
              endsAt: "2026-05-07T15:00:00Z",
              timeZone: "UTC",
              metadata: { location: "Room 4" },
            }),
          ]}
        />,
      )
      expect(screen.queryByText("Room 4")).not.toBeInTheDocument()
      expect(
        screen.queryByText("May 7, 2026 · 2:00 PM – 3:00 PM"),
      ).not.toBeInTheDocument()
    })

    it("does not break (no Invalid Date) when a meeting has null times", () => {
      render(
        <ActivityTimeline
          activities={[makeActivity({ type: "meeting", startsAt: null })]}
        />,
      )
      expect(screen.getByText("Meeting")).toBeInTheDocument()
      expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument()
    })
  })

  describe("relative time formatting", () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date("2026-05-07T12:00:00Z"))
    })

    afterAll(() => {
      vi.useRealTimers()
    })

    it('shows "just now" for activity created less than 1 minute ago', () => {
      render(
        <ActivityTimeline
          activities={[makeActivity({ createdAt: "2026-05-07T11:59:30Z" })]}
        />,
      )
      expect(screen.getByText("just now")).toBeInTheDocument()
    })

    it('shows "Xm ago" for activity created minutes ago', () => {
      render(
        <ActivityTimeline
          activities={[makeActivity({ createdAt: "2026-05-07T11:45:00Z" })]}
        />,
      )
      expect(screen.getByText("15m ago")).toBeInTheDocument()
    })

    it('shows "Xh ago" for activity created hours ago', () => {
      render(
        <ActivityTimeline
          activities={[makeActivity({ createdAt: "2026-05-07T06:00:00Z" })]}
        />,
      )
      expect(screen.getByText("6h ago")).toBeInTheDocument()
    })

    it('shows "Xd ago" for activity created days ago', () => {
      render(
        <ActivityTimeline
          activities={[makeActivity({ createdAt: "2026-05-05T12:00:00Z" })]}
        />,
      )
      expect(screen.getByText("2d ago")).toBeInTheDocument()
    })

    it("shows formatted date for activity older than 7 days", () => {
      render(
        <ActivityTimeline
          activities={[makeActivity({ createdAt: "2026-04-28T12:00:00Z" })]}
        />,
      )
      expect(screen.getByText("Apr 28, 2026")).toBeInTheDocument()
    })
  })
})
