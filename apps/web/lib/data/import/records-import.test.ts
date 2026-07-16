import { describe, it, expect } from "vitest"
import {
  buildAccountFieldMap,
  mapAccountRow,
  normalizeWebsite,
} from "./records-import"

describe("buildAccountFieldMap", () => {
  it("matches headers to fields case-insensitively", () => {
    const map = buildAccountFieldMap([
      "Account Name",
      "Website",
      "COUNTRY",
      "unrelated",
    ])
    expect(map.name).toBe("Account Name")
    expect(map.website).toBe("Website")
    expect(map.country).toBe("COUNTRY")
    expect(map.industry).toBeUndefined()
  })

  it("accepts alias headers (Company → name, Sector → industry)", () => {
    const map = buildAccountFieldMap(["Company", "Sector", "Notes"])
    expect(map.name).toBe("Company")
    expect(map.industry).toBe("Sector")
    expect(map.description).toBe("Notes")
  })

  it("takes the first matching header when several aliases are present", () => {
    const map = buildAccountFieldMap(["Company", "Account Name"])
    expect(map.name).toBe("Company")
  })

  it("returns no name mapping when no name-like column exists", () => {
    const map = buildAccountFieldMap(["Revenue", "Segment"])
    expect(map.name).toBeUndefined()
  })
})

describe("normalizeWebsite", () => {
  it("prefixes a bare domain with https://", () => {
    expect(normalizeWebsite("acme.com")).toBe("https://acme.com")
  })

  it("leaves an already-qualified URL untouched", () => {
    expect(normalizeWebsite("http://acme.com")).toBe("http://acme.com")
    expect(normalizeWebsite("https://acme.com/path")).toBe("https://acme.com/path")
  })

  it("returns empty for a blank cell", () => {
    expect(normalizeWebsite("")).toBe("")
    expect(normalizeWebsite("   ")).toBe("")
  })
})

describe("mapAccountRow", () => {
  const map = buildAccountFieldMap([
    "Name",
    "Legal Name",
    "Website",
    "Country",
    "Industry",
    "Description",
  ])

  it("maps a full row into an AccountCreateInput", () => {
    const input = mapAccountRow(
      {
        Name: "Acme Corp",
        "Legal Name": "Acme Corporation Ltd",
        Website: "acme.com",
        Country: "India",
        Industry: "Gaming",
        Description: "Key partner",
      },
      map,
    )
    expect(input).toEqual({
      name: "Acme Corp",
      legalName: "Acme Corporation Ltd",
      website: "https://acme.com",
      country: "India",
      industry: "Gaming",
      description: "Key partner",
    })
  })

  it("omits empty optional fields but always includes name", () => {
    const input = mapAccountRow(
      { Name: "Solo", "Legal Name": "", Website: "  ", Country: "" },
      map,
    )
    expect(input).toEqual({ name: "Solo" })
  })

  it("trims values and surfaces an empty name (schema will reject it)", () => {
    const input = mapAccountRow({ Name: "   ", Country: "US" }, map)
    expect(input.name).toBe("")
    expect(input.country).toBe("US")
  })

  it("ignores columns that were not mapped", () => {
    const narrowMap = buildAccountFieldMap(["Name"])
    const input = mapAccountRow({ Name: "Acme", Website: "acme.com" }, narrowMap)
    expect(input).toEqual({ name: "Acme" })
  })
})
