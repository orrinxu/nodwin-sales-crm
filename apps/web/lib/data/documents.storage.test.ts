import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/security/env", () => ({
  env: {
    SUPABASE_URL: "http://localhost:54321",
    SUPABASE_SERVICE_ROLE_KEY: "svc-key",
    SUPABASE_ANON_KEY: "anon-key",
    NODE_ENV: "test",
    NEXT_PUBLIC_ENV: "test",
  },
}))

// The user (RLS-scoped) client — its per-table results are configured per test.
type Result = { data: unknown; error: unknown }
const userResults = new Map<string, Result>()
// Storage stub + a spy on object removal.
const removeSpy = vi.fn().mockResolvedValue({ data: [], error: null })
const createSignedUploadUrl = vi
  .fn()
  .mockResolvedValue({ data: { token: "tok", signedUrl: "https://up" }, error: null })
const createSignedUrl = vi
  .fn()
  .mockResolvedValue({ data: { signedUrl: "https://dl" }, error: null })

// Records every table insert/update so tests can assert the persisted payload.
const insertSpy = vi.fn()
const updateSpy = vi.fn()
// Optional per-table result for UPDATE probes (falls back to the select result).
const updateResults = new Map<string, Result>()

function builder(result: Result, table: string) {
  let isUpdate = false
  const b = {
    select: () => b,
    insert: (payload: unknown) => {
      insertSpy(table, payload)
      return b
    },
    update: (payload: unknown) => {
      updateSpy(table, payload)
      isUpdate = true
      return b
    },
    delete: () => b,
    eq: () => b,
    order: () => b,
    maybeSingle: () =>
      Promise.resolve(isUpdate ? (updateResults.get(table) ?? result) : result),
    single: () => Promise.resolve(isUpdate ? (updateResults.get(table) ?? result) : result),
    // Awaitable: `await query` (list path) resolves to the same result.
    then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onF, onR),
  }
  return b
}

/** The payload passed to `.from(table).update(...)` in the current test. */
function updatePayload(table = "documents"): Record<string, unknown> | undefined {
  const call = updateSpy.mock.calls.find(([t]) => t === table)
  return call?.[1] as Record<string, unknown> | undefined
}

const NO_ROW: Result = { data: null, error: null }
const userClient = { from: (table: string) => builder(userResults.get(table) ?? NO_ROW, table) }
const serviceClient = {
  from: (table: string) => builder(userResults.get(`svc:${table}`) ?? NO_ROW, `svc:${table}`),
  storage: { from: () => ({ createSignedUploadUrl, createSignedUrl, remove: removeSpy }) },
}

/** The payload passed to `.from("documents").insert(...)` in the current test. */
function documentInsertPayload(): Record<string, unknown> | undefined {
  const call = insertSpy.mock.calls.find(([table]) => table === "documents")
  return call?.[1] as Record<string, unknown> | undefined
}

vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn(async () => userClient) }))
// serviceRoleClient() builds its client via @supabase/ssr's createServerClient.
vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn(() => serviceClient) }))

const ctx = { user: { id: "u1", email: "rep@nodwin.com", role: "sales_rep" }, source: "web" as const }

beforeEach(() => {
  vi.clearAllMocks()
  userResults.clear()
  updateResults.clear()
})

