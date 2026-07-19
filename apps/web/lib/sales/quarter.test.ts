import { describe, it, expect } from "vitest"
import { quarterOf, quarterBounds, quarterLabel } from "./quarter"

describe("quarterOf", () => {
  it("maps a month to its calendar quarter (UTC)", () => {
    expect(quarterOf(new Date(Date.UTC(2026, 0, 15)))).toEqual({ year: 2026, quarter: 1 }) // Jan
    expect(quarterOf(new Date(Date.UTC(2026, 2, 31)))).toEqual({ year: 2026, quarter: 1 }) // Mar
    expect(quarterOf(new Date(Date.UTC(2026, 3, 1)))).toEqual({ year: 2026, quarter: 2 }) // Apr
    expect(quarterOf(new Date(Date.UTC(2026, 6, 16)))).toEqual({ year: 2026, quarter: 3 }) // Jul
    expect(quarterOf(new Date(Date.UTC(2026, 11, 31)))).toEqual({ year: 2026, quarter: 4 }) // Dec
  })

  it("reads the instant in UTC, not the local zone (ORR-814c consistency)", () => {
    // 2026-04-01 00:30 UTC is still Q1 (Mar 31) in America/Los_Angeles, but quarterOf
    // must agree with quarterBounds, which is UTC → Q2. And 2026-06-30 23:30 UTC is
    // already Q3 (Jul 1) in Asia/Kolkata but is still Q2 in UTC.
    expect(quarterOf(new Date("2026-04-01T00:30:00Z"))).toEqual({ year: 2026, quarter: 2 })
    expect(quarterOf(new Date("2026-06-30T23:30:00Z"))).toEqual({ year: 2026, quarter: 2 })
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
