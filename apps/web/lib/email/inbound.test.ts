import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  parseInboundEmail,
  extractInboundToken,
  extractEmailAddress,
  processInboundEmail,
  type PostmarkInboundPayload,
  type PostmarkEmailAddress,
} from "./inbound"

const mockFrom = vi.fn()

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

vi.mock("../security/env", () => ({
  env: {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  },
}))

vi.mock("../notifications/admin-alerts", () => ({
  sendAdminAlert: vi.fn(() => Promise.resolve("alert-mock-id")),
}))

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function addr(email: string, name = ""): PostmarkEmailAddress {
  return { Email: email, Name: name, MailboxHash: "" }
}

function makePayload(overrides: Partial<PostmarkInboundPayload> = {}): PostmarkInboundPayload {
  return {
    From: "alice@example.com",
    FromName: "Alice",
    FromFull: addr("alice@example.com", "Alice"),
    To: "token123@crm.nodwin.com",
    ToFull: [addr("token123@crm.nodwin.com")],
    Cc: "",
    CcFull: [],
    Bcc: "",
    BccFull: [],
    OriginalRecipient: "token123@crm.nodwin.com",
    Subject: "Meeting follow-up",
    MessageID: "<msg-001@mail.example.com>",
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

// ---------------------------------------------------------------------------
// extractInboundToken
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

// ---------------------------------------------------------------------------
// extractEmailAddress
// ---------------------------------------------------------------------------

describe("extractEmailAddress", () => {
  it("returns bare email unchanged (trimmed)", () => {
    expect(extractEmailAddress("alice@example.com")).toBe("alice@example.com")
  })

  it("extracts email from 'Display Name <email>' format", () => {
    expect(extractEmailAddress("Alice Smith <alice@example.com>")).toBe("alice@example.com")
  })

  it("strips surrounding whitespace", () => {
    expect(extractEmailAddress("  alice@example.com  ")).toBe("alice@example.com")
  })
})

// ---------------------------------------------------------------------------
// parseInboundEmail
// ---------------------------------------------------------------------------

describe("parseInboundEmail — header field mapping", () => {
  it("maps all core fields from a typical payload", () => {
    const parsed = parseInboundEmail(makePayload())
    expect(parsed.from).toBe("alice@example.com")
    expect(parsed.fromName).toBe("Alice")
    expect(parsed.subject).toBe("Meeting follow-up")
    expect(parsed.messageId).toBe("<msg-001@mail.example.com>")
    expect(parsed.date).toBe("Mon, 4 May 2026 09:00:00 +0000")
    expect(parsed.textBody).toBe("Notes from the meeting.")
    expect(parsed.htmlBody).toBe("<p>Notes from the meeting.</p>")
  })

  it("uses FromFull.Email for the from field when present", () => {
    const payload = makePayload({
      From: "Alice Smith <alice@example.com>",
      FromFull: addr("alice@example.com", "Alice Smith"),
    })
    expect(parseInboundEmail(payload).from).toBe("alice@example.com")
  })

  it("falls back to parsing From string when FromFull.Email is absent", () => {
    const payload = makePayload({
      From: "Alice Smith <alice@example.com>",
      FromFull: { Email: "", Name: "", MailboxHash: "" },
    })
    expect(parseInboundEmail(payload).from).toBe("alice@example.com")
  })

  it("maps ToFull array", () => {
    const payload = makePayload({
      ToFull: [addr("bob@example.com", "Bob"), addr("token123@crm.nodwin.com")],
    })
    const parsed = parseInboundEmail(payload)
    expect(parsed.to).toHaveLength(2)
    expect(parsed.to[0].Email).toBe("bob@example.com")
  })

  it("maps CcFull array", () => {
    const payload = makePayload({
      CcFull: [addr("carol@example.com", "Carol")],
    })
    expect(parseInboundEmail(payload).cc[0].Email).toBe("carol@example.com")
  })
})

describe("parseInboundEmail — DKIM flag", () => {
  it("sets dkimVerified true when Dkim is 'Pass'", () => {
    expect(parseInboundEmail(makePayload({ Dkim: "Pass" })).dkimVerified).toBe(true)
  })

  it("sets dkimVerified false when Dkim is 'Fail'", () => {
    expect(parseInboundEmail(makePayload({ Dkim: "Fail" })).dkimVerified).toBe(false)
  })

  it("sets dkimVerified false when Dkim is 'None'", () => {
    expect(parseInboundEmail(makePayload({ Dkim: "None" })).dkimVerified).toBe(false)
  })

  it("sets dkimVerified false when Dkim is 'SkippedSigning'", () => {
    expect(parseInboundEmail(makePayload({ Dkim: "SkippedSigning" })).dkimVerified).toBe(false)
  })
})

describe("parseInboundEmail — opportunityRef extraction", () => {
  it("extracts ref from [OPP-id] tag in subject", () => {
    const parsed = parseInboundEmail(makePayload({ Subject: "Follow-up [OPP-42]" }))
    expect(parsed.opportunityRef).toBe("42")
  })

  it("extracts ref when tag appears mid-subject", () => {
    const parsed = parseInboundEmail(makePayload({ Subject: "Re: Notes [OPP-abc-123] thanks" }))
    expect(parsed.opportunityRef).toBe("abc-123")
  })

  it("returns null when subject has no [OPP-id] tag", () => {
    const parsed = parseInboundEmail(makePayload({ Subject: "No tag here" }))
    expect(parsed.opportunityRef).toBeNull()
  })

  it("returns null for empty subject", () => {
    const parsed = parseInboundEmail(makePayload({ Subject: "" }))
    expect(parsed.opportunityRef).toBeNull()
  })
})

describe("parseInboundEmail — In-Reply-To header", () => {
  it("extracts In-Reply-To from headers", () => {
    const payload = makePayload({
      Headers: [{ Name: "In-Reply-To", Value: "<original@mail.example.com>" }],
    })
    expect(parseInboundEmail(payload).inReplyTo).toBe("<original@mail.example.com>")
  })

  it("sets inReplyTo null when header is absent", () => {
    expect(parseInboundEmail(makePayload({ Headers: [] })).inReplyTo).toBeNull()
  })

  it("header name lookup is case-insensitive", () => {
    const payload = makePayload({
      Headers: [{ Name: "in-reply-to", Value: "<lower@mail.example.com>" }],
    })
    expect(parseInboundEmail(payload).inReplyTo).toBe("<lower@mail.example.com>")
  })
})

describe("parseInboundEmail — attachments", () => {
  it("maps attachment metadata without Content blob", () => {
    const payload = makePayload({
      Attachments: [
        { Name: "doc.pdf", Content: "base64data==", ContentType: "application/pdf", ContentLength: 1024 },
      ],
    })
    const parsed = parseInboundEmail(payload)
    expect(parsed.attachments).toHaveLength(1)
    expect(parsed.attachments[0]).toEqual({
      name: "doc.pdf",
      contentType: "application/pdf",
      contentLength: 1024,
    })
  })

  it("returns empty array when there are no attachments", () => {
    expect(parseInboundEmail(makePayload({ Attachments: [] })).attachments).toEqual([])
  })
})

describe("parseInboundEmail — optional/missing fields", () => {
  it("handles empty CcFull gracefully", () => {
    const parsed = parseInboundEmail(makePayload({ CcFull: [] }))
    expect(parsed.cc).toEqual([])
  })

  it("handles missing TextBody and HtmlBody gracefully", () => {
    const payload = makePayload({ TextBody: "", HtmlBody: "" })
    const parsed = parseInboundEmail(payload)
    expect(parsed.textBody).toBe("")
    expect(parsed.htmlBody).toBe("")
  })
})

// ---------------------------------------------------------------------------
// Pipeline integration test mocks
// ---------------------------------------------------------------------------

function mockUsers(found: boolean) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () =>
          Promise.resolve(found ? { data: { id: "user-123" }, error: null } : { data: null, error: null }),
      }),
    }),
  }
}

