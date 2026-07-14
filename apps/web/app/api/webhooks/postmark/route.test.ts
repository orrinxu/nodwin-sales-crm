import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))

const SECRET = "test-webhook-secret"

vi.mock("@/lib/security/env", () => ({
  env: {
    POSTMARK_WEBHOOK_SECRET: SECRET,
    INBOUND_EMAIL_DISABLED: false,
  },
}))

const mockProcessInboundEmail = vi.fn()
vi.mock("@/lib/email/inbound", () => ({
  processInboundEmail: (...args: unknown[]) => mockProcessInboundEmail(...args),
}))

const VALID_PAYLOAD = { MessageID: "abc-123", From: "sender@example.com", Dkim: "Pass" }

function postRequest(body: string, headerValue?: string): NextRequest {
  const headers = new Headers()
  if (headerValue != null) headers.set("x-postmark-webhook-secret", headerValue)
  return new Request("https://crm.nodwin.com/api/webhooks/postmark", {
    method: "POST",
    headers,
    body,
  }) as unknown as NextRequest
}

// The kill-switch test remocks env, so import the route fresh per test.
async function loadRoute() {
  vi.resetModules()
  return import("./route")
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("POST /api/webhooks/postmark", () => {
  it("processes an authentic payload and returns 200 with the result", async () => {
    mockProcessInboundEmail.mockResolvedValue({ status: "accepted", activityId: "act-1" })

    const { POST } = await loadRoute()
    const res = await POST(postRequest(JSON.stringify(VALID_PAYLOAD), SECRET))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: "accepted", activityId: "act-1" })
    expect(mockProcessInboundEmail).toHaveBeenCalledOnce()
    expect(mockProcessInboundEmail).toHaveBeenCalledWith(
      expect.objectContaining({ MessageID: "abc-123" }),
    )
  })

  it("returns 200 for a deadlettered result so Postmark does not retry", async () => {
    mockProcessInboundEmail.mockResolvedValue({ status: "deadlettered", reason: "DKIM verification failed" })

    const { POST } = await loadRoute()
    const res = await POST(postRequest(JSON.stringify(VALID_PAYLOAD), SECRET))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: "deadlettered", reason: "DKIM verification failed" })
  })

  it("returns 200 for a duplicate result", async () => {
    mockProcessInboundEmail.mockResolvedValue({ status: "duplicate" })

    const { POST } = await loadRoute()
    const res = await POST(postRequest(JSON.stringify(VALID_PAYLOAD), SECRET))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: "duplicate" })
  })

  it("returns 401 and never runs the pipeline when the secret is missing", async () => {
    const { POST } = await loadRoute()
    const res = await POST(postRequest(JSON.stringify(VALID_PAYLOAD)))

    expect(res.status).toBe(401)
    expect(mockProcessInboundEmail).not.toHaveBeenCalled()
  })

  it("returns 401 when the secret does not match", async () => {
    const { POST } = await loadRoute()
    const res = await POST(postRequest(JSON.stringify(VALID_PAYLOAD), "wrong-secret"))

    expect(res.status).toBe(401)
    expect(mockProcessInboundEmail).not.toHaveBeenCalled()
  })

  it("returns 401 on a malformed JSON body (rejected before the pipeline)", async () => {
    const { POST } = await loadRoute()
    const res = await POST(postRequest("{not json", SECRET))

    expect(res.status).toBe(401)
    expect(mockProcessInboundEmail).not.toHaveBeenCalled()
  })

  it("returns 500 when the pipeline throws unexpectedly (so Postmark retries)", async () => {
    mockProcessInboundEmail.mockRejectedValue(new Error("db down"))

    const { POST } = await loadRoute()
    const res = await POST(postRequest(JSON.stringify(VALID_PAYLOAD), SECRET))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "db down" })
  })

  it("short-circuits with 503 when the kill switch is set", async () => {
    vi.resetModules()
    vi.doMock("@/lib/security/env", () => ({
      env: { POSTMARK_WEBHOOK_SECRET: SECRET, INBOUND_EMAIL_DISABLED: true },
    }))

    const { POST } = await import("./route")
    const res = await POST(postRequest(JSON.stringify(VALID_PAYLOAD), SECRET))

    expect(res.status).toBe(503)
    expect(mockProcessInboundEmail).not.toHaveBeenCalled()

    vi.doUnmock("@/lib/security/env")
  })
})
