import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

// Capture the payload passed to `.insert()` so we can assert the echo-guard
// metadata + external_message_id shape without a real DB.
const { insertCapture } = vi.hoisted(() => ({
  insertCapture: { value: null as Record<string, unknown> | null },
}))

function chain() {
  const c: Record<string, unknown> = {}
  const self = () => c
  c.from = self
  c.insert = (payload: Record<string, unknown>) => {
    insertCapture.value = payload
    return c
  }
  c.select = self
  // Echo back a row shaped like the ACTIVITY_SELECT projection.
  c.single = async () => ({
    data: {
      id: "act-out-1",
      account_id: (payload()?.account_id ?? null) as string | null,
      opportunity_id: (payload()?.opportunity_id ?? null) as string | null,
      contact_id: (payload()?.contact_id ?? null) as string | null,
      user_id: "u1",
      type: "email_outbound",
      external_thread_id: (payload()?.external_thread_id ?? null) as
        | string
        | null,
      subject: (payload()?.subject ?? null) as string | null,
      body: (payload()?.body ?? null) as string | null,
      starts_at: null,
      ends_at: null,
      time_zone: null,
      all_day: false,
      external_event_id: null,
      external_message_id: (payload()?.external_message_id ?? null) as
        | string
        | null,
      metadata: payload()?.metadata ?? {},
      created_at: "2026-07-26T00:00:00Z",
      updated_at: "2026-07-26T00:00:00Z",
      author: { full_name: "Sender" },
      opportunity: null,
      account: null,
      contact: null,
    },
    error: null,
  })
  return c
}
function payload() {
  return insertCapture.value
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => chain(),
}))

import { createEmailOutboundActivity } from "./activities"

const ctx = {
  user: { id: "u1", email: "sender@nodwin.com", role: "sales" },
  source: "web" as const,
}

beforeEach(() => {
  insertCapture.value = null
})

describe("createEmailOutboundActivity (ORR-835)", () => {
  it("inserts type='email_outbound' with the sent message id + echo-guard metadata", async () => {
    const activity = await createEmailOutboundActivity(ctx, {
      opportunityId: "opp-1",
      accountId: "acc-1",
      contactId: null,
      subject: "Proposal",
      body: "Here it is.",
      externalMessageId: "gmail-msg-1",
      externalThreadId: "thread-1",
      from: { email: "sender@nodwin.com" },
      to: [{ email: "buyer@acme.com", name: "Buyer" }],
      cc: [{ email: "cc@acme.com" }],
    })

    const p = payload() as Record<string, unknown>
    expect(p.type).toBe("email_outbound")
    // Idempotency / echo key = the sent Gmail message id.
    expect(p.external_message_id).toBe("gmail-msg-1")
    expect(p.external_thread_id).toBe("thread-1")

    // ECHO-LOOP GUARD: source pinned to 'crm' (not the request source) so the pull
    // sync recognises the row as CRM-authored; from/to/cc are {email,name} objects
    // for the ORR-834 timeline renderer.
    const meta = p.metadata as Record<string, unknown>
    expect(meta.source).toBe("crm")
    expect(meta.from).toEqual({ email: "sender@nodwin.com" })
    expect(meta.to).toEqual([{ email: "buyer@acme.com", name: "Buyer" }])
    expect(meta.cc).toEqual([{ email: "cc@acme.com" }])

    // Domain mapping surfaces the id + type back to callers.
    expect(activity.type).toBe("email_outbound")
    expect(activity.externalMessageId).toBe("gmail-msg-1")
  })
})
