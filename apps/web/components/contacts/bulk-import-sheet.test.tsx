import { describe, it, expect } from "vitest"
import { parseCSVLine, parseCSV } from "./bulk-import-sheet"

describe("parseCSVLine", () => {
  it("splits simple comma-separated values", () => {
    expect(parseCSVLine("a,b,c")).toEqual(["a", "b", "c"])
  })

  it("trims whitespace from values", () => {
    expect(parseCSVLine("  a , b , c ")).toEqual(["a", "b", "c"])
  })

  it("handles quoted fields with commas", () => {
    expect(parseCSVLine('"a,b",c')).toEqual(["a,b", "c"])
  })

  it("handles escaped quotes inside quoted fields", () => {
    expect(parseCSVLine('"hello""world",end')).toEqual(['hello"world', "end"])
  })

  it("handles empty values", () => {
    expect(parseCSVLine("a,,c")).toEqual(["a", "", "c"])
  })

  it("returns empty array for empty string", () => {
    expect(parseCSVLine("")).toEqual([""])
  })

  it("trims whitespace around quoted fields too", () => {
    expect(parseCSVLine('  " a " , b ')).toEqual(["a", "b"])
  })
})

describe("parseCSV", () => {
  const basicCSV = "name,email\nAlice,alice@test.com\nBob,bob@test.com"

  it("parses headers and rows", () => {
    const result = parseCSV(basicCSV)
    expect(result.headers).toEqual(["name", "email"])
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toEqual({ name: "Alice", email: "alice@test.com" })
    expect(result.rows[1]).toEqual({ name: "Bob", email: "bob@test.com" })
  })

  it("uses Object.create(null) to prevent prototype pollution", () => {
    const csv = "__proto__,name\npolluted,Alice"
    const result = parseCSV(csv)
    expect(Object.getPrototypeOf(result.rows[0])).toBeNull()
    expect(result.rows[0].name).toBe("Alice")
    expect(({} as any).name).toBeUndefined()
  })

  it("handles fields with newlines inside quotes", () => {
    const csv = 'name,notes\nAlice,"line1\nline2"\nBob,"note"'
    const result = parseCSV(csv)
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].notes).toBe("line1\nline2")
    expect(result.rows[1].notes).toBe("note")
  })

  it("handles escaped quotes inside quoted fields", () => {
    const csv = 'name,description\nAlice,"he said ""hello"""'
    const result = parseCSV(csv)
    expect(result.rows[0].description).toBe('he said "hello"')
  })

  it("handles empty values in rows", () => {
    const csv = "name,email,phone\nAlice,,\nBob,bob@test.com,"
    const result = parseCSV(csv)
    expect(result.rows[0].name).toBe("Alice")
    expect(result.rows[0].email).toBe("")
    expect(result.rows[0].phone).toBe("")
    expect(result.rows[1].phone).toBe("")
  })

  it("handles carriage returns in CSV", () => {
    const csv = "name,email\r\nAlice,alice@test.com\r\nBob,bob@test.com"
    const result = parseCSV(csv)
    expect(result.headers).toEqual(["name", "email"])
    expect(result.rows).toHaveLength(2)
  })

  it("throws when CSV has no data rows", () => {
    expect(() => parseCSV("header1,header2")).toThrow("CSV must have a header row and at least one data row")
  })

  it("throws on empty text", () => {
    expect(() => parseCSV("")).toThrow("CSV must have a header row and at least one data row")
  })

  it("handles single column CSV", () => {
    const csv = "name\nAlice\nBob"
    const result = parseCSV(csv)
    expect(result.headers).toEqual(["name"])
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].name).toBe("Alice")
  })

  it("trims leading/trailing whitespace from lines", () => {
    const csv = "name,email\n  Alice,alice@test.com  \n  Bob,bob@test.com"
    const result = parseCSV(csv)
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].email).toBe("alice@test.com")
  })
})
