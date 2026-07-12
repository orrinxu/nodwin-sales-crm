import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))
// Default-deps imports only — the tests inject deps, so these are never invoked.
vi.mock("./contacts", () => ({ searchAccountOptions: vi.fn(), searchContactOptions: vi.fn() }))
vi.mock("./opportunities", () => ({ getBusinessUnitOptions: vi.fn() }))
vi.mock("./user-preferences", () => ({ getCurrencyOptions: vi.fn() }))

import {
  resolveExtractedOpportunity,
  type ExtractionResolverDeps,
  type ExtractionResolverContext,
} from "./opportunity-extraction-resolver"
import type { ExtractedOpportunityFields } from "@/lib/ai/opportunity-extraction"

const ctx: ExtractionResolverContext = { user: { id: "u1" }, source: "web" }

function f<T>(value: T): { value: T; confidence: number; source: string } {
  return { value, confidence: 0.8, source: "snippet" }
}

function deps(over: Partial<ExtractionResolverDeps> = {}): ExtractionResolverDeps {
  return {
    searchAccounts: async () => [],
    searchContacts: async () => [],
    listBusinessUnits: async () => [],
    listCurrencyCodes: async () => ["USD", "INR", "EUR"],
    ...over,
  }
}

const run = (fields: ExtractedOpportunityFields, over: Partial<ExtractionResolverDeps> = {}) =>
  resolveExtractedOpportunity(ctx, fields, deps(over))

describe("resolveExtractedOpportunity — account", () => {
  it("pins an exact name match", async () => {
    const res = await run({ account: f("Acme Corp") }, {
      searchAccounts: async () => [
        { id: "acc1", name: "Acme Corp" },
        { id: "acc2", name: "Acme Corporation Ltd" },
      ],
    })
    expect(res.prefill.accountId).toBe("acc1")
    expect(res.resolution.account.status).toBe("matched")
    expect(res.resolution.account.display).toBe("Acme Corp")
  })

  it("returns ambiguous candidates when several match and none is exact", async () => {
    const res = await run({ account: f("Acme") }, {
      searchAccounts: async () => [
        { id: "a1", name: "Acme India" },
        { id: "a2", name: "Acme Global" },
      ],
    })
    expect(res.prefill.accountId).toBeUndefined()
    expect(res.resolution.account.status).toBe("ambiguous")
    expect(res.resolution.account.candidates).toHaveLength(2)
  })

  it("proposes create-new when nothing matches", async () => {
    const res = await run({ account: f("Nobody Inc") }, { searchAccounts: async () => [] })
    expect(res.prefill.accountId).toBeUndefined()
    expect(res.resolution.account.status).toBe("unmatched")
    expect(res.resolution.account.raw).toBe("Nobody Inc")
    expect(res.notes.join(" ")).toMatch(/create/i)
  })
})

describe("resolveExtractedOpportunity — contact scoped to account", () => {
  it("scopes the contact search to the matched account", async () => {
    const searchContacts = vi.fn(async () => [{ id: "c1", name: "Jane Doe" }])
    const res = await run(
      { account: f("Acme Corp"), primaryContact: f("Jane Doe") },
      { searchAccounts: async () => [{ id: "acc1", name: "Acme Corp" }], searchContacts },
    )
    expect(searchContacts).toHaveBeenCalledWith("Jane Doe", "acc1")
    expect(res.prefill.primaryContactId).toBe("c1")
    expect(res.resolution.primaryContact.status).toBe("matched")
  })
})

describe("resolveExtractedOpportunity — sales unit (fuzzy contains)", () => {
  it("matches a business unit by containment", async () => {
    const res = await run({ salesUnit: f("Esports") }, {
      listBusinessUnits: async () => [
        { id: "bu1", name: "Esports Sales" },
        { id: "bu2", name: "Content Sales" },
      ],
    })
    expect(res.prefill.salesUnitId).toBe("bu1")
    expect(res.resolution.salesUnit.status).toBe("matched")
  })
})

describe("resolveExtractedOpportunity — money", () => {
  it("parses an amount with separators and rejects junk", async () => {
    const ok = await run({ amount: f("50,00,000") })
    expect(ok.prefill.amount).toBe("5000000")
    expect(ok.resolution.amount.status).toBe("ok")

    const bad = await run({ amount: f("a lot") })
    expect(bad.prefill.amount).toBeUndefined()
    expect(bad.resolution.amount.status).toBe("invalid")
    expect(bad.notes.join(" ")).toMatch(/amount/i)
  })

  it("maps a currency symbol to a registry code and flags an unknown one", async () => {
    const ok = await run({ currency: f("₹") }, { listCurrencyCodes: async () => ["INR", "USD"] })
    expect(ok.prefill.currency).toBe("INR")
    expect(ok.resolution.currency.status).toBe("matched")

    const bad = await run({ currency: f("XYZ") })
    expect(bad.prefill.currency).toBeUndefined()
    expect(bad.resolution.currency.status).toBe("invalid")
    expect(bad.notes.join(" ")).toMatch(/currency/i)
  })
})

describe("resolveExtractedOpportunity — dates", () => {
  it("accepts ISO and rejects ambiguous", async () => {
    const res = await run({ closeDate: f("2026-03-04"), executionDate: f("3/4/2026") })
    expect(res.prefill.closeDate).toBe("2026-03-04")
    expect(res.resolution.closeDate.status).toBe("ok")
    expect(res.prefill.executionDate).toBeUndefined()
    expect(res.resolution.executionDate.status).toBe("invalid")
    expect(res.notes.join(" ")).toMatch(/executionDate/)
  })
})

describe("resolveExtractedOpportunity — enums & passthroughs", () => {
  it("maps service types, flags unrecognised ones", async () => {
    const res = await run({ serviceType: f(["Studio Production", "made up thing"]) })
    expect(res.prefill.serviceType).toEqual(["studio_production"])
    expect(res.resolution.serviceType.status).toBe("ambiguous")
    expect(res.notes.join(" ")).toMatch(/Unrecognised service/i)
  })

  it("maps single enums and passes plain fields through", async () => {
    const res = await run({
      propertyType: f("Festival"),
      revenueCategory: f("Content"),
      recurring: f(true),
      name: f("Valorant India Invitational"),
      countryExecution: f("India"),
    })
    expect(res.prefill.propertyType).toBe("festival")
    expect(res.prefill.revenueCategory).toBe("content")
    expect(res.prefill.recurring).toBe(true)
    expect(res.prefill.name).toBe("Valorant India Invitational")
    expect(res.prefill.countryExecution).toBe("India")
  })

  it("carries source + confidence onto each resolution", async () => {
    const res = await run({ name: f("Deal X") })
    expect(res.resolution.name.source).toBe("snippet")
    expect(res.resolution.name.confidence).toBe(0.8)
  })
})
