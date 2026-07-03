import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const mockNotify = vi.fn()
vi.mock("@/lib/notifications/triggers", () => ({ notifyApprovalRequested: mockNotify }))

const mockFrom = vi.fn()
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}))

// A chainable + thenable that resolves to { data, error } regardless of which
// builder method the code ends the chain on (maybeSingle / order / etc.).
function tableResult(data: unknown) {
  const obj: Record<string, unknown> = {}
  const self = () => obj
  obj.then = (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data, error: null })
  obj.select = self
  obj.eq = self
  obj.order = self
  obj.limit = self
  obj.maybeSingle = self
  return obj
}

describe("notifyCurrentApprover", () => {
  beforeEach(() => vi.clearAllMocks())

  it("notifies the named approver of the current pending step", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "approval_instances") return tableResult({ id: "inst-1", business_entity_id: "e-1", status: "pending" })
      if (table === "approval_steps") return tableResult([
        { step_order: 1, approver_user_id: "u-1", approver_role: null, status: "pending" },
        { step_order: 2, approver_user_id: "u-2", approver_role: null, status: "pending" },
      ])
      if (table === "opportunities") return tableResult({ name: "Big Deal" })
      return tableResult(null)
    })

    const { notifyCurrentApprover } = await import("../approvals")
    await notifyCurrentApprover("opp-1")

    expect(mockNotify).toHaveBeenCalledTimes(1)
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ approverUserId: "u-1", opportunityName: "Big Deal", stepNumber: 1, totalSteps: 2 }),
    )
  })

  it("notifies every entity role-holder for a role step", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "approval_instances") return tableResult({ id: "inst-1", business_entity_id: "e-1", status: "pending" })
      if (table === "approval_steps") return tableResult([
        { step_order: 1, approver_user_id: null, approver_role: "sales_manager", status: "pending" },
      ])
      if (table === "opportunities") return tableResult({ name: "Deal" })
      if (table === "users") return tableResult([{ id: "m-1" }, { id: "m-2" }])
      return tableResult(null)
    })

    const { notifyCurrentApprover } = await import("../approvals")
    await notifyCurrentApprover("opp-1")

    expect(mockNotify).toHaveBeenCalledTimes(2)
  })

  it("does nothing when the approval is not pending", async () => {
    mockFrom.mockImplementation((table: string) =>
      table === "approval_instances"
        ? tableResult({ id: "i", business_entity_id: null, status: "approved" })
        : tableResult(null),
    )

    const { notifyCurrentApprover } = await import("../approvals")
    await notifyCurrentApprover("opp-1")
    expect(mockNotify).not.toHaveBeenCalled()
  })
})