function mockDeadletterInsert() {
  return {
    insert: () => ({
      select: () => ({
        single: () => Promise.resolve({ data: { id: "deadletter-999" }, error: null }),
      }),
    }),
    update: () => ({
      eq: () => Promise.resolve({ error: null }),
    }),
  }
}

function mockDeadletterSelect(found: boolean) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () =>
          Promise.resolve(found ? { data: { id: "deadletter-existing" }, error: null } : { data: null, error: null }),
      }),
    }),
    insert: () => ({
      select: () => ({
        single: () => Promise.resolve({ data: { id: "deadletter-new" }, error: null }),
      }),
    }),
    update: () => ({
      eq: () => Promise.resolve({ error: null }),
    }),
  }
}

function mockActivitySelect(found: boolean) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () =>
          Promise.resolve(found ? { data: { id: "existing-activity" }, error: null } : { data: null, error: null }),
      }),
    }),
    insert: () => ({
      select: () => ({
        single: () => Promise.resolve({ data: { id: "activity-789" }, error: null }),
      }),
    }),
  }
}

function mockAccounts(match: boolean) {
  return {
    select: () => ({
      overlaps: () =>
        Promise.resolve(
          match ? { data: [{ id: "acct-456" }], error: null } : { data: [], error: null },
        ),
    }),
  }
}

