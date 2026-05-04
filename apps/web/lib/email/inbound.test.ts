import { describe, it, expect, vi } from "vitest"
import {
  handleInboundEmail,
  extractInboundToken,
  extractEmailAddress,
  isSenderAuthorized,
  type PostmarkInboundPayload,
  type PostmarkEmailAddress,
  type InboundEmailDb,
} from "./inbound"

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const INBOUND_TOKEN = "crm-test-inbound-token"
const CRM_ADDRESS = `${INBOUND_TOKEN}@crm.nodwin.com`
const USER_EMAIL = "alice@example.com"
const MSG_ID = "<msg-001@mail.example.com>"

function addr(email: string, name = ""): PostmarkEmailAddress {
  return { Email: email, Name: name, MailboxHash: "" }
}

function makePayload(overrides: Partial<PostmarkInboundPayload> = {}): PostmarkInboundPayload {
  return {
    From: USER_EMAIL,
    FromName: "Alice",
    FromFull: addr(USER_EMAIL, "Alice"),
    To: CRM_ADDRESS,
    ToFull: [addr(CRM_ADDRESS)],
    Cc: "",
    CcFull: [],
    Bcc: "",
    BccFull: [],
    OriginalRecipient: CRM_ADDRESS,
    Subject: "Meeting follow-up",
    MessageID: MSG_ID,
    Date: "Mon, 4 May 2026 09:00:00 +0000",
    TextBody: "Notes from the meeting.",
    HtmlBody: "<p>Notes from the meeting.</p>",
    ReplyTo: "",
    Headers: [],
    Attachments: [],
    Dkim: "Pass",
    ...overrides,
  }
}

