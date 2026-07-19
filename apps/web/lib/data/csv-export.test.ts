import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

let queue: unknown[][] = []
let rangeCalls = 0
let isCalls: [string, unknown][] = []

function builder() {
  const b: Record<string, unknown> = {}
  b.select = () => b
  b.order = () => b
  b.is = (col: string, val: unknown) => { isCalls.push([col, val]); return b }
  b.range = () => { rangeCalls++; return b }
  b.then = (resolve: (v: unknown) => unknown) => resolve({ data: queue.shift() ?? [], error: null })
  return b
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({ from: () => builder() })),
}))

import { csvField, toCsv, exportRecordsCsv } from "./csv-export"

const ctx = { user: { id: "admin-1", email: "a@nodwin.com", role: "admin" }, source: "web" as const }

beforeEach(() => {
  queue = []
  rangeCalls = 0
  isCalls = []
})

describe("csvField", () => {
  it("leaves plain values unquoted and blanks null/undefined", () => {
    expect(csvField("Acme")).toBe("Acme")
    expect(csvField(42)).toBe("42")
    expect(csvField(null)).toBe("")
    expect(csvField(undefined)).toBe("")
  })
  it("quotes and escapes commas, quotes and newlines", () => {
    expect(csvField("a,b")).toBe('"a,b"')
    expect(csvField('she said "hi"')).toBe('"she said ""hi"""')
    expect(csvField("line1\nline2")).toBe('"line1\nline2"')
  })
})

describe("toCsv", () => {
  it("joins a header row and data rows with CRLF", () => {
    expect(toCsv(["A", "B"], [["1", "2"], ["x,y", null]])).toBe('A,B\r\n1,2\r\n"x,y",')
  })
})

describe("exportRecordsCsv", () => {
  it("exports accounts to a dated CSV with a header and one line per row", async () => {
    queue = [[
      { name: "Acme", legal_name: "Acme Inc", website: "acme.com", country: "US", industry: "Tech", description: "d", created_at: "2026-07-14T00:00:00Z" },
    ]]
    const out = await exportRecordsCsv(ctx, "accounts", new Date("2026-07-14T12:00:00Z"))
    expect(out.filename).toBe("accounts-2026-07-14.csv")
    expect(out.recordCount).toBe(1)
    const lines = out.csv.split("\r\n")
    expect(lines[0]).toBe("Name,Legal name,Website,Country,Industry,Description,Created at")
    expect(lines[1]).toBe("Acme,Acme Inc,acme.com,US,Tech,d,2026-07-14T00:00:00Z")
    // ORR-804: accounts export excludes soft-deleted rows.
    expect(isCalls).toContainEqual(["deleted_at", null])
  })

  it("flattens the embedded account name for opportunities", async () => {
    queue = [[
      { name: "Big Deal", account: { name: "Acme" }, stage: "qualify", amount: 1000, currency: "USD", close_date: "2026-08-01", probability_pct: 40, created_at: "2026-07-14T00:00:00Z" },
    ]]
    const out = await exportRecordsCsv(ctx, "opportunities")
    const cols = out.csv.split("\r\n")[1].split(",")
    expect(cols[0]).toBe("Big Deal")
    expect(cols[1]).toBe("Acme") // the flattened account name
    // Opportunities have no deleted_at column — no soft-delete filter applied.
    expect(isCalls).toHaveLength(0)
  })

  it("paginates until a short batch, not stopping at the first full page", async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({ full_name: `C${i}`, email: null, phone: null, title: null, notes: null, created_at: "2026-07-14T00:00:00Z" }))
    queue = [fullPage, [{ full_name: "Last", email: null, phone: null, title: null, notes: null, created_at: "2026-07-14T00:00:00Z" }]]
    const out = await exportRecordsCsv(ctx, "contacts")
    expect(rangeCalls).toBe(2)
    expect(out.recordCount).toBe(1001)
  })
})
