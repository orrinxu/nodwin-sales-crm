import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  renderEmailTemplate,
  evaluateNotificationChannels,
  sendSlackNotification,
  postToSlackWebhook,
  toExternalUrl,
} from "./delivery"

vi.mock("server-only", () => ({}))

const mockFrom = vi.fn()

function mockChain(finalResult: { data: unknown; error: Error | null }) {
  const chain: Record<string, () => typeof chain> & {
    then?: (resolve: (v: unknown) => void) => void
  } = {}
  const methods = [
    "select",
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "is",
    "not",
    "in",
    "order",
    "limit",
    "range",
    "single",
    "insert",
    "update",
    "upsert",
    "delete",
  ]
  for (const method of methods) {
    Object.defineProperty(chain, method, { value: () => chain, enumerable: true })
  }
  chain.then = (resolve: (v: unknown) => void) => {
    resolve(finalResult)
  }
  return chain
}

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

vi.mock("../security/env", () => ({
  env: {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    APP_URL: "https://crm.example.com",
  },
}))

function makeRoutingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "route-1",
    event_type: "stage_change",
    channel: "in_app",
    enabled: true,
    entity_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    created_by: null,
    updated_by: null,
    ...overrides,
  }
}

function makeOverrideRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "override-1",
    user_id: "user-1",
    event_type: "stage_change",
    channel: "in_app",
    enabled: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    created_by: null,
    updated_by: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("renderEmailTemplate", () => {
  it("replaces variables in subject, bodyHtml, and bodyText", () => {
    const template = {
      subject: "Hello {{name}}, your deal {{deal_name}} moved",
      bodyHtml: "<p>Hi {{name}},</p><p>Deal {{deal_name}} moved to {{stage}}.</p>",
      bodyText: "Hi {{name}}, deal {{deal_name}} moved to {{stage}}.",
    }

    const variables = {
      name: "Alice",
      deal_name: "Acme Q2",
      stage: "Negotiate",
    }

    const result = renderEmailTemplate(template, variables)

    expect(result.subject).toBe("Hello Alice, your deal Acme Q2 moved")
    expect(result.bodyHtml).toBe(
      "<p>Hi Alice,</p><p>Deal Acme Q2 moved to Negotiate.</p>",
    )
    expect(result.bodyText).toBe(
      "Hi Alice, deal Acme Q2 moved to Negotiate.",
    )
  })

  it("leaves unknown placeholders unchanged in bodyText", () => {
    const template = {
      subject: "No placeholders here",
      bodyHtml: "<p>No placeholders</p>",
      bodyText: "Unknown {{??}}",
    }

    const result = renderEmailTemplate(template, {})

    expect(result.bodyText).toBe("Unknown {{??}}")
  })

  it("handles multiple occurrences of the same variable", () => {
    const template = {
      subject: "{{name}} updated {{name}}",
      bodyHtml: "<p>{{name}} updated {{name}}</p>",
      bodyText: "{{name}} updated {{name}}",
    }

    const result = renderEmailTemplate(template, { name: "Bob" })

    expect(result.subject).toBe("Bob updated Bob")
    expect(result.bodyHtml).toBe("<p>Bob updated Bob</p>")
    expect(result.bodyText).toBe("Bob updated Bob")
  })

  it("escapes HTML in variable values", () => {
    const template = {
      subject: "Hello {{name}}",
      bodyHtml: "<p>Hi {{name}}</p>",
      bodyText: "Hi {{name}}",
    }

    const result = renderEmailTemplate(template, {
      name: '<script>alert("xss")</script>',
    })

    expect(result.bodyHtml).toBe(
      "<p>Hi &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</p>",
    )
  })

  it("returns empty bodyText when template has none", () => {
    const template = {
      subject: "Hello",
      bodyHtml: "<p>Hello</p>",
    }

    const result = renderEmailTemplate(template, {})

    expect(result.bodyText).toBe("")
  })

  it("handles variables with special regex characters safely", () => {
    const template = {
      subject: "{{count}} items",
      bodyHtml: "<p>{{count}} items</p>",
      bodyText: "{{count}} items",
    }

    const result = renderEmailTemplate(template, { count: "$1,000.00" })

    expect(result.bodyText).toBe("$1,000.00 items")
  })
})

