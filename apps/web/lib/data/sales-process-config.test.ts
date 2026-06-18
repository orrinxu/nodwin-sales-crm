import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
    })),
  })),
}))

import {
  pipelineStageCreateSchema,
  pipelineStageUpdateSchema,
  lossReasonCreateSchema,
  projectTypeCreateSchema,
  revenueCategoryCreateSchema,
  stageGateRuleCreateSchema,
} from "./sales-process-config"

describe("pipelineStageCreateSchema", () => {
  it("accepts valid input", () => {
    const result = pipelineStageCreateSchema.safeParse({
      key: "verbal_agreement",
      label: "Verbal Agreement",
      winProbability: 80,
      isWon: false,
      isLost: false,
      sortOrder: 4,
    })
    expect(result.success).toBe(true)
  })

  it("rejects invalid key format", () => {
    const result = pipelineStageCreateSchema.safeParse({
      key: "Verbal Agreement",
      label: "Verbal Agreement",
    })
    expect(result.success).toBe(false)
  })

  it("rejects win probability > 100", () => {
    const result = pipelineStageCreateSchema.safeParse({
      key: "test",
      label: "Test",
      winProbability: 150,
    })
    expect(result.success).toBe(false)
  })
})

describe("pipelineStageUpdateSchema", () => {
  it("accepts partial update", () => {
    const result = pipelineStageUpdateSchema.safeParse({
      id: "aaaaaaaa-1111-1111-1111-111111111111",
      label: "Updated Label",
    })
    expect(result.success).toBe(true)
  })
})

describe("lossReasonCreateSchema", () => {
  it("accepts valid input", () => {
    const result = lossReasonCreateSchema.safeParse({
      label: "Budget constraints",
      sortOrder: 0,
    })
    expect(result.success).toBe(true)
  })
})

describe("projectTypeCreateSchema", () => {
  it("accepts valid input", () => {
    const result = projectTypeCreateSchema.safeParse({
      key: "white_label",
      label: "White Label",
      sortOrder: 1,
    })
    expect(result.success).toBe(true)
  })
})

describe("revenueCategoryCreateSchema", () => {
  it("accepts valid input", () => {
    const result = revenueCategoryCreateSchema.safeParse({
      key: "live",
      label: "Live",
      sortOrder: 0,
    })
    expect(result.success).toBe(true)
  })
})

describe("stageGateRuleCreateSchema", () => {
  it("accepts valid input", () => {
    const result = stageGateRuleCreateSchema.safeParse({
      stageKey: "verbal_agreement",
      entityType: "opportunity",
      fieldKey: "execution_date",
      required: true,
    })
    expect(result.success).toBe(true)
  })

  it("rejects invalid entity type", () => {
    const result = stageGateRuleCreateSchema.safeParse({
      stageKey: "verbal_agreement",
      entityType: "invalid",
      fieldKey: "execution_date",
    })
    expect(result.success).toBe(false)
  })
})
