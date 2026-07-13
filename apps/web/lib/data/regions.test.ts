import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn() }))

import { regionCreateSchema, regionUpdateSchema } from "./regions"

describe("regionCreateSchema", () => {
  it("accepts a name with an optional code", () => {
    const parsed = regionCreateSchema.parse({ name: "South Asia", code: "SA" })
    expect(parsed.name).toBe("South Asia")
    expect(parsed.code).toBe("SA")
  })

  it("accepts a name with no code", () => {
    const parsed = regionCreateSchema.parse({ name: "EMEA" })
    expect(parsed.name).toBe("EMEA")
  })

  it("allows an empty-string code (form default)", () => {
    const parsed = regionCreateSchema.parse({ name: "APAC", code: "" })
    expect(parsed.code).toBe("")
  })

  it("rejects a missing name", () => {
    expect(() => regionCreateSchema.parse({ code: "X" })).toThrow()
  })

  it("rejects a code with spaces or symbols", () => {
    expect(() => regionCreateSchema.parse({ name: "R", code: "north east" })).toThrow()
    expect(() => regionCreateSchema.parse({ name: "R", code: "a/b" })).toThrow()
  })
})

describe("regionUpdateSchema", () => {
  it("accepts a partial update (active only)", () => {
    const parsed = regionUpdateSchema.parse({ active: false })
    expect(parsed.active).toBe(false)
    expect("name" in parsed).toBe(false)
  })

  it("accepts a name + code rename", () => {
    const parsed = regionUpdateSchema.parse({ name: "New name", code: "NN" })
    expect(parsed.name).toBe("New name")
    expect(parsed.code).toBe("NN")
  })
})
