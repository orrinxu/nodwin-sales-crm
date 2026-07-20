import { describe, it, expect, vi } from "vitest"
import {
  syncOpportunityDriveFolder,
  syncPendingOpportunityFolders,
  reconcileStaleOpportunityPermissions,
} from "./sync"
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

// Richer fake that records `.update()` payloads and routes the drain's list query
// (pending = `.is(drive_folder_id,null)…`, stale = `.eq(drive_sync_status,'stale')`).
interface DrainFakeResponses {
  pendingList?: { id: string }[]
  staleList?: { id: string }[]
  opp?: Record<string, unknown> | null
  driveConfig?: Record<string, unknown> | null
  visibility?: { user_id: string }[]
  users?: { email: string }[]
}

function drainFakeDb(r: DrainFakeResponses) {
  const updates: { table: string; id: string | null; payload: Record<string, unknown> }[] = []
  function resolve(
    table: string,
    s: { isUpdate: boolean; isList: boolean; isStale: boolean },
  ) {
    if (table === "opportunities") {
      if (s.isUpdate) return { data: null, error: null }
      if (s.isList) return { data: (s.isStale ? r.staleList : r.pendingList) ?? [], error: null }
      return { data: r.opp ?? null, error: null }
    }
    if (table === "drive_config") return { data: r.driveConfig ?? null, error: null }
    if (table === "opportunity_visibility") return { data: r.visibility ?? [], error: null }
    if (table === "users") return { data: r.users ?? [], error: null }
    return { data: null, error: null }
  }
  const db = {
    _updates: updates,
    from(table: string) {
      const s = {
        isUpdate: false,
        isList: false,
        isStale: false,
        id: null as string | null,
        payload: {} as Record<string, unknown>,
      }
      const q: Record<string, unknown> = {
        select: () => q,
        update: (payload: Record<string, unknown>) => ((s.isUpdate = true), (s.payload = payload), q),
        eq: (col: string, val: unknown) => {
          if (col === "id") s.id = val as string
          if (col === "drive_sync_status" && val === "stale") s.isStale = true
          return q
        },
        in: () => q,
        is: () => q,
        or: () => q,
        order: () => q,
        limit: () => ((s.isList = true), q),
        maybeSingle: async () => resolve(table, s),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
          if (s.isUpdate) updates.push({ table, id: s.id, payload: s.payload })
          return Promise.resolve(resolve(table, s)).then(res, rej)
        },
      }
      return q
    },
  }
  return db
}

describe("syncPendingOpportunityFolders drain (ORR-810a)", () => {
  it("parks a permanently-skipped row with drive_sync_status='skipped'", async () => {
    const db = drainFakeDb({
      pendingList: [{ id: "opp-skip" }],
      opp: { id: "opp-skip", name: "Deal", entity_sales_id: null, drive_folder_id: null },
    })
    const client = fakeClient()

    const results = await syncPendingOpportunityFolders(db as never, client, 25)

    expect(results).toHaveLength(1)
    expect(results[0].status).toBe("skipped")
    expect(client.ensureFolder).not.toHaveBeenCalled()
    // The skip-marker leaves the row out of the next batch's hot path.
    const parked = db._updates.find((u) => u.payload.drive_sync_status === "skipped")
    expect(parked?.id).toBe("opp-skip")
  })

  it("marks a transient failure with a backoff next_attempt_at", async () => {
    const db = drainFakeDb({
      pendingList: [{ id: "opp-fail" }],
      opp: { id: "opp-fail", name: "Deal", entity_sales_id: "ent-1", drive_folder_id: null },
      driveConfig: { opportunities_parent_folder_id: "parent-1" },
    })
    const client = fakeClient()
    client.ensureFolder.mockRejectedValueOnce(new Error("Drive 500"))

    const results = await syncPendingOpportunityFolders(db as never, client, 25)

    expect(results[0].status).toBe("failed")
    const backedOff = db._updates.find((u) => u.payload.drive_sync_status === "failed")
    expect(backedOff?.id).toBe("opp-fail")
    expect(backedOff?.payload.drive_sync_next_attempt_at).toBeTruthy()
  })
})

describe("reconcileStaleOpportunityPermissions drain (ORR-810b)", () => {
  it("re-runs syncPermissions for a stale folder-having row and clears it to synced", async () => {
    const db = drainFakeDb({
      staleList: [{ id: "opp-1" }],
      opp: { id: "opp-1", name: "Big Deal", entity_sales_id: "ent-1", drive_folder_id: "folder-1" },
      driveConfig: { opportunities_parent_folder_id: "parent-1" },
      visibility: [{ user_id: "u1" }],
      users: [{ email: "a@nodwin.com" }],
    })
    const client = fakeClient()

    const results = await reconcileStaleOpportunityPermissions(db as never, client, 25)

    expect(results).toHaveLength(1)
    expect(results[0].status).toBe("synced")
    // The security-critical revoke/grant re-runs against the current visibility set.
    expect(client.syncPermissions).toHaveBeenCalledWith("folder-1", ["a@nodwin.com"])
    const cleared = db._updates.find((u) => u.payload.drive_sync_status === "synced")
    expect(cleared?.id).toBe("opp-1")
  })

  it("processes nothing when no rows are stale", async () => {
    const db = drainFakeDb({ staleList: [] })
    const client = fakeClient()

    const results = await reconcileStaleOpportunityPermissions(db as never, client, 25)

    expect(results).toHaveLength(0)
    expect(client.syncPermissions).not.toHaveBeenCalled()
  })
})