// ---------------------------------------------------------------------------
// Pipeline integration tests
// ---------------------------------------------------------------------------

describe("processInboundEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("dead-letters when DKIM fails", async () => {
    const payload = makePayload({ Dkim: "Fail" })

    mockFrom.mockImplementation((table: string) => {
      if (table === "inbound_email_deadletter") return mockDeadletterInsert()
      return {}
    })

    const result = await processInboundEmail(payload)

    expect(result).toEqual({ status: "deadlettered", reason: "DKIM verification failed" })
    expect(mockFrom).toHaveBeenCalledWith("inbound_email_deadletter")
  })

  it("sends admin alert on deadletter (not console.error)", async () => {
    const { sendAdminAlert: mockedAlert } = await vi.importMock<typeof import("../notifications/admin-alerts")>("../notifications/admin-alerts")

    const payload = makePayload({ Dkim: "Fail" })

    mockFrom.mockImplementation((table: string) => {
      if (table === "inbound_email_deadletter") return mockDeadletterInsert()
      return {}
    })

    await processInboundEmail(payload)

    expect(mockedAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "deadletter",
        title: "Inbound email deadlettered",
      }),
    )
    expect(mockedAlert).toHaveBeenCalledTimes(1)
  })

  it("dead-letters when From does not match any CRM inbound email", async () => {
    const payload = makePayload({
      From: "forger@evil.com",
      FromFull: addr("forger@evil.com", "Forger"),
      Dkim: "Pass",
    })

    mockFrom.mockImplementation((table: string) => {
      if (table === "users") return mockUsers(false)
      if (table === "inbound_email_deadletter") return mockDeadletterInsert()
      return {}
    })

    const result = await processInboundEmail(payload)

    expect(result).toEqual({
      status: "deadlettered",
      reason: "From address does not match any CRM inbound email",
    })
  })

  it("rejects duplicates via activities external_thread_id", async () => {
    const payload = makePayload({ Dkim: "Pass" })

    mockFrom.mockImplementation((table: string) => {
      if (table === "users") return mockUsers(true)
      if (table === "activities") return mockActivitySelect(true)
      return {}
    })

    const result = await processInboundEmail(payload)

    expect(result.status).toBe("duplicate")
  })

  it("rejects duplicates via deadletter message_id", async () => {
    const payload = makePayload({ Dkim: "Pass" })

    mockFrom.mockImplementation((table: string) => {
      if (table === "users") return mockUsers(true)
      if (table === "activities") return mockActivitySelect(false)
      if (table === "inbound_email_deadletter") return mockDeadletterSelect(true)
      return {}
    })

    const result = await processInboundEmail(payload)

    expect(result.status).toBe("duplicate")
  })

  it("matches account by recipient domain when exactly one account matches", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "users") return mockUsers(true)
      if (table === "activities") return mockActivitySelect(false)
      if (table === "inbound_email_deadletter") return mockDeadletterSelect(false)
      if (table === "accounts") return mockAccounts(true)
      return {}
    })

    const payload = makePayload({
      Dkim: "Pass",
      ToFull: [addr("token123@crm.nodwin.com"), addr("info@example.com")],
    })

    const result = await processInboundEmail(payload)

    expect(result.status).toBe("accepted")
    if (result.status === "accepted") {
      expect(result.activityId).toBe("activity-789")
    }
  })

  it("creates unassigned activity when no account domain matches", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "users") return mockUsers(true)
      if (table === "activities") return mockActivitySelect(false)
      if (table === "inbound_email_deadletter") return mockDeadletterSelect(false)
      return {}
    })

    const payload = makePayload({
      Dkim: "Pass",
      ToFull: [addr("token123@crm.nodwin.com")],
    })

    const result = await processInboundEmail(payload)

    expect(result.status).toBe("accepted")
  })

  // ORR-811d — a malformed [OPP-…] ref must NOT reach the uuid-cast query (which
  // would throw `invalid input syntax for type uuid` → 500 → Postmark retry loop).
  it("does not query opportunities for a non-uuid [OPP-…] ref, and still accepts the email", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "users") return mockUsers(true)
      if (table === "activities") return mockActivitySelect(false)
      if (table === "inbound_email_deadletter") return mockDeadletterSelect(false)
      if (table === "opportunities")
        throw new Error("must not query opportunities for a non-uuid ref")
      return {}
    })

    const payload = makePayload({
      Dkim: "Pass",
      Subject: "Re: [OPP-1234] pricing",
      ToFull: [addr("token123@crm.nodwin.com")],
    })

    const result = await processInboundEmail(payload)

    expect(result.status).toBe("accepted")
    expect(mockFrom).not.toHaveBeenCalledWith("opportunities")
  })

  it("resolves the opportunity for a valid-uuid [OPP-…] ref the sender can see", async () => {
    const oppUuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    mockFrom.mockImplementation((table: string) => {
      if (table === "users") return mockUsers(true)
      if (table === "activities") return mockActivitySelect(false)
      if (table === "inbound_email_deadletter") return mockDeadletterSelect(false)
      if (table === "opportunities")
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { id: oppUuid }, error: null }),
            }),
          }),
        }
      if (table === "opportunity_visibility")
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: { opportunity_id: oppUuid }, error: null }),
              }),
            }),
          }),
        }
      return {}
    })

    const payload = makePayload({
      Dkim: "Pass",
      Subject: `Re: [OPP-${oppUuid}] pricing`,
      ToFull: [addr("token123@crm.nodwin.com")],
    })

    const result = await processInboundEmail(payload)

    expect(result.status).toBe("accepted")
    expect(mockFrom).toHaveBeenCalledWith("opportunities")
  })

  // ORR-811e — sender lookup lowercases the From address (stored crm_inbound_email
  // is always lowercase), so a mixed-case From no longer deadletters a real user.
  it("looks up the sender case-insensitively (lowercases the From address)", async () => {
    const capturedEq: [string, unknown][] = []
    mockFrom.mockImplementation((table: string) => {
      if (table === "users")
        return {
          select: () => ({
            eq: (col: string, val: unknown) => {
              capturedEq.push([col, val])
              return {
                maybeSingle: () =>
                  Promise.resolve({ data: { id: "user-123" }, error: null }),
              }
            },
          }),
        }
      if (table === "activities") return mockActivitySelect(false)
      if (table === "inbound_email_deadletter") return mockDeadletterSelect(false)
      return {}
    })

    const payload = makePayload({
      Dkim: "Pass",
      From: "Mixed.Case@Example.com",
      FromFull: addr("Mixed.Case@Example.com", "Mixed"),
      ToFull: [addr("token123@crm.nodwin.com")],
    })

    const result = await processInboundEmail(payload)

    expect(result.status).toBe("accepted")
    expect(capturedEq).toContainEqual(["crm_inbound_email", "mixed.case@example.com"])
  })
})

