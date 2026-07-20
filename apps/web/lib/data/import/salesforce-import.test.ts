import { describe, it, expect, vi, beforeEach } from "vitest"

// Existing legacy_salesforce_id → id rows the fake DB returns per table, plus a
// users table for Owner-Email → user matching (ORR-809b).
const existingRows: Record<string, { id: string; legacy_salesforce_id: string }[]> = {
  accounts: [],
  contacts: [],
  opportunities: [],
}
let userRows: { id: string; email: string | null }[] = []

// PostgREST caps a single response at 1000 rows. The fake DB enforces the same
// cap on each .range() page so the paging loop is exercised, not bypassed.
const PG_MAX_ROWS = 1000

function page<T>(all: T[], from: number, to: number): T[] {
  const requested = to - from + 1
  const capped = Math.min(requested, PG_MAX_ROWS)
  return all.slice(from, from + capped)
}

// The importer's scans run on the SERVICE-ROLE client (ORR-809g). Mock it, not
// the RLS-scoped createServerClient. The chain supports both the legacy-index
// scan (.not().order().range()) and the users scan (same shape).
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => ({
      select: () => ({
        not: () => ({
          order: () => ({
            range: (from: number, to: number) => {
              if (table === "users") {
                return Promise.resolve({ data: page(userRows, from, to), error: null })
              }
              // eslint-disable-next-line security/detect-object-injection -- test fixture lookup
              const all = existingRows[table] ?? []
              return Promise.resolve({ data: page(all, from, to), error: null })
            },
          }),
        }),
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
const OPP_DEFAULTS = {
  salesUnitId: "11111111-1111-1111-1111-111111111111",
  defaultCurrency: "INR",
}

beforeEach(() => {
  existingRows.accounts = []
  existingRows.contacts = []
  existingRows.opportunities = []
  userRows = []
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
      ...OPP_DEFAULTS,
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
        defaultCurrency: "USD",
      }),
    ).rejects.toThrow(/business unit/i)
  })

  it("requires a confirmed currency to import opportunities (ORR-809f)", async () => {
    await expect(
      importSalesforceCsv(ctx, {
        entity: "opportunities",
        csvText: "Opportunity ID,Name,Account ID\nO1,Deal,A1",
        salesUnitId: "11111111-1111-1111-1111-111111111111",
      }),
    ).rejects.toThrow(/currency is required/i)
  })

  it("writes an import_jobs audit row with counts", async () => {
    await importSalesforceCsv(ctx, {
      entity: "accounts",
      csvText: "Account ID,Account Name\nA1,Acme",
    })
    expect(createImportJob).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        kind: "import",
        targetEntityType: "accounts",
        status: "completed",
        recordCount: 1,
      }),
    )
  })

  it("skips already-imported rows even when >1000 accounts already exist (ORR-779)", async () => {
    existingRows.accounts = Array.from({ length: 1500 }, (_, i) => ({
      id: `acc-uuid-${i}`,
      legacy_salesforce_id: `A${i}`,
    }))
    const csv = "Account ID,Account Name\nA1499,Already Imported\nANEW,Brand New"
    const res = await importSalesforceCsv(ctx, { entity: "accounts", csvText: csv })

    expect(res.total).toBe(2)
    expect(res.skipped).toBe(1)
    expect(res.created).toBe(1)
    expect(createAccount).toHaveBeenCalledTimes(1)
    expect(createAccount).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ legacySalesforceId: "ANEW" }),
    )
  })
})

describe("importSalesforceCsv correctness fixes (ORR-809)", () => {
  it("(a) does not guess qualify for unknown stages — skips + reports distinct values", async () => {
    existingRows.accounts = [{ id: "acc-uuid-1", legacy_salesforce_id: "A1" }]
    const csv =
      "Opportunity ID,Name,Stage,Account ID\n" +
      "O1,Custom One,Disqualified,A1\n" +
      "O2,Custom Two,Disqualified,A1\n" +
      "O3,Good One,Prospecting,A1"
    const res = await importSalesforceCsv(ctx, {
      entity: "opportunities",
      csvText: csv,
      ...OPP_DEFAULTS,
    })
    expect(res.created).toBe(1)
    expect(res.failed).toBe(2)
    expect(createOpportunity).toHaveBeenCalledTimes(1)
    expect(res.warnings.join(" ")).toMatch(/Unmapped stages.*Disqualified.*\(2\)/)
  })

  it("(b) matches Owner Email to a CRM user; reports unmatched", async () => {
    userRows = [{ id: "user-jane", email: "jane@nodwin.com" }]
    const csv =
      "Account ID,Account Name,Owner Email\n" +
      "A1,Acme,jane@nodwin.com\n" +
      "A2,Globex,ghost@nowhere.com"
    const res = await importSalesforceCsv(ctx, { entity: "accounts", csvText: csv })
    expect(res.created).toBe(2)
    expect(createAccount).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ name: "Acme", accountOwnerUserId: "user-jane" }),
    )
    expect(createAccount).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ name: "Globex", accountOwnerUserId: undefined }),
    )
    expect(res.warnings.join(" ")).toMatch(/ghost@nowhere\.com/)
  })

  it("(c) warns loudly when the file has no Id column", async () => {
    const csv = "Account Name\nAcme\nGlobex"
    const res = await importSalesforceCsv(ctx, { entity: "accounts", csvText: csv })
    expect(res.created).toBe(2)
    expect(res.warnings.join(" ")).toMatch(/no Salesforce record-Id column/i)
  })

  it("(d) strips percent + separators so formatted amounts/probabilities import", async () => {
    existingRows.accounts = [{ id: "acc-uuid-1", legacy_salesforce_id: "A1" }]
    const csv =
      "Opportunity ID,Name,Stage,Account ID,Amount,Probability (%)\n" +
      'O1,Deal,Prospecting,A1,"$1,000.50",10%'
    const res = await importSalesforceCsv(ctx, {
      entity: "opportunities",
      csvText: csv,
      ...OPP_DEFAULTS,
    })
    expect(res.created).toBe(1)
    expect(createOpportunity).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ amount: "1000.50", probabilityPct: "10" }),
    )
  })

  it("(f) applies the confirmed currency when the export has no Currency column", async () => {
    existingRows.accounts = [{ id: "acc-uuid-1", legacy_salesforce_id: "A1" }]
    const csv = "Opportunity ID,Name,Stage,Account ID\nO1,Deal,Prospecting,A1"
    const res = await importSalesforceCsv(ctx, {
      entity: "opportunities",
      csvText: csv,
      ...OPP_DEFAULTS,
    })
    expect(createOpportunity).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ currency: "INR" }),
    )
    expect(res.warnings.join(" ")).toMatch(/No Currency column/i)
  })

  it("(h) records a partial status when some rows fail and some succeed", async () => {
    existingRows.accounts = [{ id: "acc-uuid-1", legacy_salesforce_id: "A1" }]
    const csv =
      "Opportunity ID,Name,Stage,Account ID\n" +
      "O1,Good,Prospecting,A1\n" +
      "O2,Orphan,Prospecting,A999"
    await importSalesforceCsv(ctx, { entity: "opportunities", csvText: csv, ...OPP_DEFAULTS })
    expect(createImportJob).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ status: "partial", recordCount: 1 }),
    )
  })
})
