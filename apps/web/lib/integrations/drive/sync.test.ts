import { describe, it, expect, vi } from "vitest"
import { syncOpportunityDriveFolder } from "./sync"
import type { DriveAdminClient } from "./types"

interface FakeResponses {
  opp?: Record<string, unknown> | null
  driveConfig?: Record<string, unknown> | null
  visibility?: { user_id: string }[]
  users?: { email: string }[]
  pendingList?: { id: string }[]
}

// Minimal chainable Supabase fake: routes results by table + which terminal the
// call used (maybeSingle read vs .update() vs .is().limit() list).
function fakeDb(r: FakeResponses) {
  function resolve(table: string, isUpdate: boolean, isList: boolean) {
    if (table === "opportunities") {
      if (isUpdate) return { data: null, error: null }
      if (isList) return { data: r.pendingList ?? [], error: null }
      return { data: r.opp ?? null, error: null }
    }
    if (table === "drive_config") return { data: r.driveConfig ?? null, error: null }
    if (table === "opportunity_visibility") return { data: r.visibility ?? [], error: null }
    if (table === "users") return { data: r.users ?? [], error: null }
    return { data: null, error: null }
  }
  return {
    from(table: string) {
      const state = { isUpdate: false, isList: false }
      const q: Record<string, unknown> = {
        select: () => q,
        update: () => ((state.isUpdate = true), q),
        eq: () => q,
        in: () => q,
        is: () => ((state.isList = true), q),
        limit: () => q,
        maybeSingle: async () => resolve(table, state.isUpdate, state.isList),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve(resolve(table, state.isUpdate, state.isList)).then(res, rej),
      }
      return q
    },
  }
}

function fakeClient(): DriveAdminClient & {
  ensureFolder: ReturnType<typeof vi.fn>
  syncPermissions: ReturnType<typeof vi.fn>
} {
  return {
    ensureFolder: vi.fn(async ({ name }: { name: string; parentId: string }) => ({
      id: "folder-1",
      name,
    })),
    syncPermissions: vi.fn(async () => {}),
  }
}

describe("syncOpportunityDriveFolder (ORR-698)", () => {
  it("creates the folder and grants the visibility set's emails", async () => {
    const db = fakeDb({
      opp: { id: "opp-1", name: "Big Deal", entity_sales_id: "ent-1", drive_folder_id: null },
      driveConfig: { opportunities_parent_folder_id: "parent-1" },
      visibility: [{ user_id: "u1" }, { user_id: "u2" }],
      users: [{ email: "a@nodwin.com" }, { email: "b@nodwin.com" }],
    })
    const client = fakeClient()

    const res = await syncOpportunityDriveFolder(db as never, client, "opp-1")

    expect(res.status).toBe("synced")
    expect(res.folderId).toBe("folder-1")
    expect(res.grantedCount).toBe(2)
    expect(client.ensureFolder).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: "parent-1", name: expect.stringContaining("Big Deal") }),
    )
    expect(client.syncPermissions).toHaveBeenCalledWith("folder-1", ["a@nodwin.com", "b@nodwin.com"])
  })

  it("skips when the opportunity has no selling entity", async () => {
    const db = fakeDb({
      opp: { id: "opp-1", name: "Deal", entity_sales_id: null, drive_folder_id: null },
    })
    const client = fakeClient()

    const res = await syncOpportunityDriveFolder(db as never, client, "opp-1")

    expect(res.status).toBe("skipped")
    expect(res.reason).toMatch(/selling entity/i)
    expect(client.ensureFolder).not.toHaveBeenCalled()
  })

  it("skips when the selling entity has no configured parent folder", async () => {
    const db = fakeDb({
      opp: { id: "opp-1", name: "Deal", entity_sales_id: "ent-1", drive_folder_id: null },
      driveConfig: { opportunities_parent_folder_id: null },
    })
    const client = fakeClient()

    const res = await syncOpportunityDriveFolder(db as never, client, "opp-1")

    expect(res.status).toBe("skipped")
    expect(res.reason).toMatch(/parent_folder_id/i)
    expect(client.ensureFolder).not.toHaveBeenCalled()
  })
})
