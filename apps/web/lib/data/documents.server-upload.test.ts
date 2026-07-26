// @vitest-environment node
// Server 'bytes -> Storage' path (ORR-836). Node runtime gives us the real
// Buffer / Uint8Array used for byte sizing.
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/security/env", () => ({
  env: {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  },
}))

// storeDocumentBytes runs entirely on the service-role client (@supabase/ssr).
// @/lib/supabase/server is only used by the user-scoped functions, but the
// module imports it at load time, so stub it too.
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(),
}))

interface Recorded {
  uploads: Array<{ path: string; body: unknown; opts: unknown }>
  inserts: Array<Record<string, unknown>>
  removes: string[][]
}

let recorded: Recorded
let uploadError: string | null
let insertError: string | null

function makeDb() {
  const storage = {
    from: () => ({
      upload: (path: string, body: unknown, opts: unknown) => {
        recorded.uploads.push({ path, body, opts })
        return Promise.resolve({
          data: uploadError ? null : { path },
          error: uploadError ? { message: uploadError } : null,
        })
      },
      remove: (paths: string[]) => {
        recorded.removes.push(paths)
        return Promise.resolve({ data: null, error: null })
      },
    }),
  }
  function from() {
    const state: { payload?: Record<string, unknown> } = {}
    const b: Record<string, unknown> = {}
    b.insert = (p: Record<string, unknown>) => {
      state.payload = p
      recorded.inserts.push(p)
      return b
    }
    b.select = () => b
    b.single = () =>
      Promise.resolve({
        data: insertError ? null : { id: "doc-new" },
        error: insertError ? { message: insertError } : null,
      })
    return b
  }
  return { storage, from }
}

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => makeDb()),
}))

import {
  storeDocumentBytes,
  DocumentTooLargeError,
  MAX_STORED_DOCUMENT_BYTES,
} from "./documents"

beforeEach(() => {
  vi.clearAllMocks()
  recorded = { uploads: [], inserts: [], removes: [] }
  uploadError = null
  insertError = null
})

describe("storeDocumentBytes (ORR-836)", () => {
  it("uploads bytes and inserts a documents row linked to the account", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5])

    const ref = await storeDocumentBytes({
      accountId: "acc-1",
      name: "deck.pdf",
      mimeType: "application/pdf",
      bytes,
      uploadedBy: "user-1",
    })

    expect(ref).toMatchObject({
      id: "doc-new",
      bucket: "documents",
      sizeBytes: 5,
    })
    // Path shape: `<entityId>/<uuid>-<safe filename>` from storageObjectPath.
    expect(ref.storagePath).toMatch(
      /^acc-1\/[0-9a-f-]{36}-deck\.pdf$/,
    )
    expect(recorded.uploads).toHaveLength(1)
    expect(recorded.uploads[0].path).toBe(ref.storagePath)
    expect(recorded.uploads[0].opts).toEqual({
      contentType: "application/pdf",
      upsert: false,
    })

    // Row linked to the account, sized, and attributed to the syncing user.
    expect(recorded.inserts).toHaveLength(1)
    expect(recorded.inserts[0]).toMatchObject({
      account_id: "acc-1",
      opportunity_id: null,
      storage_path: ref.storagePath,
      size_bytes: 5,
      name: "deck.pdf",
      mime_type: "application/pdf",
      category: "other",
      uploaded_by: "user-1",
    })
  })

  it("links to an opportunity when opportunityId is given", async () => {
    const ref = await storeDocumentBytes({
      opportunityId: "opp-9",
      name: "quote.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: new Uint8Array([9]),
      uploadedBy: "user-1",
    })
    expect(ref.storagePath).toMatch(/^opp-9\//)
    expect(recorded.inserts[0]).toMatchObject({
      opportunity_id: "opp-9",
      account_id: null,
    })
  })

  it("rejects bytes over the 25 MiB cap BEFORE any upload", async () => {
    const oversize = new Uint8Array(MAX_STORED_DOCUMENT_BYTES + 1)

    await expect(
      storeDocumentBytes({
        accountId: "acc-1",
        name: "huge.bin",
        mimeType: "application/octet-stream",
        bytes: oversize,
        uploadedBy: "user-1",
      }),
    ).rejects.toBeInstanceOf(DocumentTooLargeError)

    expect(recorded.uploads).toHaveLength(0)
    expect(recorded.inserts).toHaveLength(0)
  })

  it("accepts bytes exactly at the cap", async () => {
    const atCap = new Uint8Array(MAX_STORED_DOCUMENT_BYTES)
    await expect(
      storeDocumentBytes({
        accountId: "acc-1",
        name: "max.bin",
        mimeType: "application/octet-stream",
        bytes: atCap,
        uploadedBy: "user-1",
      }),
    ).resolves.toMatchObject({ sizeBytes: MAX_STORED_DOCUMENT_BYTES })
  })

  it("requires an opportunity or account", async () => {
    await expect(
      storeDocumentBytes({
        name: "orphan.pdf",
        mimeType: "application/pdf",
        bytes: new Uint8Array([1]),
        uploadedBy: "user-1",
      }),
    ).rejects.toThrow(/opportunity or an account/)
    expect(recorded.uploads).toHaveLength(0)
  })

  it("defaults an empty mime type to application/octet-stream", async () => {
    await storeDocumentBytes({
      accountId: "acc-1",
      name: "file",
      mimeType: "",
      bytes: new Uint8Array([1]),
      uploadedBy: "user-1",
    })
    expect(recorded.uploads[0].opts).toMatchObject({
      contentType: "application/octet-stream",
    })
    expect(recorded.inserts[0]).toMatchObject({
      mime_type: "application/octet-stream",
    })
  })

  it("removes the orphaned object when the row insert fails", async () => {
    insertError = "insert boom"

    await expect(
      storeDocumentBytes({
        accountId: "acc-1",
        name: "deck.pdf",
        mimeType: "application/pdf",
        bytes: new Uint8Array([1, 2, 3]),
        uploadedBy: "user-1",
      }),
    ).rejects.toThrow(/Failed to create document row/)

    // The just-uploaded object is cleaned up so no bytes are orphaned.
    expect(recorded.uploads).toHaveLength(1)
    expect(recorded.removes).toEqual([[recorded.uploads[0].path]])
  })

  it("throws (and does not insert) when the upload fails", async () => {
    uploadError = "upload boom"

    await expect(
      storeDocumentBytes({
        accountId: "acc-1",
        name: "deck.pdf",
        mimeType: "application/pdf",
        bytes: new Uint8Array([1, 2, 3]),
        uploadedBy: "user-1",
      }),
    ).rejects.toThrow(/Failed to upload document bytes/)
    expect(recorded.inserts).toHaveLength(0)
  })
})
