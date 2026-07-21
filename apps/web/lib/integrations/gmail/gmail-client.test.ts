// @vitest-environment node
// Runs in the Node runtime (matches route handlers / background jobs), matching prod.
// Node runtime also gives us the real `Buffer` used for base64url body decoding.
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

// Mock the token-store so no real DB / crypto / network is involved, but keep its
// REAL typed error classes so `instanceof` checks match what the client propagates.
const { getTokenMock } = vi.hoisted(() => ({ getTokenMock: vi.fn() }))
vi.mock("../google/token-store", async () => {
  const actual = await vi.importActual<
    typeof import("../google/token-store")
  >("../google/token-store")
  return { ...actual, getValidGoogleAccessToken: getTokenMock }
})

// Mock googleapis so nothing hits the network. The mocked OAuth2 records the
// credentials set on it; google.gmail returns a client whose users.* surface we
// drive per test.
const {
  getProfileMock,
  historyListMock,
  messagesListMock,
  messagesGetMock,
  setCredentialsMock,
  oauth2Ctor,
  gmailFactory,
} = vi.hoisted(() => {
  const getProfileMock = vi.fn()
  const historyListMock = vi.fn()
  const messagesListMock = vi.fn()
  const messagesGetMock = vi.fn()
  const setCredentialsMock = vi.fn()
  const oauth2Ctor = vi.fn(() => ({ setCredentials: setCredentialsMock }))
  const gmailFactory = vi.fn(() => ({
    users: {
      getProfile: getProfileMock,
      history: { list: historyListMock },
      messages: { list: messagesListMock, get: messagesGetMock },
    },
  }))
  return {
    getProfileMock,
    historyListMock,
    messagesListMock,
    messagesGetMock,
    setCredentialsMock,
    oauth2Ctor,
    gmailFactory,
  }
})
vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: oauth2Ctor },
    gmail: gmailFactory,
  },
}))

import {
  getProfile,
  listHistory,
  listMessageIds,
  getMessage,
  normalizeMessage,
  parseAddress,
  parseAddressList,
  GMAIL_READONLY_SCOPE,
  GmailHistoryExpiredError,
} from "./gmail-client"

const USER = "user-1"

