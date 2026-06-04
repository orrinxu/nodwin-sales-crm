import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { ActivitiesView } from "./activities-view"
import type { ActivityWithRelations } from "@/lib/data/activities"
import React from "react"

vi.mock("server-only", () => ({}))

const mockOnValueChange = vi.fn()

vi.mock("@/components/ui/tabs", () => {
  function TabsImpl({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode
    value?: string
    defaultValue?: string
    onValueChange?: (value: string) => void
  }) {
    const ctx = React.useRef({ value, onValueChange })
    ctx.current = { value, onValueChange }
    return (
      <TabsContext.Provider value={ctx}>
        <div data-testid="tabs" data-value={value}>
          {children}
        </div>
      </TabsContext.Provider>
    )
  }
  function TabsList({ children }: { children: React.ReactNode }) {
    return (
      <div role="tablist" data-testid="tabs-list">
        {children}
      </div>
    )
  }
  function TabsTab({
    children,
    value: tabValue,
    className,
  }: {
    children: React.ReactNode
    value: string
    className?: string
  }) {
    const ctx = React.useContext(TabsContext)
    const active = ctx?.current?.value === tabValue
    return (
      <button
        role="tab"
        data-value={tabValue}
        data-state={active ? "active" : "inactive"}
        className={className}
        type="button"
        onClick={() => {
          ctx?.current?.onValueChange?.(tabValue)
          mockOnValueChange(tabValue)
        }}
      >
        {children}
      </button>
    )
  }
  return { Tabs: TabsImpl, TabsList, TabsTab }
})

const TabsContext = React.createContext<{
  current: {
    value?: string
    onValueChange?: (value: string) => void
  }
} | null>(null)

const baseActivity: ActivityWithRelations = {
  id: "act-1",
  opportunityId: "opp-1",
  accountId: "acct-1",
  userId: "user-1",
  userName: "Alice",
  type: "note",
  externalThreadId: null,
  subject: null,
  body: null,
  metadata: {},
  createdAt: "2026-05-07T10:00:00Z",
  updatedAt: "2026-05-07T10:00:00Z",
  opportunityName: "Acme Deal",
  accountName: "Acme Corp",
}

function makeActivity(
  overrides: Partial<ActivityWithRelations> = {},
): ActivityWithRelations {
  return { ...baseActivity, ...overrides }
}

function renderView(activities: ActivityWithRelations[]) {
  return render(<ActivitiesView activities={activities} />)
}