function makeDb(overrides: Partial<InboundEmailDb> = {}): InboundEmailDb {
  return {
    getUserByInboundToken: vi.fn().mockResolvedValue({
      id: "user-1",
      email: USER_EMAIL,
      email_aliases: [],
    }),
    getAccountsByEmailDomain: vi.fn().mockResolvedValue([]),
    getOpportunityForUser: vi.fn().mockResolvedValue(null),
    isMessageIdSeen: vi.fn().mockResolvedValue(false),
    insertActivity: vi.fn().mockResolvedValue({ id: "activity-1" }),
    insertDeadLetter: vi.fn().mockResolvedValue(undefined),
    alertAdmin: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Unit tests: pure helpers
// ---------------------------------------------------------------------------

describe("extractInboundToken", () => {
  it("extracts local part from crm.nodwin.com address", () => {
    expect(extractInboundToken("abc123@crm.nodwin.com")).toBe("abc123")
  })

  it("is case-insensitive", () => {
    expect(extractInboundToken("ABC123@CRM.NODWIN.COM")).toBe("abc123")
  })

  it("returns null for non-CRM addresses", () => {
    expect(extractInboundToken("user@example.com")).toBeNull()
  })

  it("returns null for bare @crm.nodwin.com (empty local part)", () => {
    expect(extractInboundToken("@crm.nodwin.com")).toBeNull()
  })
})

describe("extractEmailAddress", () => {
  it("returns bare email unchanged", () => {
    expect(extractEmailAddress("alice@example.com")).toBe("alice@example.com")
  })

  it("extracts email from 'Display Name <email>' format", () => {
    expect(extractEmailAddress("Alice Smith <alice@example.com>")).toBe("alice@example.com")
  })

  it("strips surrounding whitespace", () => {
    expect(extractEmailAddress("  alice@example.com  ")).toBe("alice@example.com")
  })
})

describe("isSenderAuthorized", () => {
  it("allows exact match (case-insensitive)", () => {
    expect(isSenderAuthorized("ALICE@EXAMPLE.COM", "alice@example.com", [])).toBe(true)
  })

  it("allows a registered alias", () => {
    expect(isSenderAuthorized("a.smith@corp.com", "alice@example.com", ["a.smith@corp.com"])).toBe(true)
  })

  it("rejects a stranger's address", () => {
    expect(isSenderAuthorized("evil@attacker.com", "alice@example.com", [])).toBe(false)
  })

  it("rejects a partial domain match", () => {
    expect(isSenderAuthorized("alice@example.com.evil.com", "alice@example.com", [])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Integration: handleInboundEmail
// ---------------------------------------------------------------------------

describe("handleInboundEmail — DKIM verification", () => {
  it("dead-letters when Dkim is 'Fail'", async () => {
    const db = makeDb()
    const result = await handleInboundEmail(makePayload({ Dkim: "Fail" }), db)
    expect(result).toMatchObject({ outcome: "dead_lettered", reason: "dkim_fail" })
    expect(db.insertDeadLetter).toHaveBeenCalledOnce()
    expect(db.insertActivity).not.toHaveBeenCalled()
  })

  it("dead-letters when Dkim is 'None'", async () => {
    const db = makeDb()
    const result = await handleInboundEmail(makePayload({ Dkim: "None" }), db)
    expect(result).toMatchObject({ outcome: "dead_lettered", reason: "dkim_fail" })
  })

  it("does NOT alert admin for a DKIM failure (only sender mismatch triggers alert)", async () => {
    const db = makeDb()
    await handleInboundEmail(makePayload({ Dkim: "Fail" }), db)
    expect(db.alertAdmin).not.toHaveBeenCalled()
  })

  it("proceeds normally when Dkim is 'Pass'", async () => {
    const db = makeDb()
    const result = await handleInboundEmail(makePayload(), db)
    expect(result.outcome).toBe("activity_created")
  })
})

describe("handleInboundEmail — inbound token resolution", () => {
  it("dead-letters when OriginalRecipient is not a crm.nodwin.com address", async () => {
    const db = makeDb()
    const result = await handleInboundEmail(
      makePayload({ OriginalRecipient: "user@external.com" }),
      db,
    )
    expect(result).toMatchObject({ outcome: "dead_lettered", reason: "invalid_inbound_address" })
    expect(db.getUserByInboundToken).not.toHaveBeenCalled()
  })

  it("dead-letters when token is not found in users table", async () => {
    const db = makeDb({ getUserByInboundToken: vi.fn().mockResolvedValue(null) })
    const result = await handleInboundEmail(makePayload(), db)
    expect(result).toMatchObject({ outcome: "dead_lettered", reason: "unknown_inbound_token" })
  })

  it("passes the extracted token to getUserByInboundToken", async () => {
    const db = makeDb()
    await handleInboundEmail(makePayload(), db)
    expect(db.getUserByInboundToken).toHaveBeenCalledWith(INBOUND_TOKEN)
  })
})

describe("handleInboundEmail — sender verification (forgery prevention)", () => {
  it("dead-letters and alerts admin when From does not match user email", async () => {
    const payload = makePayload({
      From: "attacker@evil.com",
      FromFull: addr("attacker@evil.com", "Attacker"),
    })
    const db = makeDb()
    const result = await handleInboundEmail(payload, db)
    expect(result).toMatchObject({ outcome: "dead_lettered", reason: "sender_mismatch" })
    expect(db.insertDeadLetter).toHaveBeenCalledOnce()
    expect(db.alertAdmin).toHaveBeenCalledWith("sender_mismatch", payload)
    expect(db.insertActivity).not.toHaveBeenCalled()
  })

  it("accepts when From matches a registered alias", async () => {
    const alias = "alice.work@corp.com"
    const payload = makePayload({
      From: alias,
      FromFull: addr(alias, "Alice"),
    })
    const db = makeDb({
      getUserByInboundToken: vi.fn().mockResolvedValue({
        id: "user-1",
        email: USER_EMAIL,
        email_aliases: [alias],
      }),
    })
    const result = await handleInboundEmail(payload, db)
    expect(result.outcome).toBe("activity_created")
  })

  it("sender comparison is case-insensitive", async () => {
    const payload = makePayload({
      From: "ALICE@EXAMPLE.COM",
      FromFull: addr("ALICE@EXAMPLE.COM", "Alice"),
    })
    const db = makeDb()
    const result = await handleInboundEmail(payload, db)
    expect(result.outcome).toBe("activity_created")
  })
})

describe("handleInboundEmail — replay protection", () => {
  it("drops the second delivery of the same message-id without creating an activity", async () => {
    const db = makeDb({ isMessageIdSeen: vi.fn().mockResolvedValue(true) })
    const result = await handleInboundEmail(makePayload(), db)
    expect(result).toMatchObject({ outcome: "replay_dropped", messageId: MSG_ID })
    expect(db.insertActivity).not.toHaveBeenCalled()
    expect(db.insertDeadLetter).not.toHaveBeenCalled()
  })

  it("creates an activity on the first delivery (message-id not seen)", async () => {
    const db = makeDb({ isMessageIdSeen: vi.fn().mockResolvedValue(false) })
    const result = await handleInboundEmail(makePayload(), db)
    expect(result.outcome).toBe("activity_created")
  })
})

describe("handleInboundEmail — account matching", () => {
  it("attaches to account when exactly one domain match is found", async () => {
    const payload = makePayload({
      CcFull: [addr("bob@acme.com", "Bob")],
    })
    const db = makeDb({
      getAccountsByEmailDomain: vi.fn().mockImplementation((domain: string) =>
        domain === "acme.com"
          ? Promise.resolve([{ id: "account-1", name: "Acme Corp" }])
          : Promise.resolve([]),
      ),
    })
    const result = await handleInboundEmail(payload, db)
    expect(result.outcome).toBe("activity_created")
    expect(db.insertActivity).toHaveBeenCalledWith(
      expect.objectContaining({ account_id: "account-1", is_assigned: true }),
    )
  })

  it("leaves account_id null when multiple domain matches exist (ambiguous)", async () => {
    const payload = makePayload({
      CcFull: [addr("bob@acme.com"), addr("carol@rival.com")],
    })
    const db = makeDb({
      getAccountsByEmailDomain: vi.fn().mockImplementation((domain: string) => {
        if (domain === "acme.com") return Promise.resolve([{ id: "account-1", name: "Acme" }])
        if (domain === "rival.com") return Promise.resolve([{ id: "account-2", name: "Rival" }])
        return Promise.resolve([])
      }),
    })
    const result = await handleInboundEmail(payload, db)
    expect(result.outcome).toBe("activity_created")
    expect(db.insertActivity).toHaveBeenCalledWith(
      expect.objectContaining({ account_id: null, is_assigned: false }),
    )
  })

  it("creates an unassigned activity when no domain matches", async () => {
    const db = makeDb()
    const result = await handleInboundEmail(makePayload(), db)
    expect(result.outcome).toBe("activity_created")
    expect(db.insertActivity).toHaveBeenCalledWith(
      expect.objectContaining({ account_id: null, is_assigned: false }),
    )
  })

  it("ignores the crm.nodwin.com inbound address when matching domains", async () => {
    const payload = makePayload({
      // only non-CRM address is the inbound address itself — should not match
      ToFull: [addr(CRM_ADDRESS)],
      CcFull: [],
    })
    const db = makeDb({
      getAccountsByEmailDomain: vi.fn().mockResolvedValue([]),
    })
    await handleInboundEmail(payload, db)
    // crm.nodwin.com should never be queried
    const calls = (db.getAccountsByEmailDomain as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.every(([d]: [string]) => !d.includes("nodwin.com"))).toBe(true)
  })

  it("deduplicates recipients from same domain before querying", async () => {
    const payload = makePayload({
      CcFull: [addr("x@acme.com"), addr("y@acme.com")],
    })
    const db = makeDb({
      getAccountsByEmailDomain: vi.fn().mockResolvedValue([{ id: "a1", name: "Acme" }]),
    })
    await handleInboundEmail(payload, db)
    const calls = (db.getAccountsByEmailDomain as ReturnType<typeof vi.fn>).mock.calls
    const domains = calls.map(([d]: [string]) => d)
    // Should only query acme.com once despite two recipients
    expect(domains.filter((d: string) => d === "acme.com").length).toBe(1)
  })
})

describe("handleInboundEmail — opportunity matching", () => {
  it("attaches to opportunity when [OPP-id] is in subject and user has access", async () => {
    const payload = makePayload({ Subject: "Follow-up call [OPP-42]" })
    const db = makeDb({
      getOpportunityForUser: vi.fn().mockResolvedValue({ id: "42", account_id: "account-1" }),
    })
    const result = await handleInboundEmail(payload, db)
    expect(result.outcome).toBe("activity_created")
    expect(db.insertActivity).toHaveBeenCalledWith(
      expect.objectContaining({ opportunity_id: "42" }),
    )
  })

  it("ignores [OPP-id] tag if user cannot access the opportunity (RLS fail)", async () => {
    const payload = makePayload({ Subject: "Notes [OPP-999]" })
    const db = makeDb({ getOpportunityForUser: vi.fn().mockResolvedValue(null) })
    const result = await handleInboundEmail(payload, db)
    expect(result.outcome).toBe("activity_created")
    expect(db.insertActivity).toHaveBeenCalledWith(
      expect.objectContaining({ opportunity_id: null }),
    )
  })

  it("does not attempt opportunity lookup when subject has no [OPP-id] tag", async () => {
    const db = makeDb()
    await handleInboundEmail(makePayload({ Subject: "No tag here" }), db)
    expect(db.getOpportunityForUser).not.toHaveBeenCalled()
  })

  it("passes user id to getOpportunityForUser for access check", async () => {
    const payload = makePayload({ Subject: "Deal update [OPP-7]" })
    const db = makeDb({
      getOpportunityForUser: vi.fn().mockResolvedValue({ id: "7", account_id: null }),
    })
    await handleInboundEmail(payload, db)
    expect(db.getOpportunityForUser).toHaveBeenCalledWith("7", "user-1")
  })
})

describe("handleInboundEmail — attachment handling", () => {
  it("marks attachments over 25 MB as oversized_skipped with a note", async () => {
    const TWENTY_SIX_MB = 26 * 1024 * 1024
    const payload = makePayload({
      Attachments: [
        { Name: "bigfile.pdf", Content: "", ContentType: "application/pdf", ContentLength: TWENTY_SIX_MB },
      ],
    })
    const db = makeDb()
    await handleInboundEmail(payload, db)
    expect(db.insertActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        attachment_metadata: expect.arrayContaining([
          expect.objectContaining({
            name: "bigfile.pdf",
            uploadStatus: "oversized_skipped",
            note: expect.stringContaining("25 MB"),
          }),
        ]),
      }),
    )
  })

  it("marks attachments at exactly 25 MB as pending (boundary is exclusive)", async () => {
    const EXACTLY_25_MB = 25 * 1024 * 1024
    const payload = makePayload({
      Attachments: [
        { Name: "exact.pdf", Content: "", ContentType: "application/pdf", ContentLength: EXACTLY_25_MB },
      ],
    })
    const db = makeDb()
    await handleInboundEmail(payload, db)
    expect(db.insertActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        attachment_metadata: expect.arrayContaining([
          expect.objectContaining({ name: "exact.pdf", uploadStatus: "pending" }),
        ]),
      }),
    )
  })

  it("marks small attachments as pending upload with TODO note", async () => {
    const payload = makePayload({
      Attachments: [
        { Name: "doc.pdf", Content: "abc123==", ContentType: "application/pdf", ContentLength: 1024 },
      ],
    })
    const db = makeDb()
    await handleInboundEmail(payload, db)
    expect(db.insertActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        attachment_metadata: expect.arrayContaining([
          expect.objectContaining({
            name: "doc.pdf",
            uploadStatus: "pending",
            note: expect.stringContaining("TODO"),
          }),
        ]),
      }),
    )
  })
})

describe("handleInboundEmail — In-Reply-To header", () => {
  it("extracts In-Reply-To value from headers", async () => {
    const payload = makePayload({
      Headers: [{ Name: "In-Reply-To", Value: "<original-123@mail.example.com>" }],
    })
    const db = makeDb()
    await handleInboundEmail(payload, db)
    expect(db.insertActivity).toHaveBeenCalledWith(
      expect.objectContaining({ in_reply_to: "<original-123@mail.example.com>" }),
    )
  })

  it("sets in_reply_to to null when header is absent", async () => {
    const db = makeDb()
    await handleInboundEmail(makePayload({ Headers: [] }), db)
    expect(db.insertActivity).toHaveBeenCalledWith(
      expect.objectContaining({ in_reply_to: null }),
    )
  })

  it("header name lookup is case-insensitive", async () => {
    const payload = makePayload({
      Headers: [{ Name: "in-reply-to", Value: "<lower-case-ref@mail.example.com>" }],
    })
    const db = makeDb()
    await handleInboundEmail(payload, db)
    expect(db.insertActivity).toHaveBeenCalledWith(
      expect.objectContaining({ in_reply_to: "<lower-case-ref@mail.example.com>" }),
    )
  })
})

describe("handleInboundEmail — activity fields", () => {
  it("stores from_email in lowercase", async () => {
    const payload = makePayload({
      From: "ALICE@EXAMPLE.COM",
      FromFull: addr("ALICE@EXAMPLE.COM"),
    })
    const db = makeDb()
    await handleInboundEmail(payload, db)
    expect(db.insertActivity).toHaveBeenCalledWith(
      expect.objectContaining({ from_email: "alice@example.com" }),
    )
  })

  it("stores message_id verbatim", async () => {
    const db = makeDb()
    await handleInboundEmail(makePayload(), db)
    expect(db.insertActivity).toHaveBeenCalledWith(
      expect.objectContaining({ message_id: MSG_ID }),
    )
  })

  it("stores user_id from the resolved user record", async () => {
    const db = makeDb()
    await handleInboundEmail(makePayload(), db)
    expect(db.insertActivity).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1" }),
    )
  })
})
