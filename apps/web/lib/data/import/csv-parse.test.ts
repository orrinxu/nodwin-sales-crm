import { describe, it, expect } from "vitest"
import { parseCsv } from "./csv-parse"

describe("parseCsv (ORR-699)", () => {
  it("parses a simple header + rows into keyed objects", () => {
    const { headers, rows } = parseCsv("Name,Email\nAcme,a@acme.com\nGlobex,g@globex.com")
    expect(headers).toEqual(["Name", "Email"])
    expect(rows).toEqual([
      { Name: "Acme", Email: "a@acme.com" },
      { Name: "Globex", Email: "g@globex.com" },
    ])
  })

  it("handles quoted fields containing commas", () => {
    const { rows } = parseCsv('Name,Note\n"Acme, Inc.","a, b, c"')
    expect(rows[0]).toEqual({ Name: "Acme, Inc.", Note: "a, b, c" })
  })

  it("handles embedded newlines inside quotes", () => {
    const { rows } = parseCsv('Name,Note\n"Acme","line1\nline2"')
    expect(rows).toHaveLength(1)
    expect(rows[0].Note).toBe("line1\nline2")
  })

  it("unescapes doubled quotes", () => {
    const { rows } = parseCsv('Name\n"She said ""hi"""')
    expect(rows[0].Name).toBe('She said "hi"')
  })

  it("accepts CRLF line endings and a leading BOM", () => {
    const { headers, rows } = parseCsv("﻿Name,Email\r\nAcme,a@acme.com\r\n")
    expect(headers).toEqual(["Name", "Email"])
    expect(rows).toEqual([{ Name: "Acme", Email: "a@acme.com" }])
  })

  it("drops fully blank rows and a trailing newline", () => {
    const { rows } = parseCsv("Name\nAcme\n\n\n")
    expect(rows).toEqual([{ Name: "Acme" }])
  })

  it("fills missing trailing cells with empty strings", () => {
    const { rows } = parseCsv("A,B,C\n1,2")
    expect(rows[0]).toEqual({ A: "1", B: "2", C: "" })
  })

  it("returns empty result for empty input", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] })
  })
})
