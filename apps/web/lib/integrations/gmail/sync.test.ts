import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NormalizedEmail } from "@/lib/integrations/gmail/gmail-client"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/security/env", () => ({
  env: {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  },
}))

// vi.mock factories are hoisted above const declarations, so the mock fns must
// be created via vi.hoisted to exist when the factories run.
const {
  mockSendAdminAlert,
  mockGetProfile,
  mockListHistory,
  mockListMessageIds,
  mockGetMessage,
  mockGetAttachmentBytes,
  mockStoreDocumentBytes,
  MAX_STORED_DOCUMENT_BYTES,
  DocumentTooLargeError,
} = vi.hoisted(() => {
  class DocumentTooLargeError extends Error {
    constructor(public readonly sizeBytes: number) {
      super("too large")
      this.name = "DocumentTooLargeError"
    }
  }
  return {
    mockSendAdminAlert: vi.fn(() => Promise.resolve("alert-id")),
    mockGetProfile: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    mockListHistory: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    mockListMessageIds: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    mockGetMessage: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    mockGetAttachmentBytes: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    mockStoreDocumentBytes: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    MAX_STORED_DOCUMENT_BYTES: 25 * 1024 * 1024,
    DocumentTooLargeError,
  }
})

vi.mock("@/lib/notifications/admin-alerts", () => ({
  sendAdminAlert: mockSendAdminAlert,
}))

// Keep the real GmailHistoryExpiredError (needed for instanceof) but stub the
// network-touching client methods.
vi.mock("@/lib/integrations/gmail/gmail-client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/integrations/gmail/gmail-client")>()
  return {
    ...actual,
    getProfile: mockGetProfile,
    listHistory: mockListHistory,
    listMessageIds: mockListMessageIds,
    getMessage: mockGetMessage,
    getAttachmentBytes: mockGetAttachmentBytes,
  }
})

// Stub the documents storage seam (ORR-836) so no real Storage/DB is touched.
// DocumentTooLargeError (hoisted above) is a local stand-in for the real class
// thrown by storeDocumentBytes — sync's `instanceof` check must see the same
// class the mock throws, so we throw THIS one from the mock in the oversize test.
vi.mock("@/lib/data/documents", () => ({
  storeDocumentBytes: mockStoreDocumentBytes,
  DocumentTooLargeError,
  MAX_STORED_DOCUMENT_BYTES,
}))

// A single shared fake DB; the @supabase/ssr createServerClient returns it.
let db: FakeDb
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => db),
}))

import { runGmailSyncForUser } from "./sync"

// ---------------------------------------------------------------------------
// Fake Supabase client
// ---------------------------------------------------------------------------

interface DbConfig {
  syncState?: Record<string, unknown> | null
  accounts?: { id: string }[]
  contacts?: { id: string; email?: string }[]
  upsertError?: string | null
}

interface Recorded {
  upserts: Array<{ row: Record<string, unknown>; opts: unknown }>
  stateUpdates: Array<Record<string, unknown>>
  deadletters: Array<Record<string, unknown>>
}

interface FakeDb {
  from: (table: string) => Record<string, unknown>
  recorded: Recorded
}

