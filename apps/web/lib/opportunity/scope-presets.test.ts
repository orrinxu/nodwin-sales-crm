import { describe, it, expect } from "vitest"
import {
  SCOPE_PRESETS,
  SCOPE_PRESET_ORDER,
  DEFAULT_SCOPE_KEY,
  parseScopeKey,
  parseViewKey,
  currentMonthRange,
} from "./scope-presets"

describe("scope presets", () => {
  it("exposes exactly the three v1 chips in order (My Team deferred)", () => {
    expect(SCOPE_PRESET_ORDER).toEqual([
      "my-pipeline",
      "all-deals",
      "closing-this-month",
    ])
    expect(Object.keys(SCOPE_PRESETS).sort()).toEqual(
      [...SCOPE_PRESET_ORDER].sort(),
    )
  })

  it("only My Pipeline is owner-narrowed and carries an empty state", () => {
    expect(SCOPE_PRESETS["my-pipeline"].ownerScope).toBe("mine")
    expect(SCOPE_PRESETS["my-pipeline"].emptyState).toBeDefined()
    expect(SCOPE_PRESETS["all-deals"].ownerScope).toBe("all")
    expect(SCOPE_PRESETS["all-deals"].emptyState).toBeUndefined()
  })

  it("Closing This Month is all-scope + a date window, table-first", () => {
    const p = SCOPE_PRESETS["closing-this-month"]
    expect(p.ownerScope).toBe("all")
    expect(p.closingThisMonth).toBe(true)
    expect(p.savedViewScope).toBe("all") // reuses owner bucket for saved_views
    expect(p.defaultView).toBe("table")
  })

  it("My Pipeline is the board-first default landing", () => {
    expect(DEFAULT_SCOPE_KEY).toBe("my-pipeline")
    // eslint-disable-next-line security/detect-object-injection -- DEFAULT_SCOPE_KEY is a module constant
    expect(SCOPE_PRESETS[DEFAULT_SCOPE_KEY].defaultView).toBe("board")
  })
})

describe("parseScopeKey", () => {
  it("passes through known keys", () => {
    expect(parseScopeKey("all-deals")).toBe("all-deals")
    expect(parseScopeKey("closing-this-month")).toBe("closing-this-month")
  })
  it("falls back to the default for unknown/undefined", () => {
    expect(parseScopeKey(undefined)).toBe(DEFAULT_SCOPE_KEY)
    expect(parseScopeKey("bogus")).toBe(DEFAULT_SCOPE_KEY)
    expect(parseScopeKey("")).toBe(DEFAULT_SCOPE_KEY)
  })
})

describe("parseViewKey", () => {
  it("accepts board/table, rejects the rest", () => {
    expect(parseViewKey("board")).toBe("board")
    expect(parseViewKey("table")).toBe("table")
    expect(parseViewKey("kanban")).toBeUndefined()
    expect(parseViewKey(undefined)).toBeUndefined()
  })
})

describe("currentMonthRange", () => {
  it("returns inclusive first/last day of the month as YYYY-MM-DD", () => {
    // Pin a zone so the assertion is deterministic regardless of the test host.
    const { from, to } = currentMonthRange("UTC")
    expect(from).toMatch(/^\d{4}-\d{2}-01$/)
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // Same year-month on both bounds.
    expect(from.slice(0, 7)).toBe(to.slice(0, 7))
    // Last day is one of the valid month-ends.
    expect([28, 29, 30, 31]).toContain(Number(to.slice(8, 10)))
  })
})
