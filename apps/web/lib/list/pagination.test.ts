import { describe, it, expect } from "vitest"
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  clampPage,
  clampPageSize,
  rangeFor,
  pageCount,
  sanitizeSearchTerm,
} from "./pagination"

describe("clampPage", () => {
  it("defaults absent / invalid to 1", () => {
    expect(clampPage(undefined)).toBe(1)
    expect(clampPage(null)).toBe(1)
    expect(clampPage(NaN)).toBe(1)
    expect(clampPage(0)).toBe(1)
    expect(clampPage(-5)).toBe(1)
  })
  it("floors fractional pages", () => {
    expect(clampPage(3.9)).toBe(3)
  })
  it("passes valid pages through", () => {
    expect(clampPage(7)).toBe(7)
  })
})

describe("clampPageSize", () => {
  it("defaults absent / invalid to DEFAULT_PAGE_SIZE", () => {
    expect(clampPageSize(undefined)).toBe(DEFAULT_PAGE_SIZE)
    expect(clampPageSize(NaN)).toBe(DEFAULT_PAGE_SIZE)
  })
  it("clamps into [1, MAX_PAGE_SIZE]", () => {
    expect(clampPageSize(0)).toBe(1)
    expect(clampPageSize(-3)).toBe(1)
    expect(clampPageSize(MAX_PAGE_SIZE + 500)).toBe(MAX_PAGE_SIZE)
  })
  it("passes an in-range size through", () => {
    expect(clampPageSize(40)).toBe(40)
  })
})

describe("rangeFor", () => {
  it("computes an inclusive [from, to] for page 1", () => {
    expect(rangeFor(1, 25)).toEqual([0, 24])
  })
  it("offsets later pages", () => {
    expect(rangeFor(3, 10)).toEqual([20, 29])
  })
  it("clamps a bogus page/size before computing", () => {
    expect(rangeFor(0, 0)).toEqual([0, 0])
  })
})

describe("pageCount", () => {
  it("returns at least 1 even for an empty set", () => {
    expect(pageCount(0, 25)).toBe(1)
  })
  it("rounds up a partial last page", () => {
    expect(pageCount(101, 25)).toBe(5)
    expect(pageCount(100, 25)).toBe(4)
  })
})

describe("sanitizeSearchTerm", () => {
  it("trims and collapses whitespace", () => {
    expect(sanitizeSearchTerm("  big   deal  ")).toBe("big deal")
  })
  it("strips PostgREST or-filter metacharacters", () => {
    // Commas and parentheses would corrupt an .or("…") filter string.
    expect(sanitizeSearchTerm("acme, inc (west)")).toBe("acme inc west")
  })
  it("returns empty for absent / whitespace-only input", () => {
    expect(sanitizeSearchTerm(undefined)).toBe("")
    expect(sanitizeSearchTerm("   ")).toBe("")
    expect(sanitizeSearchTerm(",,,")).toBe("")
  })
})