describe("ActivitiesView", () => {
  describe("heading", () => {
    it("renders the page heading", () => {
      renderView([])
      expect(
        screen.getByRole("heading", { name: "Activities" }),
      ).toBeInTheDocument()
    })

    it("renders the subtitle", () => {
      renderView([])
      expect(
        screen.getByText(
          "Timeline of all activity across opportunities and contacts.",
        ),
      ).toBeInTheDocument()
    })
  })

  describe("empty state", () => {
    it("shows empty message when no activities", () => {
      renderView([])
      expect(
        screen.getByText("No activities match this filter."),
      ).toBeInTheDocument()
    })

    it("shows empty message when filter has no matches", async () => {
      const user = userEvent.setup()
      renderView([makeActivity({ type: "note" })])
      await user.click(screen.getByRole("tab", { name: /calls/i }))
      expect(
        screen.getByText("No activities match this filter."),
      ).toBeInTheDocument()
    })
  })

  describe("filter tabs", () => {
    it("renders all filter tabs", () => {
      renderView([])
      expect(screen.getByRole("tab", { name: /^all$/i })).toBeInTheDocument()
      expect(screen.getByRole("tab", { name: /^calls$/i })).toBeInTheDocument()
      expect(
        screen.getByRole("tab", { name: /^emails$/i }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole("tab", { name: /^meetings$/i }),
      ).toBeInTheDocument()
      expect(screen.getByRole("tab", { name: /^tasks$/i })).toBeInTheDocument()
      expect(screen.getByRole("tab", { name: /^notes$/i })).toBeInTheDocument()
    })

    it('shows all activities when "All" is selected', () => {
      renderView([
        makeActivity({ id: "1", type: "note" }),
        makeActivity({ id: "2", type: "call" }),
        makeActivity({ id: "3", type: "email_inbound" }),
      ])
      const tabs = screen.getByRole("tablist")
      expect(
        within(tabs).getByRole("tab", { name: /^all$/i }),
      ).toHaveAttribute("data-state", "active")
      expect(screen.getByText("Note")).toBeInTheDocument()
      expect(screen.getByText("Call")).toBeInTheDocument()
      expect(screen.getByText("Inbound Email")).toBeInTheDocument()
    })

    it("filters to only calls", async () => {
      const user = userEvent.setup()
      renderView([
        makeActivity({ id: "1", type: "note" }),
        makeActivity({ id: "2", type: "call" }),
      ])
      await user.click(screen.getByRole("tab", { name: /calls/i }))
      expect(screen.getByText("Call")).toBeInTheDocument()
      expect(screen.queryByText("Note")).not.toBeInTheDocument()
    })

    it("filters to both inbound and outbound emails under emails tab", async () => {
      const user = userEvent.setup()
      renderView([
        makeActivity({ id: "1", type: "email_inbound" }),
        makeActivity({ id: "2", type: "email_outbound" }),
        makeActivity({ id: "3", type: "call" }),
      ])
      await user.click(screen.getByRole("tab", { name: /emails/i }))
      expect(screen.getByText("Inbound Email")).toBeInTheDocument()
      expect(screen.getByText("Outbound Email")).toBeInTheDocument()
      expect(screen.queryByText("Call")).not.toBeInTheDocument()
    })

    it("filters to only meetings", async () => {
      const user = userEvent.setup()
      renderView([
        makeActivity({ id: "1", type: "meeting" }),
        makeActivity({ id: "2", type: "call" }),
      ])
      await user.click(screen.getByRole("tab", { name: /meetings/i }))
      expect(screen.getByText("Meeting")).toBeInTheDocument()
      expect(screen.queryByText("Call")).not.toBeInTheDocument()
    })

    it("filters to only tasks", async () => {
      const user = userEvent.setup()
      renderView([
        makeActivity({ id: "1", type: "task" }),
        makeActivity({ id: "2", type: "note" }),
      ])
      await user.click(screen.getByRole("tab", { name: /tasks/i }))
      expect(screen.getByText("Task")).toBeInTheDocument()
      expect(screen.queryByText("Note")).not.toBeInTheDocument()
    })

    it("filters to only notes", async () => {
      const user = userEvent.setup()
      renderView([
        makeActivity({ id: "1", type: "note" }),
        makeActivity({ id: "2", type: "call" }),
      ])
      await user.click(screen.getByRole("tab", { name: /notes/i }))
      expect(screen.getByText("Note")).toBeInTheDocument()
      expect(screen.queryByText("Call")).not.toBeInTheDocument()
    })
  })

  describe("activity row rendering", () => {
    it("shows subject when provided", () => {
      renderView([makeActivity({ type: "call", subject: "Intro call" })])
      expect(screen.getByText("Intro call")).toBeInTheDocument()
    })

    it("shows body when provided", () => {
      renderView([makeActivity({ body: "Discussed pricing" })])
      expect(screen.getByText("Discussed pricing")).toBeInTheDocument()
    })

    it("shows user name", () => {
      renderView([makeActivity({ userName: "Bob" })])
      expect(screen.getByText("Bob")).toBeInTheDocument()
    })

    it("shows Unknown when userName is null", () => {
      renderView([makeActivity({ userName: null })])
      expect(screen.getByText("Unknown")).toBeInTheDocument()
    })

    it("shows call duration when metadata has duration_minutes", () => {
      renderView([
        makeActivity({
          type: "call",
          metadata: { duration_minutes: 15 },
        }),
      ])
      expect(screen.getByText("15 min")).toBeInTheDocument()
    })

    it("shows opportunity badge when opportunityName is present", () => {
      renderView([makeActivity({ opportunityName: "Big Deal" })])
      expect(screen.getByText("Big Deal")).toBeInTheDocument()
    })

    it("shows account avatar and name when accountName is present", () => {
      renderView([makeActivity({ accountName: "Acme Corp" })])
      expect(screen.getAllByText("Acme Corp").length).toBeGreaterThan(0)
    })

    it("omits opportunity badge when opportunityName is null", () => {
      renderView([makeActivity({ opportunityName: null, accountName: null })])
      const buildingIcon = document.querySelector(
        ".lucide-building2",
      ) as HTMLElement | null
      expect(buildingIcon).toBeNull()
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
      renderView([makeActivity({ createdAt: "2026-05-07T11:59:30Z" })])
      expect(screen.getByText("just now")).toBeInTheDocument()
    })

    it('shows "Xm ago" for activity created minutes ago', () => {
      renderView([makeActivity({ createdAt: "2026-05-07T11:45:00Z" })])
      expect(screen.getByText("15m ago")).toBeInTheDocument()
    })

    it('shows "Xh ago" for activity created hours ago', () => {
      renderView([makeActivity({ createdAt: "2026-05-07T06:00:00Z" })])
      expect(screen.getByText("6h ago")).toBeInTheDocument()
    })

    it('shows "Xd ago" for activity created days ago', () => {
      renderView([makeActivity({ createdAt: "2026-05-05T12:00:00Z" })])
      expect(screen.getByText("2d ago")).toBeInTheDocument()
    })

    it("shows formatted date for activity older than 7 days", () => {
      renderView([makeActivity({ createdAt: "2026-04-28T12:00:00Z" })])
      expect(screen.getByText("Apr 28, 2026")).toBeInTheDocument()
    })
  })
})
