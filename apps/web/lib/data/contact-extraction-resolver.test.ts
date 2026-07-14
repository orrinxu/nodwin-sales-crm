import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { resolveExtractedContact, type ContactResolverDeps } from "./contact-extraction-resolver"

const ctx = { user: { id: "u1", email: "a@nodwin.com", role: "sales_rep" }, source: "web" as const }

function fld(value: string) {
  return { value, confidence: 0.9, source: `src:${value}` }
}

describe("resolveExtractedContact", () => {
  it("resolves a matched account to primaryAccountId and passes contact fields through", async () => {
    const deps: ContactResolverDeps = {
      searchAccounts: async () => [{ id: "acc1", name: "Acme Media" }],
      searchContacts: async () => [], // no existing contact
    }
    const res = await resolveExtractedContact(
      ctx,
      { fullName: fld("Ada Lovelace"), account: fld("Acme Media"), email: fld("ada@acme.com") },
      deps,
    )
    expect(res.prefill.primaryAccountId).toBe("acc1")
    expect(res.resolution.account.status).toBe("matched")
    expect(res.prefill.fullName).toBe("Ada Lovelace")
    expect(res.resolution.fullName.status).toBe("ok")
    expect(res.prefill.email).toBe("ada@acme.com")
    expect(res.resolution.email.status).toBe("ok")
  })

  it("flags a new account (unmatched) without setting primaryAccountId, and notes it", async () => {
    const deps: ContactResolverDeps = {
      searchAccounts: async () => [],
      searchContacts: async () => [],
    }
    const res = await resolveExtractedContact(ctx, { fullName: fld("Ada"), account: fld("Brand New Co") }, deps)
    expect(res.resolution.account.status).toBe("unmatched")
    expect(res.prefill.primaryAccountId).toBeUndefined()
    expect(res.notes.some((n) => /no existing account/i.test(n))).toBe(true)
  })

  it("dedups the contact within the matched account", async () => {
    const deps: ContactResolverDeps = {
      searchAccounts: async () => [{ id: "acc1", name: "Acme Media" }],
      searchContacts: async (_q, accountId) => (accountId === "acc1" ? [{ id: "c1", name: "Ada Lovelace" }] : []),
    }
    const res = await resolveExtractedContact(ctx, { fullName: fld("Ada Lovelace"), account: fld("Acme Media") }, deps)
    expect(res.resolution.fullName.status).toBe("ambiguous")
    expect(res.resolution.fullName.candidates?.[0]).toEqual({ id: "c1", label: "Ada Lovelace" })
    expect(res.notes.some((n) => /may already exist/i.test(n))).toBe(true)
  })
})
