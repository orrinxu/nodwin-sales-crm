import { describe, it, expect } from "vitest"
import {
  parseInboundEmail,
  extractInboundToken,
  extractEmailAddress,
  type PostmarkInboundPayload,
  type PostmarkEmailAddress,
} from "./inbound"

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
