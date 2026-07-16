import { describe, it, expect, vi, beforeEach } from "vitest"

// Existing legacy_salesforce_id → id rows the fake DB returns per table.
const existingRows: Record<string, { id: string; legacy_salesforce_id: string }[]> = {
  accounts: [],
  contacts: [],
  opportunities: [],
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({
    from: (table: string) => ({
      select: () => ({
        not: () =>
          // eslint-disable-next-line security/detect-object-injection -- test fixture lookup
          Promise.resolve({ data: existingRows[table] ?? [], error: null }),
      }),
    }),
  }),
}))

const createAccount = vi.fn(async (..._args: unknown[]) => ({ id: "new-acct" }))
const createContact = vi.fn(async (..._args: unknown[]) => ({ id: "new-contact" }))
const createOpportunity = vi.fn(async (..._args: unknown[]) => ({ id: "new-opp" }))
const createImportJob = vi.fn(async (..._args: unknown[]) => ({ id: "job-1" }))

vi.mock("@/lib/data/accounts", () => ({ createAccount: (...a: unknown[]) => createAccount(...a) }))
vi.mock("@/lib/data/contacts", () => ({ createContact: (...a: unknown[]) => createContact(...a) }))
vi.mock("@/lib/data/opportunities", () => ({
  createOpportunity: (...a: unknown[]) => createOpportunity(...a),
}))
vi.mock("@/lib/data/data-management", () => ({
  createImportJob: (...a: unknown[]) => createImportJob(...a),
}))

import { importSalesforceCsv } from "./salesforce-import"

const ctx = { user: { id: "admin-1", email: "a@n.com", role: "admin" }, source: "web" } as never

beforeEach(() => {
  existingRows.accounts = []
  existingRows.contacts = []
  existingRows.opportunities = []
  vi.clearAllMocks()
})

describe("importSalesforceCsv (ORR-699)", () => {
  it("creates new accounts and skips ones already imported by Salesforce Id", async () => {
    existingRows.accounts = [{ id: "acc-uuid-1", legacy_salesforce_id: "A1" }]
    const csv = "Account ID,Account Name\nA1,Acme\nA2,Globex"
    const res = await importSalesforceCsv(ctx, { entity: "accounts", csvText: csv })

    expect(res.total).toBe(2)
    expect(res.created).toBe(1)
    expect(res.skipped).toBe(1)
    expect(res.failed).toBe(0)
    expect(createAccount).toHaveBeenCalledTimes(1)
    // The created account carries its Salesforce Id for future idempotency.
    expect(createAccount).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ name: "Globex", legacySalesforceId: "A2" }),
    )
  })

  it("resolves the parent account FK for opportunities and fails rows with no match", async () => {
    existingRows.accounts = [{ id: "acc-uuid-1", legacy_salesforce_id: "A1" }]
    const csv =
      "Opportunity ID,Name,Stage,Account ID,Amount\n" +
      "O1,Deal One,Prospecting,A1,1000\n" +
      "O2,Orphan Deal,Prospecting,A999,2000"
    const res = await importSalesforceCsv(ctx, {
      entity: "opportunities",
      csvText: csv,
      salesUnitId: "11111111-1111-1111-1111-111111111111",
    })

    expect(res.created).toBe(1)
    expect(res.failed).toBe(1)
    expect(res.errors[0].row).toBe(2)
    expect(createOpportunity).toHaveBeenCalledTimes(1)
    expect(createOpportunity).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ accountId: "acc-uuid-1", salesUnitId: expect.any(String) }),
    )
  })

  it("requires a business unit to import opportunities", async () => {
    await expect(
      importSalesforceCsv(ctx, {
        entity: "opportunities",
        csvText: "Opportunity ID,Name,Account ID\nO1,Deal,A1",
      }),
    ).rejects.toThrow(/business unit/i)
  })

  it("writes an import_jobs audit row", async () => {
    await importSalesforceCsv(ctx, {
      entity: "accounts",
      csvText: "Account ID,Account Name\nA1,Acme",
    })
    expect(createImportJob).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ kind: "import", targetEntityType: "accounts" }),
    )
  })
})
