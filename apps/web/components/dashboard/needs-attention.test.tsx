/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { NeedsAttention } from "./needs-attention"
import type { NeedsAttentionBucketView } from "./needs-attention"

vi.mock("server-only", () => ({}))

// The Reconnect CTA is a client component with its own router/action deps and
// coverage in reconnect-button.test.tsx; stub it so this suite stays focused on
// NeedsAttention's own rendering.
vi.mock("@/components/dashboard/reconnect-button", () => ({
  ReconnectButton: ({ dealName }: { dealName: string }) => (
    <button type="button">Reconnect {dealName}</button>
  ),
}))

const empty: NeedsAttentionBucketView = { items: [], count: 0 }

describe("NeedsAttention", () => {
  it("renders the all-caught-up empty state when total is 0", () => {
    render(<NeedsAttention stale={empty} overdue={empty} approvals={empty} total={0} />)
    expect(screen.getByText("You're all caught up")).toBeInTheDocument()
    expect(screen.queryByText("Overdue")).not.toBeInTheDocument()
  })

  it("renders each populated bucket with its rows, reasons, and counts", () => {
    const overdue: NeedsAttentionBucketView = {
      count: 1,
      items: [{ id: "o1", name: "Acme Expansion", stage: "negotiate", stageLabel: "Negotiate", reason: "3d overdue" }],
    }
    const stale: NeedsAttentionBucketView = {
      count: 1,
      items: [{ id: "o2", name: "Globex Renewal", stage: "qualify", stageLabel: "Qualify", reason: "12d no activity" }],
    }
    const approvals: NeedsAttentionBucketView = {
      count: 1,
      items: [{ id: "o3", name: "Initech Deal", stage: "propose", stageLabel: "Propose", reason: "awaiting your approval" }],
    }

    render(<NeedsAttention stale={stale} overdue={overdue} approvals={approvals} total={3} />)

    expect(screen.getByText("Overdue")).toBeInTheDocument()
    expect(screen.getByText("Needs a touch")).toBeInTheDocument()
    expect(screen.getByText("Approvals awaiting me")).toBeInTheDocument()

    expect(screen.getByText("Acme Expansion")).toBeInTheDocument()
    expect(screen.getByText("3d overdue")).toBeInTheDocument()
    expect(screen.getByText("12d no activity")).toBeInTheDocument()
    expect(screen.getByText("awaiting your approval")).toBeInTheDocument()

    // Rows link to the opportunity detail page.
    const link = screen.getByText("Initech Deal").closest("a")
    expect(link).toHaveAttribute("href", "/opportunities/o3")

    expect(screen.queryByText("You're all caught up")).not.toBeInTheDocument()
  })

  it("shows a '+N more' affordance when a bucket has more than the shown rows", () => {
    const overdue: NeedsAttentionBucketView = {
      count: 8,
      items: Array.from({ length: 5 }, (_, i) => ({
        id: `o${i}`, name: `Deal ${i}`, stage: "qualify" as const, stageLabel: "Qualify", reason: "5d overdue",
      })),
    }
    render(<NeedsAttention stale={empty} overdue={overdue} approvals={empty} total={8} />)
    expect(screen.getByText("+3 more")).toBeInTheDocument()
  })
})
