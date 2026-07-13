import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  normalizeScheduledMonth,
  toWorkingCapitalInput,
  revenueScheduleToInflows,
  type CashflowMilestoneRecord,
} from "./cashflow-milestones"

const record = (
  overrides: Partial<CashflowMilestoneRecord> = {},
): CashflowMilestoneRecord => ({
  id: "11111111-1111-1111-1111-111111111111",
  opportunityId: "22222222-2222-2222-2222-222222222222",
  direction: "in",
  label: "Client payment",
  scheduledMonth: "2026-09-01",
  amount: "1000.0000",
  currency: "USD",
  sortOrder: 0,
  createdBy: "33333333-3333-3333-3333-333333333333",
  createdAt: "2026-07-11T00:00:00Z",
  updatedAt: "2026-07-11T00:00:00Z",
  ...overrides,
})

describe("normalizeScheduledMonth", () => {
  it("collapses a full date to the first of its month", () => {
    expect(normalizeScheduledMonth("2026-09-23")).toBe("2026-09-01")
  })

  it("accepts a bare YYYY-MM", () => {
    expect(normalizeScheduledMonth("2026-12")).toBe("2026-12-01")
  })

  it("rejects a malformed month", () => {
    expect(() => normalizeScheduledMonth("2026")).toThrow(/Invalid scheduled month/)
    expect(() => normalizeScheduledMonth("not-a-date")).toThrow(/Invalid scheduled month/)
  })
})

describe("toWorkingCapitalInput", () => {
  it("projects DB records onto the derivation input shape (drops id/label/sort)", () => {
    const out = toWorkingCapitalInput([
      record({ direction: "out", scheduledMonth: "2026-09-01", amount: "21950.0000" }),
      record({ direction: "in", scheduledMonth: "2026-12-01", amount: "34500.0000" }),
    ])
    expect(out).toEqual([
      { direction: "out", scheduledMonth: "2026-09-01", amount: "21950.0000", currency: "USD" },
      { direction: "in", scheduledMonth: "2026-12-01", amount: "34500.0000", currency: "USD" },
    ])
  })

  it("maps an empty set to an empty array", () => {
    expect(toWorkingCapitalInput([])).toEqual([])
  })
})

describe("revenueScheduleToInflows", () => {
  it("turns each scheduled month into a direction:in event in the deal's currency", () => {
    const out = revenueScheduleToInflows(
      [
        { month: "2026-09-01", amount: "34500.0000" },
        { month: "2026-10-01", amount: "34500.0000" },
      ],
      "INR",
    )
    expect(out).toEqual([
      { direction: "in", scheduledMonth: "2026-09-01", amount: "34500.0000", currency: "INR" },
      { direction: "in", scheduledMonth: "2026-10-01", amount: "34500.0000", currency: "INR" },
    ])
  })

  it("maps an empty schedule to an empty array", () => {
    expect(revenueScheduleToInflows([], "USD")).toEqual([])
  })
})
