import { describe, it, expect } from "vitest"
import { quarterOf, quarterBounds, quarterLabel } from "./quarter"

describe("quarterOf", () => {
  it("maps a month to its calendar quarter", () => {
    expect(quarterOf(new Date(2026, 0, 15))).toEqual({ year: 2026, quarter: 1 }) // Jan
    expect(quarterOf(new Date(2026, 2, 31))).toEqual({ year: 2026, quarter: 1 }) // Mar
    expect(quarterOf(new Date(2026, 3, 1))).toEqual({ year: 2026, quarter: 2 }) // Apr
    expect(quarterOf(new Date(2026, 6, 16))).toEqual({ year: 2026, quarter: 3 }) // Jul
    expect(quarterOf(new Date(2026, 11, 31))).toEqual({ year: 2026, quarter: 4 }) // Dec
  })
})

describe("quarterBounds", () => {
  it("returns inclusive first/last day of the quarter", () => {
    expect(quarterBounds(2026, 1)).toEqual({ startIso: "2026-01-01", endIso: "2026-03-31" })
    expect(quarterBounds(2026, 2)).toEqual({ startIso: "2026-04-01", endIso: "2026-06-30" })
    expect(quarterBounds(2026, 3)).toEqual({ startIso: "2026-07-01", endIso: "2026-09-30" })
    expect(quarterBounds(2026, 4)).toEqual({ startIso: "2026-10-01", endIso: "2026-12-31" })
  })
})

describe("quarterLabel", () => {
  it("formats as Qn YYYY", () => {
    expect(quarterLabel(2026, 3)).toBe("Q3 2026")
  })
})