describe("evaluateNotificationChannels", () => {
  it("returns channels from org-level routing when no overrides exist", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "notification_routing") {
        return mockChain({
          data: [
            makeRoutingRow({ id: "r1", event_type: "deal_won", channel: "in_app", enabled: true, entity_id: null }),
            makeRoutingRow({ id: "r2", event_type: "deal_won", channel: "email", enabled: true, entity_id: null }),
            makeRoutingRow({ id: "r3", event_type: "deal_won", channel: "slack", enabled: false, entity_id: null }),
          ],
          error: null,
        })
      }
      if (table === "user_notification_overrides") {
        return mockChain({ data: [], error: null })
      }
      return mockChain({ data: null, error: new Error("unknown table") })
    })

    const channels = await evaluateNotificationChannels("user-1", "deal_won")

    expect(channels).toContain("in_app")
    expect(channels).toContain("email")
    expect(channels).not.toContain("slack")
  })

  it("applies user overrides over org-level routing", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "notification_routing") {
        return mockChain({
          data: [
            makeRoutingRow({ id: "r1", event_type: "deal_assigned", channel: "in_app", enabled: true, entity_id: null }),
            makeRoutingRow({ id: "r2", event_type: "deal_assigned", channel: "email", enabled: true, entity_id: null }),
          ],
          error: null,
        })
      }
      if (table === "user_notification_overrides") {
        return mockChain({
          data: [
            makeOverrideRow({ id: "o1", user_id: "user-1", event_type: "deal_assigned", channel: "email", enabled: false }),
          ],
          error: null,
        })
      }
      return mockChain({ data: null, error: new Error("unknown table") })
    })

    const channels = await evaluateNotificationChannels("user-1", "deal_assigned")

    expect(channels).toContain("in_app")
    expect(channels).not.toContain("email")
  })

  it("returns empty array when all channels are disabled", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "notification_routing") {
        return mockChain({
          data: [
            makeRoutingRow({ id: "r1", event_type: "mention", channel: "in_app", enabled: false, entity_id: null }),
            makeRoutingRow({ id: "r2", event_type: "mention", channel: "email", enabled: false, entity_id: null }),
          ],
          error: null,
        })
      }
      if (table === "user_notification_overrides") {
        return mockChain({ data: [], error: null })
      }
      return mockChain({ data: null, error: new Error("unknown table") })
    })

    const channels = await evaluateNotificationChannels("user-1", "mention")

    expect(channels).toEqual([])
  })

  it("user override can re-enable a disabled org channel", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "notification_routing") {
        return mockChain({
          data: [
            makeRoutingRow({ id: "r1", event_type: "stage_change", channel: "slack", enabled: false, entity_id: null }),
          ],
          error: null,
        })
      }
      if (table === "user_notification_overrides") {
        return mockChain({
          data: [
            makeOverrideRow({ id: "o1", user_id: "user-1", event_type: "stage_change", channel: "slack", enabled: true }),
          ],
          error: null,
        })
      }
      return mockChain({ data: null, error: new Error("unknown table") })
    })

    const channels = await evaluateNotificationChannels("user-1", "stage_change")

    expect(channels).toContain("slack")
  })

  it("entity-specific routing overrides org-wide defaults for that entity", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "notification_routing") {
        return mockChain({
          data: [
            makeRoutingRow({ id: "r1", event_type: "deal_won", channel: "in_app", enabled: true, entity_id: null }),
            makeRoutingRow({ id: "r2", event_type: "deal_won", channel: "in_app", enabled: false, entity_id: "entity-sg" }),
          ],
          error: null,
        })
      }
      if (table === "user_notification_overrides") {
        return mockChain({ data: [], error: null })
      }
      return mockChain({ data: null, error: new Error("unknown table") })
    })

    const channels = await evaluateNotificationChannels("user-1", "deal_won", "entity-sg")

    expect(channels).not.toContain("in_app")
  })

  it("deduplicates channels", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "notification_routing") {
        return mockChain({
          data: [
            makeRoutingRow({ id: "r1", event_type: "deal_lost", channel: "email", enabled: true, entity_id: null }),
            makeRoutingRow({ id: "r2", event_type: "deal_lost", channel: "email", enabled: true, entity_id: "entity-sg" }),
          ],
          error: null,
        })
      }
      if (table === "user_notification_overrides") {
        return mockChain({
          data: [
            makeOverrideRow({ id: "o1", user_id: "user-1", event_type: "deal_lost", channel: "email", enabled: true }),
          ],
          error: null,
        })
      }
      return mockChain({ data: null, error: new Error("unknown table") })
    })

    const channels = await evaluateNotificationChannels("user-1", "deal_lost", "entity-sg")

    expect(channels.filter((c) => c === "email").length).toBe(1)
  })

  it("resolves a core-event global routing row to its channel (ORR-798 seed)", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "notification_routing") {
        return mockChain({
          data: [
            makeRoutingRow({ id: "r1", event_type: "deal_won", channel: "in_app", enabled: true, entity_id: null }),
            makeRoutingRow({ id: "r2", event_type: "deal_won", channel: "email", enabled: true, entity_id: null }),
          ],
          error: null,
        })
      }
      if (table === "user_notification_overrides") return mockChain({ data: [], error: null })
      return mockChain({ data: null, error: new Error("unknown table") })
    })

    const channels = await evaluateNotificationChannels("user-1", "deal_won")
    expect(channels).toEqual(expect.arrayContaining(["in_app", "email"]))
  })

  it("does NOT apply an entity-scoped route when the event carries no entity (ORR-798 skip fix)", async () => {
    // A route scoped to entity-sg must never fire org-wide when the trigger
    // passes no entityId — the old skip condition let it match everything.
    mockFrom.mockImplementation((table: string) => {
      if (table === "notification_routing") {
        return mockChain({
          data: [
            makeRoutingRow({ id: "r1", event_type: "deal_won", channel: "in_app", enabled: true, entity_id: "entity-sg" }),
          ],
          error: null,
        })
      }
      if (table === "user_notification_overrides") return mockChain({ data: [], error: null })
      return mockChain({ data: null, error: new Error("unknown table") })
    })

    const channels = await evaluateNotificationChannels("user-1", "deal_won")
    expect(channels).toEqual([])
  })

  it("entity-scoped DISABLED row shadows an enabled global row for that entity (ORR-798 shadowing)", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "notification_routing") {
        return mockChain({
          data: [
            makeRoutingRow({ id: "r1", event_type: "deal_won", channel: "email", enabled: true, entity_id: null }),
            makeRoutingRow({ id: "r2", event_type: "deal_won", channel: "email", enabled: false, entity_id: "entity-sg" }),
          ],
          error: null,
        })
      }
      if (table === "user_notification_overrides") return mockChain({ data: [], error: null })
      return mockChain({ data: null, error: new Error("unknown table") })
    })

    // For entity-sg the disabled scoped row wins → email off.
    expect(await evaluateNotificationChannels("user-1", "deal_won", "entity-sg")).toEqual([])
    // For a different entity the global enabled row applies → email on.
    expect(await evaluateNotificationChannels("user-1", "deal_won", "entity-other")).toContain("email")
  })

  it("throws when routing query fails", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "notification_routing") {
        return mockChain({ data: null, error: new Error("DB error") })
      }
      return mockChain({ data: null, error: new Error("unknown table") })
    })

    await expect(
      evaluateNotificationChannels("user-1", "deal_won"),
    ).rejects.toThrow("Failed to load notification routing")
  })

  it("throws when overrides query fails", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "notification_routing") {
        return mockChain({ data: [], error: null })
      }
      if (table === "user_notification_overrides") {
        return mockChain({ data: null, error: new Error("DB error") })
      }
      return mockChain({ data: null, error: new Error("unknown table") })
    })

    await expect(
      evaluateNotificationChannels("user-1", "deal_won"),
    ).rejects.toThrow("Failed to load user overrides")
  })
})