/** base64url-encode a UTF-8 string the way Gmail returns body data. */
function b64url(s: string): string {
  return Buffer.from(s, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

beforeEach(() => {
  vi.clearAllMocks()
  getTokenMock.mockResolvedValue("ya29.live-token")
})

describe("parseAddress / parseAddressList (ORR-831)", () => {
  it("parses a display-name + angle-bracket address", () => {
    expect(parseAddress("Alice Example <alice@nodwin.com>")).toEqual({
      email: "alice@nodwin.com",
      name: "Alice Example",
    })
  })

  it("parses a bare address with no name", () => {
    expect(parseAddress("bob@nodwin.com")).toEqual({ email: "bob@nodwin.com" })
  })

  it("strips quotes around a display name", () => {
    expect(parseAddress('"Doe, John" <john@nodwin.com>')).toEqual({
      email: "john@nodwin.com",
      name: "Doe, John",
    })
  })

  it("returns null for empty input", () => {
    expect(parseAddress("")).toBeNull()
    expect(parseAddress(null)).toBeNull()
  })

  it("splits a list without breaking on commas inside quotes/angles", () => {
    const result = parseAddressList(
      '"Doe, John" <john@nodwin.com>, jane@nodwin.com, Bob <bob@x.com>',
    )
    expect(result).toEqual([
      { email: "john@nodwin.com", name: "Doe, John" },
      { email: "jane@nodwin.com" },
      { email: "bob@x.com", name: "Bob" },
    ])
  })

  it("returns [] for an empty list", () => {
    expect(parseAddressList(null)).toEqual([])
  })
})

describe("normalizeMessage (ORR-831)", () => {
  it("parses a multipart message: text + html bodies, headers, attachment metadata", () => {
    const result = normalizeMessage({
      id: "msg-1",
      threadId: "thread-1",
      snippet: "Hi there",
      internalDate: "1721558400000",
      labelIds: ["INBOX", "UNREAD"],
      payload: {
        mimeType: "multipart/mixed",
        headers: [
          { name: "From", value: "Alice <alice@nodwin.com>" },
          { name: "To", value: "bob@nodwin.com, Carol <carol@x.com>" },
          { name: "Cc", value: "dave@x.com" },
          { name: "Subject", value: "Quarterly review" },
          { name: "Message-ID", value: "<abc@mail.google.com>" },
          { name: "In-Reply-To", value: "<prev@mail.google.com>" },
          { name: "References", value: "<r1@x> <r2@x>" },
        ],
        parts: [
          {
            mimeType: "multipart/alternative",
            parts: [
              { mimeType: "text/plain", body: { data: b64url("plain body") } },
              {
                mimeType: "text/html",
                body: { data: b64url("<p>html body</p>") },
              },
            ],
          },
          {
            mimeType: "application/pdf",
            filename: "deck.pdf",
            body: { attachmentId: "att-123", size: 20480 },
          },
        ],
      },
    })

    expect(result.externalMessageId).toBe("msg-1")
    expect(result.threadId).toBe("thread-1")
    expect(result.from).toEqual({ email: "alice@nodwin.com", name: "Alice" })
    expect(result.to).toEqual([
      { email: "bob@nodwin.com" },
      { email: "carol@x.com", name: "Carol" },
    ])
    expect(result.cc).toEqual([{ email: "dave@x.com" }])
    expect(result.subject).toBe("Quarterly review")
    expect(result.bodyText).toBe("plain body")
    expect(result.bodyHtml).toBe("<p>html body</p>")
    expect(result.snippet).toBe("Hi there")
    expect(result.internalDate).toBe("1721558400000")
    expect(result.labelIds).toEqual(["INBOX", "UNREAD"])
    expect(result.inReplyTo).toBe("<prev@mail.google.com>")
    expect(result.references).toBe("<r1@x> <r2@x>")
    expect(result.attachments).toEqual([
      {
        filename: "deck.pdf",
        mimeType: "application/pdf",
        size: 20480,
        attachmentId: "att-123",
      },
    ])
  })

  it("parses a single-part plain-text message (body on payload)", () => {
    const result = normalizeMessage({
      id: "msg-2",
      threadId: "thread-2",
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "From", value: "sender@x.com" },
          { name: "Subject", value: "Plain" },
        ],
        body: { data: b64url("just text") },
      },
    })

    expect(result.bodyText).toBe("just text")
    expect(result.bodyHtml).toBeNull()
    expect(result.from).toEqual({ email: "sender@x.com" })
    expect(result.attachments).toEqual([])
    expect(result.to).toEqual([])
  })

  it("parses a single-part html message", () => {
    const result = normalizeMessage({
      id: "msg-3",
      payload: {
        mimeType: "text/html",
        headers: [{ name: "Subject", value: "HTML only" }],
        body: { data: b64url("<b>bold</b>") },
      },
    })

    expect(result.bodyHtml).toBe("<b>bold</b>")
    expect(result.bodyText).toBeNull()
    expect(result.subject).toBe("HTML only")
  })

  it("tolerates a message with no payload / headers", () => {
    const result = normalizeMessage({ id: "msg-4" })
    expect(result.externalMessageId).toBe("msg-4")
    expect(result.from).toBeNull()
    expect(result.subject).toBeNull()
    expect(result.bodyText).toBe("")
    expect(result.labelIds).toEqual([])
    expect(result.attachments).toEqual([])
  })
})

describe("getProfile (ORR-831)", () => {
  it("requests a token for the readonly scope and returns the cursor", async () => {
    getProfileMock.mockResolvedValue({
      data: { emailAddress: "me@nodwin.com", historyId: "9999" },
    })

    const result = await getProfile(USER)

    expect(getTokenMock).toHaveBeenCalledWith(USER, [GMAIL_READONLY_SCOPE])
    expect(setCredentialsMock).toHaveBeenCalledWith({
      access_token: "ya29.live-token",
    })
    expect(result).toEqual({
      emailAddress: "me@nodwin.com",
      historyId: "9999",
    })
  })
})

