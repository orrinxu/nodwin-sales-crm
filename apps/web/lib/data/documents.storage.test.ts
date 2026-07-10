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

// Records every table insert so tests can assert the persisted payload.
const insertSpy = vi.fn()

function builder(result: Result, table: string) {
  const b = {
    select: () => b,
    insert: (payload: unknown) => {
      insertSpy(table, payload)
      return b
    },
    update: () => b,
    delete: () => b,
    eq: () => b,
    order: () => b,
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    // Awaitable: `await query` (list path) resolves to the same result.
    then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onF, onR),
  }
  return b
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
