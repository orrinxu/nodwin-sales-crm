import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn() }))

import { savedViewFiltersSchema, saveViewInputSchema } from "./saved-views"

describe("savedViewFiltersSchema", () => {
  it("accepts a valid partial filter", () => {
    expect(savedViewFiltersSchema.parse({ stageFilter: "propose" })).toEqual({
      stageFilter: "propose",
    })
  })

  it("rejects unknown keys (strict)", () => {
    expect(() => savedViewFiltersSchema.parse({ evil: 1 })).toThrow()
  })

  it("rejects an over-long search query", () => {
    expect(() =>
      savedViewFiltersSchema.parse({ searchQuery: "x".repeat(201) }),
    ).toThrow()
  })

  it("caps the number of sort columns", () => {
    const sorting = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, desc: false }))
    expect(() => savedViewFiltersSchema.parse({ sorting })).toThrow()
  })
})

describe("saveViewInputSchema", () => {
  it("trims and requires a name", () => {
    expect(
      saveViewInputSchema.parse({ name: "  My view ", scope: "mine", filters: {} }),
    ).toEqual({ name: "My view", scope: "mine", filters: {} })
  })

  it("rejects an empty/whitespace name", () => {
    expect(() =>
      saveViewInputSchema.parse({ name: "   ", scope: "mine", filters: {} }),
    ).toThrow()
  })

  it("rejects an invalid scope", () => {
    expect(() =>
      saveViewInputSchema.parse({ name: "x", scope: "team", filters: {} }),
    ).toThrow()
  })
})
