import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))

describe("opportunityCreateSchema — conditional validation", () => {
  let opportunityCreateSchema: typeof import("../opportunities").opportunityCreateSchema

  beforeAll(async () => {
    const mod = await import("../opportunities")
    opportunityCreateSchema = mod.opportunityCreateSchema
  })

  it("rejects when recurring=true without recurringSplitKind", () => {
    const result = opportunityCreateSchema.safeParse({
      name: "Test Deal",
      accountId: "acct-1",
      stage: "propose",
      salesUnitId: "bu-1",
      recurring: true,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === "recurringSplitKind")
      expect(issue).toBeDefined()
      expect(issue?.message).toContain("Recurring split kind is required")
    }
  })

  it("accepts when recurring=true with recurringSplitKind", () => {
    const result = opportunityCreateSchema.safeParse({
      name: "Test Deal",
      accountId: "acct-1",
      stage: "propose",
      salesUnitId: "bu-1",
      recurring: true,
      recurringSplitKind: "flat",
    })
    expect(result.success).toBe(true)
  })

  it("accepts when recurring=false without recurringSplitKind", () => {
    const result = opportunityCreateSchema.safeParse({
      name: "Test Deal",
      accountId: "acct-1",
      stage: "propose",
      salesUnitId: "bu-1",
      recurring: false,
    })
    expect(result.success).toBe(true)
  })

  it("rejects when stage=closed_lost without lossReason", () => {
    const result = opportunityCreateSchema.safeParse({
      name: "Lost Deal",
      accountId: "acct-1",
      stage: "closed_lost",
      salesUnitId: "bu-1",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === "lossReason")
      expect(issue).toBeDefined()
      expect(issue?.message).toContain("Loss reason is required")
    }
  })

  it("accepts when stage=closed_lost with lossReason", () => {
    const result = opportunityCreateSchema.safeParse({
      name: "Lost Deal",
      accountId: "acct-1",
      stage: "closed_lost",
      salesUnitId: "bu-1",
      lossReason: "Budget cut",
    })
    expect(result.success).toBe(true)
  })

  it("accepts other stages without lossReason", () => {
    const result = opportunityCreateSchema.safeParse({
      name: "Proposal Deal",
      accountId: "acct-1",
      stage: "negotiate",
      salesUnitId: "bu-1",
    })
    expect(result.success).toBe(true)
  })
})

describe("opportunityUpdateSchema — conditional validation on partial updates", () => {
  let opportunityUpdateSchema: typeof import("../opportunities").opportunityUpdateSchema

  beforeAll(async () => {
    const mod = await import("../opportunities")
    opportunityUpdateSchema = mod.opportunityUpdateSchema
  })

  it("rejects when recurring=true without recurringSplitKind in update", () => {
    const result = opportunityUpdateSchema.safeParse({
      recurring: true,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === "recurringSplitKind")
      expect(issue).toBeDefined()
    }
  })

  it("accepts when recurring=true with recurringSplitKind in update", () => {
    const result = opportunityUpdateSchema.safeParse({
      recurring: true,
      recurringSplitKind: "custom",
    })
    expect(result.success).toBe(true)
  })

  it("rejects when stage=closed_lost without lossReason in update", () => {
    const result = opportunityUpdateSchema.safeParse({
      stage: "closed_lost",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === "lossReason")
      expect(issue).toBeDefined()
    }
  })

  it("accepts when stage=closed_lost with lossReason in update", () => {
    const result = opportunityUpdateSchema.safeParse({
      stage: "closed_lost",
      lossReason: "Competitor undercut",
    })
    expect(result.success).toBe(true)
  })

  it("accepts partial update without triggering conditional rules", () => {
    const result = opportunityUpdateSchema.safeParse({
      name: "Renamed Deal",
      probabilityPct: 50,
    })
    expect(result.success).toBe(true)
  })
})