function makeDb(cfg: DbConfig): FakeDb {
  const recorded: Recorded = {
    upserts: [],
    stateUpdates: [],
    deadletters: [],
  }

  function from(table: string) {
    const state: {
      op: "select" | "update" | "insert" | "upsert"
      payload?: Record<string, unknown>
      opts?: unknown
      eqs: Array<[string, unknown]>
    } = { op: "select", eqs: [] }

    const resolve = () => {
      if (table === "google_gmail_sync_state") {
        if (state.op === "update") {
          recorded.stateUpdates.push(state.payload ?? {})
          return { data: null, error: null }
        }
        return { data: cfg.syncState ?? null, error: null }
      }
      if (table === "activities") {
        if (state.op === "upsert") {
          recorded.upserts.push({ row: state.payload ?? {}, opts: state.opts })
          return {
            data: null,
            error: cfg.upsertError ? { message: cfg.upsertError } : null,
          }
        }
        return { data: null, error: null }
      }
      if (table === "accounts") {
        return { data: cfg.accounts ?? [], error: null }
      }
      if (table === "contacts") {
        return { data: cfg.contacts ?? [], error: null }
      }
      if (table === "inbound_email_deadletter") {
        if (state.op === "insert") {
          recorded.deadletters.push(state.payload ?? {})
          return { data: { id: "dl-1" }, error: null }
        }
        return { data: null, error: null }
      }
      return { data: null, error: null }
    }

    const b: Record<string, unknown> = {}
    const chain = () => b
    b.select = chain
    b.in = chain
    b.or = chain
    b.overlaps = chain
    b.contains = chain
    b.limit = chain
    b.eq = (col: string, val: unknown) => {
      state.eqs.push([col, val])
      return b
    }
    b.update = (p: Record<string, unknown>) => {
      state.op = "update"
      state.payload = p
      return b
    }
    b.insert = (p: Record<string, unknown>) => {
      state.op = "insert"
      state.payload = p
      return b
    }
    b.upsert = (p: Record<string, unknown>, opts: unknown) => {
      state.op = "upsert"
      state.payload = p
      state.opts = opts
      return b
    }
    b.maybeSingle = () => Promise.resolve(resolve())
    b.single = () => Promise.resolve(resolve())
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(resolve()).then(res, rej)
    return b
  }

  return { from, recorded }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER = "user-1"

function enabledState(over: Record<string, unknown> = {}) {
  return {
    user_id: USER,
    sync_enabled: true,
    history_id: null,
    status: "idle",
    ...over,
  }
}

function message(over: Partial<NormalizedEmail> = {}): NormalizedEmail {
  return {
    externalMessageId: "msg-1",
    threadId: "thread-1",
    from: { email: "buyer@acme.com", name: "Buyer" },
    to: [{ email: "rep@nodwin.com" }],
    cc: [],
    subject: "Re: pricing",
    bodyText: "Sounds good.",
    bodyHtml: null,
    snippet: "Sounds good.",
    internalDate: "1700000000000",
    labelIds: ["INBOX"],
    inReplyTo: null,
    references: null,
    attachments: [],
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runGmailSyncForUser (ORR-832)", () => {
  it("maps a message to an email_inbound activity upserted on external_message_id (bootstrap)", async () => {
    db = makeDb({
      syncState: enabledState(),
      accounts: [{ id: "acc-1" }],
      contacts: [{ id: "con-1", email: "buyer@acme.com" }],
    })
    mockGetProfile.mockResolvedValueOnce({ emailAddress: "rep@nodwin.com", historyId: "h-100" })
    mockListMessageIds.mockResolvedValueOnce({ messageIds: ["msg-1"] })
    mockGetMessage.mockResolvedValueOnce(message())

    const res = await runGmailSyncForUser(USER)

    expect(res).toEqual({ upserted: 1, scanned: 1 })
    expect(db.recorded.upserts).toHaveLength(1)
    const { row, opts } = db.recorded.upserts[0]
    expect(opts).toEqual({ onConflict: "external_message_id" })
    expect(row).toMatchObject({
      user_id: USER,
      type: "email_inbound",
      external_message_id: "msg-1",
      external_thread_id: "thread-1",
      subject: "Re: pricing",
      body: "Sounds good.",
      account_id: "acc-1",
      contact_id: "con-1",
      opportunity_id: null,
    })
    expect(row.metadata).toMatchObject({
      snippet: "Sounds good.",
      labelIds: ["INBOX"],
      source: "gmail",
    })
    // Persisted the profile historyId + idle status.
    const finalUpdate = db.recorded.stateUpdates.at(-1)
    expect(finalUpdate).toMatchObject({ history_id: "h-100", status: "idle" })
  })

  it("attributes by contact alone when no account matches", async () => {
    db = makeDb({
      syncState: enabledState(),
      accounts: [],
      contacts: [{ id: "con-1", email: "buyer@acme.com" }],
    })
    mockGetProfile.mockResolvedValueOnce({ emailAddress: "rep@nodwin.com", historyId: "h-1" })
    mockListMessageIds.mockResolvedValueOnce({ messageIds: ["msg-1"] })
    mockGetMessage.mockResolvedValueOnce(message())

    const res = await runGmailSyncForUser(USER)

    expect(res.upserted).toBe(1)
    expect(db.recorded.upserts[0].row).toMatchObject({ account_id: null, contact_id: "con-1" })
  })

  it("NOISE GUARD: skips a message that resolves to no account and no contact", async () => {
    db = makeDb({ syncState: enabledState(), accounts: [], contacts: [] })
    mockGetProfile.mockResolvedValueOnce({ emailAddress: "rep@nodwin.com", historyId: "h-1" })
    mockListMessageIds.mockResolvedValueOnce({ messageIds: ["msg-1"] })
    mockGetMessage.mockResolvedValueOnce(message())

    const res = await runGmailSyncForUser(USER)

    expect(res).toEqual({ upserted: 0, scanned: 1 })
    expect(db.recorded.upserts).toHaveLength(0)
  })

  it("is idempotent across re-runs (same conflict key, no duplicate rows)", async () => {
    db = makeDb({
      syncState: enabledState(),
      accounts: [{ id: "acc-1" }],
      contacts: [],
    })
    mockGetProfile.mockResolvedValue({ emailAddress: "rep@nodwin.com", historyId: "h-1" })
    mockListMessageIds.mockResolvedValue({ messageIds: ["msg-1"] })
    mockGetMessage.mockResolvedValue(message())

    await runGmailSyncForUser(USER)
    const firstKey = db.recorded.upserts[0].row.external_message_id

    db.recorded.upserts.length = 0
    await runGmailSyncForUser(USER)
    const secondKey = db.recorded.upserts[0].row.external_message_id

    expect(firstKey).toBe(secondKey)
    expect(db.recorded.upserts[0].opts).toEqual({ onConflict: "external_message_id" })
  })

  it("uses the History API incrementally when a history_id cursor is present", async () => {
    db = makeDb({
      syncState: enabledState({ history_id: "h-50" }),
      accounts: [{ id: "acc-1" }],
      contacts: [],
    })
    mockListHistory.mockResolvedValueOnce({ addedMessageIds: ["msg-9"], historyId: "h-60" })
    mockGetMessage.mockResolvedValueOnce(message({ externalMessageId: "msg-9" }))

    const res = await runGmailSyncForUser(USER)

    expect(res).toEqual({ upserted: 1, scanned: 1 })
    expect(mockListHistory).toHaveBeenCalledOnce()
    expect(mockListHistory.mock.calls[0][0]).toMatchObject({ startHistoryId: "h-50" })
    expect(mockListMessageIds).not.toHaveBeenCalled()
    // Cursor advanced to the mailbox's latest historyId.
    expect(db.recorded.stateUpdates.at(-1)).toMatchObject({ history_id: "h-60", status: "idle" })
  })

  it("full-bootstraps when the history cursor is expired (404)", async () => {
    const { GmailHistoryExpiredError } = await import(
      "@/lib/integrations/gmail/gmail-client"
    )
    db = makeDb({
      syncState: enabledState({ history_id: "h-stale" }),
      accounts: [{ id: "acc-1" }],
      contacts: [],
    })
    mockListHistory.mockRejectedValueOnce(new GmailHistoryExpiredError())
    mockGetProfile.mockResolvedValueOnce({ emailAddress: "rep@nodwin.com", historyId: "h-200" })
    mockListMessageIds.mockResolvedValueOnce({ messageIds: ["msg-1"] })
    mockGetMessage.mockResolvedValueOnce(message())

    const res = await runGmailSyncForUser(USER)

    expect(res.upserted).toBe(1)
    expect(mockListHistory).toHaveBeenCalledOnce()
    expect(mockGetProfile).toHaveBeenCalledOnce()
    expect(mockListMessageIds).toHaveBeenCalledOnce()
    expect(db.recorded.stateUpdates.at(-1)).toMatchObject({ history_id: "h-200", status: "idle" })
  })

  it("paginates the bootstrap message list", async () => {
    db = makeDb({
      syncState: enabledState(),
      accounts: [{ id: "acc-1" }],
      contacts: [],
    })
    mockGetProfile.mockResolvedValueOnce({ emailAddress: "rep@nodwin.com", historyId: "h-1" })
    mockListMessageIds
      .mockResolvedValueOnce({ messageIds: ["msg-1"], nextPageToken: "p2" })
      .mockResolvedValueOnce({ messageIds: ["msg-2"] })
    mockGetMessage
      .mockResolvedValueOnce(message({ externalMessageId: "msg-1" }))
      .mockResolvedValueOnce(message({ externalMessageId: "msg-2" }))

    const res = await runGmailSyncForUser(USER)

    expect(res).toEqual({ upserted: 2, scanned: 2 })
    expect(mockListMessageIds).toHaveBeenCalledTimes(2)
  })

  it("skips a user whose sync is disabled", async () => {
    db = makeDb({ syncState: enabledState({ sync_enabled: false }) })

    const res = await runGmailSyncForUser(USER)

    expect(res).toEqual({ skipped: true, upserted: 0, scanned: 0 })
    expect(mockGetProfile).not.toHaveBeenCalled()
    expect(mockListHistory).not.toHaveBeenCalled()
    expect(db.recorded.upserts).toHaveLength(0)
  })

  it("skips a user with no sync-state row", async () => {
    db = makeDb({ syncState: null })

    const res = await runGmailSyncForUser(USER)

    expect(res).toEqual({ skipped: true, upserted: 0, scanned: 0 })
    expect(mockGetProfile).not.toHaveBeenCalled()
  })

  it("records status=error + dead-letter + admin alert on failure", async () => {
    db = makeDb({ syncState: enabledState() })
    mockGetProfile.mockRejectedValueOnce(new Error("boom"))

    await expect(runGmailSyncForUser(USER)).rejects.toThrow("boom")

    const errorUpdate = db.recorded.stateUpdates.find((u) => u.status === "error")
    expect(errorUpdate).toMatchObject({ status: "error", last_error: "boom" })
    expect(db.recorded.deadletters).toHaveLength(1)
    expect(mockSendAdminAlert).toHaveBeenCalledOnce()
    // Dead-letter never carries a token — only the user id + reason.
    expect(db.recorded.deadletters[0]).toMatchObject({ from_address: `gmail-sync:${USER}` })
  })
})

// ---------------------------------------------------------------------------
// Attachment byte persistence (ORR-836)
// ---------------------------------------------------------------------------

const attachment = (
  over: Partial<import("@/lib/integrations/gmail/gmail-client").NormalizedEmailAttachment> = {},
) => ({
  filename: "deck.pdf",
  mimeType: "application/pdf",
  size: 20480,
  attachmentId: "att-1",
  ...over,
})

describe("Gmail attachment persistence (ORR-836)", () => {
  it("fetches bytes, stores a document linked to the account, and records the ref", async () => {
    db = makeDb({
      syncState: enabledState(),
      accounts: [{ id: "acc-1" }],
      contacts: [],
    })
    mockGetProfile.mockResolvedValueOnce({ emailAddress: "rep@nodwin.com", historyId: "h-1" })
    mockListMessageIds.mockResolvedValueOnce({ messageIds: ["msg-1"] })
    mockGetMessage.mockResolvedValueOnce(message({ attachments: [attachment()] }))
    const bytes = Buffer.from([1, 2, 3, 4])
    mockGetAttachmentBytes.mockResolvedValueOnce(bytes)
    mockStoreDocumentBytes.mockResolvedValueOnce({
      id: "doc-1",
      bucket: "documents",
      storagePath: "acc-1/uuid-deck.pdf",
      sizeBytes: 4,
    })

    const res = await runGmailSyncForUser(USER)

    expect(res.upserted).toBe(1)
    // Bytes fetched for the right message + attachment.
    expect(mockGetAttachmentBytes).toHaveBeenCalledWith({
      userId: USER,
      messageId: "msg-1",
      attachmentId: "att-1",
    })
    // Stored, linked to the matched account, attributed to the syncing user.
    expect(mockStoreDocumentBytes).toHaveBeenCalledOnce()
    expect(mockStoreDocumentBytes.mock.calls[0][0]).toMatchObject({
      accountId: "acc-1",
      name: "deck.pdf",
      mimeType: "application/pdf",
      bytes,
      uploadedBy: USER,
    })
    // The activity records the resulting document ref on metadata.attachments.
    const meta = db.recorded.upserts[0].row.metadata as {
      attachments: Array<Record<string, unknown>>
    }
    expect(meta.attachments).toHaveLength(1)
    expect(meta.attachments[0]).toMatchObject({
      filename: "deck.pdf",
      attachmentId: "att-1",
      stored: true,
      documentId: "doc-1",
      storagePath: "acc-1/uuid-deck.pdf",
    })
  })

  it("skips an oversize attachment (declared size over the cap) without fetching bytes", async () => {
    db = makeDb({
      syncState: enabledState(),
      accounts: [{ id: "acc-1" }],
      contacts: [],
    })
    mockGetProfile.mockResolvedValueOnce({ emailAddress: "rep@nodwin.com", historyId: "h-1" })
    mockListMessageIds.mockResolvedValueOnce({ messageIds: ["msg-1"] })
    mockGetMessage.mockResolvedValueOnce(
      message({
        attachments: [attachment({ size: MAX_STORED_DOCUMENT_BYTES + 1 })],
      }),
    )

    const res = await runGmailSyncForUser(USER)

    expect(res.upserted).toBe(1)
    expect(mockGetAttachmentBytes).not.toHaveBeenCalled()
    expect(mockStoreDocumentBytes).not.toHaveBeenCalled()
    const meta = db.recorded.upserts[0].row.metadata as {
      attachments: Array<Record<string, unknown>>
    }
    expect(meta.attachments[0]).toMatchObject({ stored: false, reason: "oversize" })
  })

  it("records oversize when the ACTUAL bytes exceed the cap (declared size lied)", async () => {
    db = makeDb({
      syncState: enabledState(),
      accounts: [{ id: "acc-1" }],
      contacts: [],
    })
    mockGetProfile.mockResolvedValueOnce({ emailAddress: "rep@nodwin.com", historyId: "h-1" })
    mockListMessageIds.mockResolvedValueOnce({ messageIds: ["msg-1"] })
    mockGetMessage.mockResolvedValueOnce(message({ attachments: [attachment({ size: 10 })] }))
    mockGetAttachmentBytes.mockResolvedValueOnce(Buffer.from([1, 2, 3]))
    mockStoreDocumentBytes.mockRejectedValueOnce(new DocumentTooLargeError(9_999_999))

    const res = await runGmailSyncForUser(USER)

    expect(res.upserted).toBe(1)
    const meta = db.recorded.upserts[0].row.metadata as {
      attachments: Array<Record<string, unknown>>
    }
    expect(meta.attachments[0]).toMatchObject({ stored: false, reason: "oversize" })
  })

  it("keeps attachments metadata-only when only a contact (no account) matched", async () => {
    db = makeDb({
      syncState: enabledState(),
      accounts: [],
      contacts: [{ id: "con-1", email: "buyer@acme.com" }],
    })
    mockGetProfile.mockResolvedValueOnce({ emailAddress: "rep@nodwin.com", historyId: "h-1" })
    mockListMessageIds.mockResolvedValueOnce({ messageIds: ["msg-1"] })
    mockGetMessage.mockResolvedValueOnce(message({ attachments: [attachment()] }))

    const res = await runGmailSyncForUser(USER)

    expect(res.upserted).toBe(1)
    // No account entity to own a document row → no fetch/store, metadata only.
    expect(mockGetAttachmentBytes).not.toHaveBeenCalled()
    expect(mockStoreDocumentBytes).not.toHaveBeenCalled()
    const meta = db.recorded.upserts[0].row.metadata as {
      attachments: Array<Record<string, unknown>>
    }
    expect(meta.attachments[0]).toMatchObject({ stored: false, reason: "no-account" })
  })

  it("records error (and never aborts) when a single attachment fetch fails", async () => {
    db = makeDb({
      syncState: enabledState(),
      accounts: [{ id: "acc-1" }],
      contacts: [],
    })
    mockGetProfile.mockResolvedValueOnce({ emailAddress: "rep@nodwin.com", historyId: "h-1" })
    mockListMessageIds.mockResolvedValueOnce({ messageIds: ["msg-1"] })
    mockGetMessage.mockResolvedValueOnce(message({ attachments: [attachment()] }))
    mockGetAttachmentBytes.mockRejectedValueOnce(new Error("network boom"))

    const res = await runGmailSyncForUser(USER)

    // The message still lands as an activity; the attachment is marked failed.
    expect(res.upserted).toBe(1)
    const meta = db.recorded.upserts[0].row.metadata as {
      attachments: Array<Record<string, unknown>>
    }
    expect(meta.attachments[0]).toMatchObject({ stored: false, reason: "error" })
  })
})
