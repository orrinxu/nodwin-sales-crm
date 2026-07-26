import { describe, it, expect } from "vitest"
import {
  readEmailMetadata,
  hasEmailDetail,
  emailPersonLabel,
  summarizeEmailPeople,
} from "./email-format"

describe("readEmailMetadata — Gmail shape (ORR-832)", () => {
  it("reads structured from/to/cc and filename/mimeType attachments", () => {
    const meta = readEmailMetadata({
      from: { email: "sender@acme.com", name: "Sam Sender" },
      to: [
        { email: "a@x.com", name: "Alice" },
        { email: "b@x.com" },
      ],
      cc: [{ email: "c@x.com", name: "Carol" }],
      attachments: [
        {
          filename: "deck.pdf",
          mimeType: "application/pdf",
          size: 123,
          attachmentId: "att1",
        },
      ],
    })
    expect(meta.from).toEqual({ name: "Sam Sender", email: "sender@acme.com" })
    expect(meta.to).toEqual([
      { name: "Alice", email: "a@x.com" },
      { name: null, email: "b@x.com" },
    ])
    expect(meta.cc).toEqual([{ name: "Carol", email: "c@x.com" }])
    expect(meta.attachments).toEqual([
      { name: "deck.pdf", type: "application/pdf" },
    ])
  })
})

describe("readEmailMetadata — Postmark inbound shape", () => {
  it("reads fromName, PostmarkEmailAddress cc, and contentType attachments", () => {
    const meta = readEmailMetadata({
      fromName: "Pat Postmark",
      cc: [
        { Email: "c@x.com", Name: "Carol", MailboxHash: "" },
        { Email: "d@x.com", Name: "" },
      ],
      attachments: [
        { name: "invoice.pdf", contentType: "application/pdf", contentLength: 9 },
      ],
    })
    // Postmark carries only a display name for the sender, no address.
    expect(meta.from).toEqual({ name: "Pat Postmark", email: null })
    // Postmark writes no `to`.
    expect(meta.to).toEqual([])
    expect(meta.cc).toEqual([
      { name: "Carol", email: "c@x.com" },
      { name: null, email: "d@x.com" },
    ])
    expect(meta.attachments).toEqual([
      { name: "invoice.pdf", type: "application/pdf" },
    ])
  })

  it("treats a bare from string that looks like an address as an email", () => {
    const meta = readEmailMetadata({ fromName: "someone@example.com" })
    expect(meta.from).toEqual({ name: null, email: "someone@example.com" })
  })
})

describe("readEmailMetadata — graceful degradation", () => {
  it("returns empty values for null/undefined metadata", () => {
    for (const input of [null, undefined]) {
      const meta = readEmailMetadata(input)
      expect(meta.from).toBeNull()
      expect(meta.to).toEqual([])
      expect(meta.cc).toEqual([])
      expect(meta.attachments).toEqual([])
    }
  })

  it("ignores blank fromName and junk in the people arrays", () => {
    const meta = readEmailMetadata({
      fromName: "   ",
      to: [null, "nope@x.com", 42, {}, { name: "Only Name" }],
      cc: "not-an-array",
    })
    expect(meta.from).toBeNull()
    expect(meta.to).toEqual([
      { name: null, email: "nope@x.com" },
      { name: "Only Name", email: null },
    ])
    expect(meta.cc).toEqual([])
  })

  it("drops attachments with no recoverable name and tolerates junk entries", () => {
    const meta = readEmailMetadata({
      attachments: [
        null,
        "nope",
        { contentType: "application/pdf" },
        { filename: "ok.txt" },
      ],
    })
    expect(meta.attachments).toEqual([{ name: "ok.txt", type: null }])
  })
})

describe("hasEmailDetail", () => {
  it("is false when nothing is present", () => {
    expect(hasEmailDetail(readEmailMetadata(null))).toBe(false)
  })

  it("is true when any of from/to/cc/attachments is present", () => {
    expect(hasEmailDetail(readEmailMetadata({ fromName: "X" }))).toBe(true)
    expect(
      hasEmailDetail(readEmailMetadata({ to: [{ email: "a@x.com" }] })),
    ).toBe(true)
    expect(
      hasEmailDetail(readEmailMetadata({ attachments: [{ name: "a.pdf" }] })),
    ).toBe(true)
  })
})

describe("emailPersonLabel", () => {
  it("prefers name, falls back to email, then Unknown", () => {
    expect(emailPersonLabel({ name: "Alice", email: "a@x.com" })).toBe("Alice")
    expect(emailPersonLabel({ name: null, email: "a@x.com" })).toBe("a@x.com")
    expect(emailPersonLabel({ name: null, email: null })).toBe("Unknown")
  })
})

describe("summarizeEmailPeople", () => {
  it("returns null for an empty list", () => {
    expect(summarizeEmailPeople([])).toBeNull()
  })

  it("caps at max and appends a +K more suffix", () => {
    const people = [
      { name: "A", email: null },
      { name: "B", email: null },
      { name: "C", email: null },
      { name: "D", email: null },
    ]
    expect(summarizeEmailPeople(people, 3)).toBe("A, B, C +1 more")
  })
})