describe("toExternalUrl", () => {
  it("prefixes a relative deep link with APP_URL for external delivery", () => {
    expect(toExternalUrl("/opportunities/abc123")).toBe(
      "https://crm.example.com/opportunities/abc123",
    )
  })

  it("adds a leading slash when the path lacks one", () => {
    expect(toExternalUrl("opportunities/abc")).toBe(
      "https://crm.example.com/opportunities/abc",
    )
  })

  it("leaves an already-absolute URL untouched", () => {
    expect(toExternalUrl("https://other.example.com/x")).toBe(
      "https://other.example.com/x",
    )
  })

  it("passes undefined through (no link)", () => {
    expect(toExternalUrl(undefined)).toBeUndefined()
  })
})

describe("postToSlackWebhook", () => {
  it("POSTs the text to the webhook URL and returns true on ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)

    const ok = await postToSlackWebhook("https://hooks.slack.com/services/AAA", "hello")

    expect(ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://hooks.slack.com/services/AAA")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body)).toEqual({ text: "hello" })

    vi.unstubAllGlobals()
  })

  it("returns false (never throws) when Slack responds non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    expect(await postToSlackWebhook("https://hooks.slack.com/services/AAA", "x")).toBe(false)
    vi.unstubAllGlobals()
  })

  it("returns false (never throws) when the request errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")))
    expect(await postToSlackWebhook("https://hooks.slack.com/services/AAA", "x")).toBe(false)
    vi.unstubAllGlobals()
  })
})

