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

describe("opportunityCreateSchema — serviceType validation", () => {
  let opportunityCreateSchema: typeof import("../opportunities").opportunityCreateSchema

  beforeAll(async () => {
    const mod = await import("../opportunities")
    opportunityCreateSchema = mod.opportunityCreateSchema
  })

  const validBase = {
    name: "Test Deal",
    accountId: "acct-1",
    stage: "propose" as const,
    salesUnitId: "bu-1",
  }

  it("accepts a valid array of service types", () => {
    const result = opportunityCreateSchema.safeParse({
      ...validBase,
      serviceType: ["brand_campaign_and_activation", "content_production"],
    })
    expect(result.success).toBe(true)
  })

  it("accepts a single-element valid service type array", () => {
    const result = opportunityCreateSchema.safeParse({
      ...validBase,
      serviceType: ["pr"],
    })
    expect(result.success).toBe(true)
  })

  it("rejects an array with invalid service type values", () => {
    const result = opportunityCreateSchema.safeParse({
      ...validBase,
      serviceType: ["invalid_type", "also_bad"],
    })
    expect(result.success).toBe(false)
  })

  it("rejects a string instead of an array", () => {
    const result = opportunityCreateSchema.safeParse({
      ...validBase,
      serviceType: "brand_campaign_and_activation",
    })
    expect(result.success).toBe(false)
  })

  it("accepts omitting serviceType (optional field)", () => {
    const result = opportunityCreateSchema.safeParse(validBase)
    expect(result.success).toBe(true)
  })
})

describe("opportunityCreateSchema — propertyType validation", () => {
  let opportunityCreateSchema: typeof import("../opportunities").opportunityCreateSchema

  beforeAll(async () => {
    const mod = await import("../opportunities")
    opportunityCreateSchema = mod.opportunityCreateSchema
  })

  const validBase = {
    name: "Test Deal",
    accountId: "acct-1",
    stage: "propose" as const,
    salesUnitId: "bu-1",
  }

  it("accepts a valid property type", () => {
    const result = opportunityCreateSchema.safeParse({
      ...validBase,
      propertyType: "conference",
    })
    expect(result.success).toBe(true)
  })

  it("rejects a value outside the PROPERTY_TYPES enum", () => {
    const result = opportunityCreateSchema.safeParse({
      ...validBase,
      propertyType: "not_a_real_property_type",
    })
    expect(result.success).toBe(false)
  })

  it("accepts omitting propertyType (optional field)", () => {
    const result = opportunityCreateSchema.safeParse(validBase)
    expect(result.success).toBe(true)
  })
})

describe("opportunityCreateSchema — barterValue preprocessing", () => {
  let opportunityCreateSchema: typeof import("../opportunities").opportunityCreateSchema

  beforeAll(async () => {
    const mod = await import("../opportunities")
    opportunityCreateSchema = mod.opportunityCreateSchema
  })

  const validBase = {
    name: "Test Deal",
    accountId: "acct-1",
    stage: "propose" as const,
    salesUnitId: "bu-1",
  }

  it("accepts a valid barter value string", () => {
    const result = opportunityCreateSchema.safeParse({
      ...validBase,
      barterValue: "1000.00",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.barterValue).toBe("1000.00")
    }
  })

  it("coerces empty string to undefined", () => {
    const result = opportunityCreateSchema.safeParse({
      ...validBase,
      barterValue: "",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.barterValue).toBeUndefined()
    }
  })

  it("coerces 0 to undefined", () => {
    const result = opportunityCreateSchema.safeParse({
      ...validBase,
      barterValue: 0,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.barterValue).toBeUndefined()
    }
  })

  it("coerces a number to string", () => {
    const result = opportunityCreateSchema.safeParse({
      ...validBase,
      barterValue: 500,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.barterValue).toBe("500")
    }
  })

  it("accepts omitting barterValue (optional field)", () => {
    const result = opportunityCreateSchema.safeParse(validBase)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.barterValue).toBeUndefined()
    }
  })
})

describe("opportunityCreateSchema — entitySalesId validation", () => {
  let opportunityCreateSchema: typeof import("../opportunities").opportunityCreateSchema

  beforeAll(async () => {
    const mod = await import("../opportunities")
    opportunityCreateSchema = mod.opportunityCreateSchema
  })

  const validBase = {
    name: "Test Deal",
    accountId: "acct-1",
    stage: "propose" as const,
    salesUnitId: "bu-1",
  }

  it("accepts a valid entitySalesId UUID string", () => {
    const result = opportunityCreateSchema.safeParse({
      ...validBase,
      entitySalesId: "550e8400-e29b-41d4-a716-446655440000",
    })
    expect(result.success).toBe(true)
  })

  it("accepts omitting entitySalesId (optional field)", () => {
    const result = opportunityCreateSchema.safeParse(validBase)
    expect(result.success).toBe(true)
  })
})
