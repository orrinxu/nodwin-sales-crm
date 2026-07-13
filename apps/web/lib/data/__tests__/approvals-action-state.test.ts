import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const mockFrom = vi.fn()
const mockRpc = vi.fn()
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom, rpc: mockRpc })),
}))

// Chainable + thenable resolving to { data, error } regardless of the terminal
// builder method — mirrors approvals-notify.test.ts.
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

const ctx = (role: string, id = "u-1") => ({
  user: { id, email: "x@nodwin.com", role },
  source: "web" as const,
})

const ROLE_STEP = [
  { id: "step-1", approver_role: "sales_manager", approver_user_id: null, approver_user_ids: null },
]

describe("getApprovalActionState — role-step entity firewall (ORR-695)", () => {
  beforeEach(() => vi.clearAllMocks())

  function wire(opts: {
    businessEntityId: string | null
    step?: unknown[]
    userPrimaryEntityId?: string | null
  }) {
    mockFrom.mockImplementation((table: string) => {
      if (table === "approval_instances")
        return tableResult({ id: "inst-1", status: "pending", business_entity_id: opts.businessEntityId })
      if (table === "approval_steps") return tableResult(opts.step ?? ROLE_STEP)
      if (table === "users") return tableResult({ primary_entity_id: opts.userPrimaryEntityId ?? null })
      return tableResult(null)
    })
  }

  it("grants a role holder in the SAME entity", async () => {
    wire({ businessEntityId: "e-1", userPrimaryEntityId: "e-1" })
    const { getApprovalActionState } = await import("../approvals")
    const result = await getApprovalActionState(ctx("sales_manager"), "opp-1")
    expect(result.actionableStepId).toBe("step-1")
  })

  it("denies a role holder in a DIFFERENT entity", async () => {
    wire({ businessEntityId: "e-1", userPrimaryEntityId: "e-2" })
    const { getApprovalActionState } = await import("../approvals")
    const result = await getApprovalActionState(ctx("sales_manager"), "opp-1")
    expect(result.actionableStepId).toBeNull()
  })

  it("fails closed when the instance has no business entity", async () => {
    wire({ businessEntityId: null, userPrimaryEntityId: "e-1" })
    const { getApprovalActionState } = await import("../approvals")
    const result = await getApprovalActionState(ctx("sales_manager"), "opp-1")
    expect(result.actionableStepId).toBeNull()
  })

  it("grants a NAMED approver regardless of entity", async () => {
    wire({
      businessEntityId: "e-1",
      userPrimaryEntityId: "e-2",
      step: [{ id: "step-1", approver_role: null, approver_user_id: "u-1", approver_user_ids: null }],
    })
    const { getApprovalActionState } = await import("../approvals")
    const result = await getApprovalActionState(ctx("sales_rep"), "opp-1")
    expect(result.actionableStepId).toBe("step-1")
  })

  it("grants admin regardless of entity", async () => {
    wire({ businessEntityId: "e-1", userPrimaryEntityId: "e-2" })
    const { getApprovalActionState } = await import("../approvals")
    const result = await getApprovalActionState(ctx("admin"), "opp-1")
    expect(result.actionableStepId).toBe("step-1")
  })
})