describe("listHistory (ORR-831)", () => {
  it("maps messagesAdded ids (de-duplicated) and passes the messageAdded filter", async () => {
    historyListMock.mockResolvedValue({
      data: {
        history: [
          { messagesAdded: [{ message: { id: "m1" } }, { message: { id: "m2" } }] },
          { messagesAdded: [{ message: { id: "m2" } }, { message: { id: "m3" } }] },
        ],
        historyId: "10050",
        nextPageToken: "pg-2",
      },
    })

    const result = await listHistory({
      userId: USER,
      startHistoryId: "10000",
    })

    const arg = historyListMock.mock.calls[0][0]
    expect(arg.startHistoryId).toBe("10000")
    expect(arg.historyTypes).toEqual(["messageAdded"])
    expect(result.addedMessageIds).toEqual(["m1", "m2", "m3"])
    expect(result.historyId).toBe("10050")
    expect(result.nextPageToken).toBe("pg-2")
  })

  it("returns an empty list when there are no history records", async () => {
    historyListMock.mockResolvedValue({ data: { historyId: "10000" } })

    const result = await listHistory({ userId: USER, startHistoryId: "10000" })

    expect(result.addedMessageIds).toEqual([])
    expect(result.nextPageToken).toBeUndefined()
  })

  it("throws GmailHistoryExpiredError on a 404 (err.code)", async () => {
    historyListMock.mockRejectedValue(
      Object.assign(new Error("Not Found"), { code: 404 }),
    )

    await expect(
      listHistory({ userId: USER, startHistoryId: "stale" }),
    ).rejects.toBeInstanceOf(GmailHistoryExpiredError)
  })

  it("throws GmailHistoryExpiredError on a 404 (err.response.status)", async () => {
    historyListMock.mockRejectedValue(
      Object.assign(new Error("Not Found"), { response: { status: 404 } }),
    )

    await expect(
      listHistory({ userId: USER, startHistoryId: "stale" }),
    ).rejects.toBeInstanceOf(GmailHistoryExpiredError)
  })

  it("propagates non-404 API errors unchanged", async () => {
    const err = Object.assign(new Error("boom"), { code: 500 })
    historyListMock.mockRejectedValue(err)

    await expect(
      listHistory({ userId: USER, startHistoryId: "10000" }),
    ).rejects.toBe(err)
  })

  it("propagates token-store errors unchanged (no history call)", async () => {
    const { GoogleScopeMissingError } = await vi.importActual<
      typeof import("../google/token-store")
    >("../google/token-store")
    getTokenMock.mockRejectedValue(
      new GoogleScopeMissingError([GMAIL_READONLY_SCOPE]),
    )

    await expect(
      listHistory({ userId: USER, startHistoryId: "10000" }),
    ).rejects.toBeInstanceOf(GoogleScopeMissingError)
    expect(historyListMock).not.toHaveBeenCalled()
  })
})

describe("listMessageIds (ORR-831)", () => {
  it("defaults to newer_than:30d and maps ids", async () => {
    messagesListMock.mockResolvedValue({
      data: {
        messages: [{ id: "a" }, { id: "b" }, {}],
        nextPageToken: "pg-2",
      },
    })

    const result = await listMessageIds({ userId: USER })

    expect(messagesListMock.mock.calls[0][0]).toEqual({
      userId: "me",
      q: "newer_than:30d",
      pageToken: undefined,
    })
    expect(result.messageIds).toEqual(["a", "b"])
    expect(result.nextPageToken).toBe("pg-2")
  })

  it("passes a custom query and pageToken", async () => {
    messagesListMock.mockResolvedValue({ data: { messages: [] } })

    await listMessageIds({
      userId: USER,
      query: "from:acme.com",
      pageToken: "pg-1",
    })

    expect(messagesListMock.mock.calls[0][0]).toEqual({
      userId: "me",
      q: "from:acme.com",
      pageToken: "pg-1",
    })
  })
})

describe("getMessage (ORR-831)", () => {
  it("fetches a message in full format and normalizes it", async () => {
    messagesGetMock.mockResolvedValue({
      data: {
        id: "msg-9",
        threadId: "thread-9",
        payload: {
          mimeType: "text/plain",
          headers: [{ name: "From", value: "x@y.com" }],
          body: { data: b64url("hello") },
        },
      },
    })

    const result = await getMessage({ userId: USER, messageId: "msg-9" })

    expect(messagesGetMock).toHaveBeenCalledWith({
      userId: "me",
      id: "msg-9",
      format: "full",
    })
    expect(result.externalMessageId).toBe("msg-9")
    expect(result.bodyText).toBe("hello")
  })
})