describe("createStoredDocument", () => {
  it("rejects when the caller cannot access the target opportunity", async () => {
    userResults.set("opportunities", { data: null, error: null }) // RLS hides it
    const { createStoredDocument } = await import("./documents")
    await expect(
      createStoredDocument(ctx, {
        opportunityId: "00000000-0000-0000-0000-000000000001",
        name: "P.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        category: "proposal",
      }),
    ).rejects.toThrow(/do not have access/i)
    expect(createSignedUploadUrl).not.toHaveBeenCalled()
  })

  it("inserts the row and returns a signed upload URL on success", async () => {
    userResults.set("opportunities", { data: { id: "opp1" }, error: null })
    userResults.set("documents", { data: { id: "doc1" }, error: null })
    const { createStoredDocument } = await import("./documents")
    const handle = await createStoredDocument(ctx, {
      opportunityId: "00000000-0000-0000-0000-000000000001",
      name: "Proposal v2.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      category: "proposal",
    })
    expect(handle.id).toBe("doc1")
    expect(handle.bucket).toBe("documents")
    expect(handle.uploadToken).toBe("tok")
    expect(createSignedUploadUrl).toHaveBeenCalledTimes(1)
    // path is namespaced under the entity id and the filename is sanitised
    expect(handle.storagePath).toMatch(/^00000000-0000-0000-0000-000000000001\/.+Proposal_v2\.pdf$/)
    // A direct upload carries no Drive provenance.
    expect(documentInsertPayload()).toMatchObject({
      drive_file_id: null,
      drive_folder_id: null,
      link_url: null,
    })
  })

  it("persists Drive provenance for a file imported from Drive", async () => {
    userResults.set("opportunities", { data: { id: "opp1" }, error: null })
    userResults.set("documents", { data: { id: "doc1" }, error: null })
    const { createStoredDocument } = await import("./documents")
    const handle = await createStoredDocument(ctx, {
      opportunityId: "00000000-0000-0000-0000-000000000001",
      name: "Imported.pdf",
      mimeType: "application/pdf",
      sizeBytes: 100,
      category: "proposal",
      driveFileId: "drv-1",
      driveFolderId: "fld-1",
      linkUrl: "https://drive.google.com/file/d/drv-1/view",
    })
    // Bytes are still copied into Storage (storage_path set) AND the Drive id is
    // recorded as provenance — so the file is on the VPS, not Drive-referenced.
    expect(createSignedUploadUrl).toHaveBeenCalledTimes(1)
    expect(documentInsertPayload()).toMatchObject({
      storage_path: handle.storagePath,
      drive_file_id: "drv-1",
      drive_folder_id: "fld-1",
      link_url: "https://drive.google.com/file/d/drv-1/view",
    })
  })
})

describe("deleteStoredDocument", () => {
  it("removes the stored object after the row is deleted", async () => {
    userResults.set("documents", { data: [{ storage_path: "opp1/abc-file.pdf" }], error: null })
    const { deleteStoredDocument } = await import("./documents")
    await deleteStoredDocument(ctx, "doc1")
    expect(removeSpy).toHaveBeenCalledWith(["opp1/abc-file.pdf"])
  })

  it("throws when RLS blocks the delete (no row removed)", async () => {
    userResults.set("documents", { data: [], error: null })
    const { deleteStoredDocument } = await import("./documents")
    await expect(deleteStoredDocument(ctx, "doc1")).rejects.toThrow(/permission to delete/i)
    expect(removeSpy).not.toHaveBeenCalled()
  })
})

describe("createReplacementUpload (ORR-802 step 1)", () => {
  const input = {
    documentId: "00000000-0000-0000-0000-0000000000d1",
    name: "Proposal v3.pdf",
    mimeType: "application/pdf",
    sizeBytes: 4096,
  }
  const existingDoc = {
    id: "d1",
    opportunity_id: "opp1",
    account_id: null,
    storage_path: "opp1/old-object.pdf",
  }

  it("mints an upload URL for a FRESH path WITHOUT repointing the row or deleting the old object", async () => {
    userResults.set("documents", { data: existingDoc, error: null })
    const { createReplacementUpload } = await import("./documents")
    const handle = await createReplacementUpload(ctx, input)

    // A fresh path under the same entity is handed to the client to upload to.
    expect(handle.storagePath).toMatch(/^opp1\/.+Proposal_v3\.pdf$/)
    expect(handle.storagePath).not.toBe(existingDoc.storage_path)
    expect(createSignedUploadUrl).toHaveBeenCalledTimes(1)
    expect(createSignedUploadUrl).toHaveBeenCalledWith(handle.storagePath)

    // The invariant: the old bytes are NOT destroyed and the row is NOT repointed
    // before the client has uploaded the replacement.
    expect(removeSpy).not.toHaveBeenCalled()
    // The only UPDATE is the no-op authz probe against the CURRENT path — never
    // the new one.
    expect(updatePayload()).toEqual({ storage_path: existingDoc.storage_path })
  })

  it("rejects when RLS allows SEE but not WRITE (authz probe returns 0 rows)", async () => {
    userResults.set("documents", { data: existingDoc, error: null })
    updateResults.set("documents", { data: null, error: null }) // UPDATE probe blocked
    const { createReplacementUpload } = await import("./documents")
    await expect(createReplacementUpload(ctx, input)).rejects.toThrow(/permission to replace/i)
    // No destructive side effects and no upload URL minted.
    expect(removeSpy).not.toHaveBeenCalled()
    expect(createSignedUploadUrl).not.toHaveBeenCalled()
  })

  it("rejects when the doc is not visible", async () => {
    userResults.set("documents", { data: null, error: null })
    const { createReplacementUpload } = await import("./documents")
    await expect(createReplacementUpload(ctx, input)).rejects.toThrow(/not found or not accessible/i)
    expect(removeSpy).not.toHaveBeenCalled()
    expect(createSignedUploadUrl).not.toHaveBeenCalled()
  })
})

