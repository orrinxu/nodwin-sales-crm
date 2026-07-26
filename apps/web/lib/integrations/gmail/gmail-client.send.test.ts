// @vitest-environment node
// Node runtime for the real `Buffer` used by base64/base64url encoding, matching
// the route-handler / background-job runtime the client runs in.
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

// Mock the token-store: no real DB / crypto / network, but keep its REAL typed
// error classes so the caller's `instanceof` checks match.
const { getTokenMock } = vi.hoisted(() => ({ getTokenMock: vi.fn() }))
vi.mock("../google/token-store", async () => {
  const actual = await vi.importActual<
    typeof import("../google/token-store")
  >("../google/token-store")
  return { ...actual, getValidGoogleAccessToken: getTokenMock }
})

// Mock googleapis so nothing hits the network. The mocked OAuth2 records the
// credentials set on it; google.gmail returns a client whose users.messages.send
// we drive/inspect per test.
const { sendMock, oauth2Ctor, gmailFactory } = vi.hoisted(() => {
  const sendMock = vi.fn()
  const oauth2Ctor = vi.fn(() => ({ setCredentials: vi.fn() }))
  const gmailFactory = vi.fn(() => ({
    users: { messages: { send: sendMock } },
  }))
  return { sendMock, oauth2Ctor, gmailFactory }
})
vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: oauth2Ctor },
    gmail: gmailFactory,
  },
}))

import {
  sendMessage,
  buildRfc822Message,
  toBase64Url,
  formatEmailAddress,
  encodeHeaderValue,
  GMAIL_SEND_SCOPE,
} from "./gmail-client"

const USER = "user-1"

/** Decode a base64url `raw` payload back to the MIME string, for assertions. */
function decodeRaw(raw: string): string {
  const b64 = raw.replace(/-/g, "+").replace(/_/g, "/")
  return Buffer.from(b64, "base64").toString("utf-8")
}

beforeEach(() => {
  vi.clearAllMocks()
  getTokenMock.mockResolvedValue("ya29.live-token")
  sendMock.mockResolvedValue({ data: { id: "msg-sent-1", threadId: "thread-1" } })
})

describe("formatEmailAddress (ORR-835)", () => {
  it("emits a bare address when there is no display name", () => {
    expect(formatEmailAddress({ email: "a@b.com" })).toBe("a@b.com")
  })

  it("quotes the display name and escapes embedded quotes", () => {
    expect(formatEmailAddress({ email: "j@x.com", name: 'Doe, "JJ"' })).toBe(
      '"Doe, \\"JJ\\"" <j@x.com>',
    )
  })
})

describe("encodeHeaderValue (ORR-835)", () => {
  it("passes ASCII through untouched", () => {
    expect(encodeHeaderValue("Weekly Sync")).toBe("Weekly Sync")
  })

  it("RFC2047 base64-encodes non-ASCII", () => {
    const encoded = encodeHeaderValue("Café ☕")
    expect(encoded).toMatch(/^=\?UTF-8\?B\?.+\?=$/)
    const b64 = encoded.replace(/^=\?UTF-8\?B\?/, "").replace(/\?=$/, "")
    expect(Buffer.from(b64, "base64").toString("utf-8")).toBe("Café ☕")
  })
})

describe("toBase64Url (ORR-835)", () => {
  it("uses the URL-safe alphabet with no padding", () => {
    // '<<<>>>?' base64 is 'PDw8Pj4+Pw==' which contains +, / and = to normalize.
    const out = toBase64Url("<<<>>>?")
    expect(out).not.toMatch(/[+/=]/)
    // round-trips
    const b64 = out.replace(/-/g, "+").replace(/_/g, "/")
    expect(Buffer.from(b64, "base64").toString("utf-8")).toBe("<<<>>>?")
  })
})

describe("buildRfc822Message (ORR-835)", () => {
  it("builds To/Cc/Subject headers + a base64 UTF-8 body", () => {
    const mime = buildRfc822Message({
      to: [{ email: "a@b.com", name: "Alice" }],
      cc: [{ email: "c@d.com" }],
      subject: "Hello",
      bodyText: "Line one\nLine two",
    })
    expect(mime).toContain('To: "Alice" <a@b.com>')
    expect(mime).toContain("Cc: c@d.com")
    expect(mime).toContain("Subject: Hello")
    expect(mime).toContain('Content-Type: text/plain; charset="UTF-8"')
    expect(mime).toContain("Content-Transfer-Encoding: base64")
    // Body is base64 of the text, after the blank-line separator.
    const body = mime.split("\r\n\r\n")[1].replace(/\r\n/g, "")
    expect(Buffer.from(body, "base64").toString("utf-8")).toBe(
      "Line one\nLine two",
    )
  })

  it("omits Cc when there are no cc recipients", () => {
    const mime = buildRfc822Message({
      to: [{ email: "a@b.com" }],
      subject: "x",
      bodyText: "y",
    })
    expect(mime).not.toContain("Cc:")
  })

  it("emits In-Reply-To AND References for a reply", () => {
    const mime = buildRfc822Message({
      to: [{ email: "a@b.com" }],
      subject: "Re: x",
      bodyText: "y",
      inReplyTo: "<orig-msgid@mail.gmail.com>",
    })
    expect(mime).toContain("In-Reply-To: <orig-msgid@mail.gmail.com>")
    expect(mime).toContain("References: <orig-msgid@mail.gmail.com>")
  })

  it("omits threading headers when not a reply", () => {
    const mime = buildRfc822Message({
      to: [{ email: "a@b.com" }],
      subject: "x",
      bodyText: "y",
    })
    expect(mime).not.toContain("In-Reply-To:")
    expect(mime).not.toContain("References:")
  })
})

describe("sendMessage (ORR-835)", () => {
  it("requests the send scope, base64url-encodes the MIME into raw, returns ids", async () => {
    const result = await sendMessage({
      userId: USER,
      to: [{ email: "a@b.com" }],
      subject: "Hi",
      bodyText: "Body",
    })

    // Scope: send (not readonly).
    expect(getTokenMock).toHaveBeenCalledWith(USER, [GMAIL_SEND_SCOPE])

    const arg = sendMock.mock.calls[0][0]
    expect(arg.userId).toBe("me")
    // raw is a valid base64url MIME containing our headers.
    const mime = decodeRaw(arg.requestBody.raw)
    expect(mime).toContain("To: a@b.com")
    expect(mime).toContain("Subject: Hi")

    expect(result).toEqual({
      externalMessageId: "msg-sent-1",
      threadId: "thread-1",
    })
  })

  it("attaches threadId + In-Reply-To when replying", async () => {
    await sendMessage({
      userId: USER,
      to: [{ email: "a@b.com" }],
      subject: "Re: Hi",
      bodyText: "Body",
      threadId: "thread-42",
      inReplyTo: "<orig@mail.gmail.com>",
    })

    const arg = sendMock.mock.calls[0][0]
    expect(arg.requestBody.threadId).toBe("thread-42")
    const mime = decodeRaw(arg.requestBody.raw)
    expect(mime).toContain("In-Reply-To: <orig@mail.gmail.com>")
  })

  it("rejects an empty recipient list", async () => {
    await expect(
      sendMessage({ userId: USER, to: [], subject: "x", bodyText: "y" }),
    ).rejects.toThrow(/at least one recipient/i)
    expect(sendMock).not.toHaveBeenCalled()
  })
})
