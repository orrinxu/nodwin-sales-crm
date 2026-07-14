import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

let byTable: Record<string, unknown[]> = {}
const fromSpy = vi.fn()

function builder(table: string) {
  const b: Record<string, unknown> = {}
  for (const m of ["select", "or", "ilike", "order", "limit"]) {
    // eslint-disable-next-line security/detect-object-injection -- fixed method list
    b[m] = () => b
  }
  b.then = (resolve: (v: unknown) => unknown) =>
    // eslint-disable-next-line security/detect-object-injection -- table is a literal from search.ts
    resolve({ data: byTable[table] ?? [], error: null })
  return b
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({
    from: (t: string) => {
      fromSpy(t)
      return builder(t)
    },
  })),
}))

import { globalSearch } from "./search"

const ctx = { user: { id: "u1", email: "a@nodwin.com", role: "sales_rep" }, source: "web" as const }

beforeEach(() => {
  byTable = {}
  fromSpy.mockClear()
})

describe("globalSearch", () => {
  it("maps accounts, contacts and opportunities to typed results with hrefs (opps first)", async () => {
    byTable = {
      accounts: [{ id: "a1", name: "Acme", legal_name: "Acme Inc" }],
      contacts: [{ id: "c1", full_name: "Ada Lovelace", email: "ada@x.com" }],
      opportunities: [{ id: "o1", name: "Acme renewal" }],
    }
    const results = await globalSearch(ctx, "ac")
    expect(results.map((r) => r.type)).toEqual(["opportunity", "account", "contact"])
    expect(results[0]).toEqual({ type: "opportunity", id: "o1", label: "Acme renewal", sublabel: null, href: "/opportunities/o1" })
    expect(results[1]).toEqual({ type: "account", id: "a1", label: "Acme", sublabel: "Acme Inc", href: "/accounts/a1" })
    expect(results[2]).toEqual({ type: "contact", id: "c1", label: "Ada Lovelace", sublabel: "ada@x.com", href: "/contacts/c1" })
  })

  it("returns nothing and hits no table for a query under 2 chars", async () => {
    expect(await globalSearch(ctx, "a")).toEqual([])
    expect(await globalSearch(ctx, "")).toEqual([])
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it("sanitises PostgREST/ilike special chars; an all-wildcard query is treated as empty", async () => {
    expect(await globalSearch(ctx, "%%")).toEqual([])
    expect(await globalSearch(ctx, "(),")).toEqual([])
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it("still searches when special chars sanitise down to >=2 real chars", async () => {
    byTable = { accounts: [{ id: "a1", name: "Ab", legal_name: null }] }
    const results = await globalSearch(ctx, "a,b(")
    expect(fromSpy).toHaveBeenCalled()
    expect(results).toHaveLength(1)
    expect(results[0].sublabel).toBeNull()
  })
})