describe("confirmReplacementUpload (ORR-802 step 2)", () => {
  const existingDoc = {
    id: "d1",
    opportunity_id: "opp1",
    account_id: null,
    storage_path: "opp1/old-object.pdf",
  }
  const confirm = {
    documentId: "00000000-0000-0000-0000-0000000000d1",
    newPath: "opp1/new-object.pdf",
    mimeType: "application/pdf",
    sizeBytes: 4096,
  }

  it("repoints the row to the new path, resets to pending, THEN deletes the old object", async () => {
    userResults.set("documents", { data: existingDoc, error: null })
    const { confirmReplacementUpload } = await import("./documents")
    await confirmReplacementUpload(ctx, confirm)

    expect(updatePayload()).toEqual({
      storage_path: "opp1/new-object.pdf",
      mime_type: "application/pdf",
      size_bytes: 4096,
      index_status: "pending",
      index_error: null,
    })
    // The old object is removed only now — after the row no longer references it.
    expect(removeSpy).toHaveBeenCalledWith(["opp1/old-object.pdf"])
  })

  it("does NOT delete the object on a same-path replace", async () => {
    userResults.set("documents", {
      data: { ...existingDoc, storage_path: "opp1/new-object.pdf" },
      error: null,
    })
    const { confirmReplacementUpload } = await import("./documents")
    await confirmReplacementUpload(ctx, confirm)
    expect(removeSpy).not.toHaveBeenCalled()
  })

  it("rejects a newPath not scoped to the doc's entity (no repoint, no delete)", async () => {
    userResults.set("documents", { data: existingDoc, error: null })
    const { confirmReplacementUpload } = await import("./documents")
    await expect(
      confirmReplacementUpload(ctx, { ...confirm, newPath: "other-entity/x.pdf" }),
    ).rejects.toThrow(/not scoped to the document's entity/i)
    expect(updateSpy).not.toHaveBeenCalled()
    expect(removeSpy).not.toHaveBeenCalled()
  })

  it("rejects when RLS blocks the commit UPDATE (no old object deleted)", async () => {
    userResults.set("documents", { data: existingDoc, error: null })
    updateResults.set("documents", { data: null, error: null })
    const { confirmReplacementUpload } = await import("./documents")
    await expect(confirmReplacementUpload(ctx, confirm)).rejects.toThrow(/permission to replace/i)
    expect(removeSpy).not.toHaveBeenCalled()
  })
})

describe("createDocumentDownloadUrl", () => {
  it("returns a signed URL for a stored document", async () => {
    userResults.set("documents", {
      data: { name: "P.pdf", storage_path: "opp1/x.pdf", link_url: null },
      error: null,
    })
    const { createDocumentDownloadUrl } = await import("./documents")
    const res = await createDocumentDownloadUrl(ctx, "doc1")
    expect(res).toEqual({ url: "https://dl", name: "P.pdf" })
  })

  it("returns null when the document is not visible", async () => {
    userResults.set("documents", { data: null, error: null })
    const { createDocumentDownloadUrl } = await import("./documents")
    expect(await createDocumentDownloadUrl(ctx, "doc1")).toBeNull()
  })
})

describe("listDocumentsForEntity", () => {
  it("maps rows and derives hasFile from storage_path", async () => {
    userResults.set("documents", {
      data: [
        { id: "d1", name: "Stored.pdf", category: "proposal", mime_type: "application/pdf", size_bytes: 5, storage_path: "opp1/a.pdf", drive_file_id: null, link_url: null, uploaded_by: "u1", uploaded_at: "t", index_status: null },
        { id: "d2", name: "Drive.doc", category: "other", mime_type: "application/msword", size_bytes: null, storage_path: null, drive_file_id: "drv", link_url: "http://drive", uploaded_by: "u1", uploaded_at: "t", index_status: null },
      ],
      error: null,
    })
    const { listDocumentsForEntity } = await import("./documents")
    const rows = await listDocumentsForEntity(ctx, { opportunityId: "opp1" })
    expect(rows).toHaveLength(2)
    expect(rows[0].hasFile).toBe(true)
    expect(rows[1].hasFile).toBe(false)
    expect(rows[1].driveLinkUrl).toBe("http://drive")
  })
})
