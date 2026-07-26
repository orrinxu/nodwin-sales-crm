import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/security/auth", () => ({
  requireUser: vi.fn(async () => ({
    id: "user-1",
    email: "me@nodwin.com",
    role: "sales",
  })),
}))

const { sendMessageMock, createOutboundMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
  createOutboundMock: vi.fn(),
}))
vi.mock("@/lib/integrations/gmail/gmail-client", () => ({
  sendMessage: sendMessageMock,
}))
vi.mock("@/lib/data/activities", () => ({
  createEmailOutboundActivity: createOutboundMock,
}))

// Mock the token-store's typed error classes. The action imports these classes
// for its instanceof checks; the test throws the SAME mocked classes, so the
// module-identity match holds without loading the real token-store's deps.
vi.mock("@/lib/integrations/google/token-store", () => {
  class GoogleNotConnectedError extends Error {}
  class GoogleScopeMissingError extends Error {}
  class GoogleReauthRequiredError extends Error {}
  return {
    GoogleNotConnectedError,
    GoogleScopeMissingError,
    GoogleReauthRequiredError,
  }
})

import { createEmailOutboundAction } from "./actions"
import {
  GoogleNotConnectedError,
  GoogleScopeMissingError,
} from "@/lib/integrations/google/token-store"

beforeEach(() => {
  vi.clearAllMocks()
  sendMessageMock.mockResolvedValue({
    externalMessageId: "gmail-msg-1",
    threadId: "thread-1",
  })
  createOutboundMock.mockImplementation(async (_ctx, input) => ({
    id: "act-1",
    type: "email_outbound",
    externalMessageId: input.externalMessageId,
  }))
})

describe("createEmailOutboundAction (ORR-835)", () => {
  it("sends then records an email_outbound activity keyed on the sent message id", async () => {
    const result = await createEmailOutboundAction({
      opportunityId: "11111111-1111-1111-1111-111111111111",
      to: [{ email: "buyer@acme.com", name: "Buyer" }],
      cc: [{ email: "cc@acme.com" }],
      subject: "Proposal",
      bodyText: "Please see attached.",
    })

    // SEND happened before the activity was recorded.
    expect(sendMessageMock).toHaveBeenCalledTimes(1)
    expect(
      sendMessageMock.mock.invocationCallOrder[0],
    ).toBeLessThan(createOutboundMock.mock.invocationCallOrder[0])

    // The recorded activity carries the sent Gmail id (echo key) + structured people.
    const outInput = createOutboundMock.mock.calls[0][1]
    expect(outInput.externalMessageId).toBe("gmail-msg-1")
    expect(outInput.externalThreadId).toBe("thread-1")
    expect(outInput.opportunityId).toBe("11111111-1111-1111-1111-111111111111")
    expect(outInput.from).toEqual({ email: "me@nodwin.com" })
    expect(outInput.to).toEqual([{ email: "buyer@acme.com", name: "Buyer" }])
    expect(outInput.cc).toEqual([{ email: "cc@acme.com" }])

    expect(result.sent).toBe(true)
    expect(result.activity?.externalMessageId).toBe("gmail-msg-1")
  })

  it("forwards threadId + inReplyTo to the client for a reply", async () => {
    await createEmailOutboundAction({
      contactId: "22222222-2222-2222-2222-222222222222",
      to: [{ email: "buyer@acme.com" }],
      subject: "Re: Proposal",
      bodyText: "Thanks!",
      threadId: "thread-1",
      inReplyTo: "<orig@mail.gmail.com>",
    })
    const sendArg = sendMessageMock.mock.calls[0][0]
    expect(sendArg.threadId).toBe("thread-1")
    expect(sendArg.inReplyTo).toBe("<orig@mail.gmail.com>")
  })

  it("returns a soft not_connected reason and records NOTHING when Gmail is off", async () => {
    sendMessageMock.mockRejectedValueOnce(new GoogleNotConnectedError())
    const result = await createEmailOutboundAction({
      to: [{ email: "buyer@acme.com" }],
      subject: "x",
      bodyText: "y",
    })
    expect(result).toEqual({ sent: false, reason: "not_connected" })
    expect(createOutboundMock).not.toHaveBeenCalled()
  })

  it("maps a missing send scope to scope_missing", async () => {
    sendMessageMock.mockRejectedValueOnce(
      new GoogleScopeMissingError(["https://www.googleapis.com/auth/gmail.send"]),
    )
    const result = await createEmailOutboundAction({
      to: [{ email: "buyer@acme.com" }],
      subject: "x",
      bodyText: "y",
    })
    expect(result.sent).toBe(false)
    expect(result.reason).toBe("scope_missing")
  })

  it("rejects an empty recipient list at the schema", async () => {
    await expect(
      createEmailOutboundAction({ to: [], subject: "x", bodyText: "y" }),
    ).rejects.toThrow()
    expect(sendMessageMock).not.toHaveBeenCalled()
  })
})