describe("sendSlackNotification", () => {
  it("broadcasts to every connected webhook", async () => {
    mockFrom.mockReturnValue(
      mockChain({
        data: [
          { webhook_url: "https://hooks.slack.com/services/AAA" },
          { webhook_url: "https://hooks.slack.com/services/BBB" },
        ],
        error: null,
      }),
    )
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)

    await sendSlackNotification("deal moved")

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const urls = fetchMock.mock.calls.map((c) => c[0]).sort()
    expect(urls).toEqual([
      "https://hooks.slack.com/services/AAA",
      "https://hooks.slack.com/services/BBB",
    ])
    vi.unstubAllGlobals()
  })

  it("no-ops (no fetch) when no webhook is connected", async () => {
    mockFrom.mockReturnValue(mockChain({ data: [], error: null }))
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)

    await sendSlackNotification("deal moved")

    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it("throws when the connections query fails", async () => {
    mockFrom.mockReturnValue(mockChain({ data: null, error: new Error("DB error") }))
    await expect(sendSlackNotification("x")).rejects.toThrow("Failed to load Slack connections")
  })

  // ORR-811a — a revoked/deleted webhook must stop failing silently: retry once,
  // then flag the connection status=error so /admin/slack surfaces it.
  it("retries once then flags the connection status=error when its webhook keeps failing", async () => {
    const onUpdate = vi.fn()
    // from('slack_connections') is used for BOTH the select (load webhooks) and
    // the update (mark error) — return an object that supports either chain.
    const selectChain: Record<string, unknown> = {}
    selectChain.eq = () => selectChain
    selectChain.not = () => selectChain
    selectChain.then = (r: (v: unknown) => void) =>
      r({ data: [{ id: "c1", webhook_url: "https://hooks.slack.com/services/AAA" }], error: null })
    const updateChain: Record<string, unknown> = {}
    updateChain.eq = () => updateChain
    updateChain.then = (r: (v: unknown) => void) => {
      onUpdate()
      r({ error: null })
    }
    mockFrom.mockReturnValue({
      select: () => selectChain,
      update: () => updateChain,
    })

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    vi.stubGlobal("fetch", fetchMock)

    await sendSlackNotification("deal moved")

    expect(fetchMock).toHaveBeenCalledTimes(2) // original + one retry
    expect(onUpdate).toHaveBeenCalledTimes(1) // flagged status=error
    vi.unstubAllGlobals()
  })

  it("does NOT flag the connection when a retry succeeds", async () => {
    const onUpdate = vi.fn()
    const selectChain: Record<string, unknown> = {}
    selectChain.eq = () => selectChain
    selectChain.not = () => selectChain
    selectChain.then = (r: (v: unknown) => void) =>
      r({ data: [{ id: "c1", webhook_url: "https://hooks.slack.com/services/AAA" }], error: null })
    const updateChain: Record<string, unknown> = {}
    updateChain.eq = () => updateChain
    updateChain.then = (r: (v: unknown) => void) => {
      onUpdate()
      r({ error: null })
    }
    mockFrom.mockReturnValue({
      select: () => selectChain,
      update: () => updateChain,
    })

    // Fail once, succeed on the retry.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true })
    vi.stubGlobal("fetch", fetchMock)

    await sendSlackNotification("deal moved")

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(onUpdate).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
