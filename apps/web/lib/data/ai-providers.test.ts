import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const { mockEnv, store } = vi.hoisted(() => ({
  mockEnv: {} as Record<string, string | undefined>,
  store: {
    providers: [] as Record<string, unknown>[],
    settings: null as Record<string, unknown> | null,
    updates: [] as { table: string; patch: Record<string, unknown>; eq?: { col: string; val: unknown } }[],
    inserts: [] as { table: string; row: Record<string, unknown> }[],
  },
}))

vi.mock("@/lib/security/env", () => ({
  env: new Proxy(mockEnv, { get: (t, k) => t[k as string] }),
}))

// A minimal thenable query-builder: `await from(t).select("*")` yields the rows
// array; `.maybeSingle()` yields the first/single row; `update(p).eq(c,v)` records
// the patch; `insert(row)` records the row.
class QB {
  private single = false
  private op: "select" | "update" = "select"
  private patch: Record<string, unknown> = {}
  constructor(private table: string) {}
  select() { return this }
  order() { return this }
  limit() { return this }
  update(patch: Record<string, unknown>) { this.op = "update"; this.patch = patch; return this }
  insert(row: Record<string, unknown>) { store.inserts.push({ table: this.table, row }); return Promise.resolve({ error: null }) }
  eq(col: string, val: unknown) {
    if (this.op === "update") { store.updates.push({ table: this.table, patch: this.patch, eq: { col, val } }); return Promise.resolve({ error: null }) }
    return this
  }
  maybeSingle() { this.single = true; return this.resolve() }
  then<T>(onF: (v: { data: unknown; error: null }) => T) { return this.resolve().then(onF) }
  private resolve() {
    if (this.table === "ai_providers") {
      return Promise.resolve({ data: this.single ? (store.providers[0] ?? null) : store.providers, error: null })
    }
    if (this.table === "ai_settings") {
      return Promise.resolve({ data: this.single ? store.settings : (store.settings ? [store.settings] : []), error: null })
    }
    return Promise.resolve({ data: null, error: null })
  }
}
const client = { from: (t: string) => new QB(t) }

vi.mock("@supabase/ssr", () => ({ createServerClient: () => client }))
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => client }))

import { resolveProviderChain, getAiProviders, updateAiProviders } from "./ai-providers"

const ctx = { user: { id: "u1", email: "a@nodwin.com", role: "admin" }, source: "web" as const }

function reset() {
  for (const k of Object.keys(mockEnv)) delete mockEnv[k] // eslint-disable-line security/detect-object-injection
  store.providers = []
  store.settings = null
  store.updates = []
  store.inserts = []
}

describe("resolveProviderChain (ordering + fallback)", () => {
  beforeEach(reset)

  it("orders enabled providers by priority, primary first", async () => {
    store.providers = [
      { provider: "claude", enabled: true, priority: 10, api_key: "k-claude", base_url: null, model: "c" },
      { provider: "deepseek", enabled: true, priority: 40, api_key: "k-ds", base_url: null, model: "d" },
      { provider: "gemini", enabled: true, priority: 20, api_key: "k-gem", base_url: null, model: "g" },
    ]
    store.settings = { primary_provider: "gemini" }
    const chain = await resolveProviderChain()
    expect(chain.map((r) => r.provider)).toEqual(["gemini", "claude", "deepseek"])
    expect(chain[0].apiKey).toBe("k-gem")
  })

  it("drops enabled-but-unusable providers (cloud with no key)", async () => {
    store.providers = [
      { provider: "claude", enabled: true, priority: 10, api_key: null, base_url: null, model: null },
      { provider: "deepseek", enabled: true, priority: 40, api_key: "k-ds", base_url: null, model: null },
    ]
    const chain = await resolveProviderChain()
    expect(chain.map((r) => r.provider)).toEqual(["deepseek"])
  })

  it("self-hosted needs a base_url, not a key", async () => {
    store.providers = [
      { provider: "ollama_local", enabled: true, priority: 10, api_key: null, base_url: "http://h:11434", model: "llama" },
    ]
    const chain = await resolveProviderChain()
    expect(chain.map((r) => r.provider)).toEqual(["ollama_local"])
    expect(chain[0].baseUrl).toBe("http://h:11434")
  })

  it("falls back to env-usable providers when nothing is enabled", async () => {
    mockEnv.ANTHROPIC_API_KEY = "env-claude"
    const chain = await resolveProviderChain()
    expect(chain.map((r) => r.provider)).toEqual(["claude"])
    expect(chain[0].apiKey).toBe("env-claude")
  })

  it("availability guard: enabled-but-all-unusable falls back to env instead of empty (CTO MEDIUM)", async () => {
    mockEnv.OPENAI_COMPATIBLE_BASE_URL = "http://env:8080/v1"
    store.providers = [
      { provider: "claude", enabled: true, priority: 10, api_key: null, base_url: null, model: null }, // enabled, no key → unusable
    ]
    const chain = await resolveProviderChain()
    expect(chain.map((r) => r.provider)).toEqual(["openai_compatible"])
  })

  it("DB base_url wins, env fills the model gap", async () => {
    mockEnv.OLLAMA_MODEL = "env-llama"
    store.providers = [
      { provider: "ollama_local", enabled: true, priority: 10, api_key: null, base_url: "http://db:11434", model: null },
    ]
    const chain = await resolveProviderChain()
    expect(chain[0].baseUrl).toBe("http://db:11434")
    expect(chain[0].model).toBe("env-llama")
  })

  it("per-feature override moves the pinned provider to the front (ORR-674)", async () => {
    store.providers = [
      { provider: "claude", enabled: true, priority: 10, api_key: "k-claude", base_url: null, model: "c" },
      { provider: "gemini", enabled: true, priority: 20, api_key: "k-gem", base_url: null, model: "g" },
      { provider: "deepseek", enabled: true, priority: 40, api_key: "k-ds", base_url: null, model: "d" },
    ]
    store.settings = { feature_provider_overrides: { opportunity_extraction: "deepseek" } }
    // Without a feature, the global priority order stands.
    expect((await resolveProviderChain()).map((r) => r.provider)).toEqual(["claude", "gemini", "deepseek"])
    // The override pins deepseek first for that feature only; the rest stay as fallback.
    expect((await resolveProviderChain("opportunity_extraction")).map((r) => r.provider)).toEqual([
      "deepseek", "claude", "gemini",
    ])
    // A different feature is unaffected.
    expect((await resolveProviderChain("draft_email")).map((r) => r.provider)).toEqual([
      "claude", "gemini", "deepseek",
    ])
  })

  it("per-feature override is ignored when the pinned provider is not usable", async () => {
    store.providers = [
      { provider: "claude", enabled: true, priority: 10, api_key: "k-claude", base_url: null, model: "c" },
    ]
    // gemini is pinned but has no key/row → not in the usable chain → no reorder, no crash.
    store.settings = { feature_provider_overrides: { opportunity_extraction: "gemini" } }
    expect((await resolveProviderChain("opportunity_extraction")).map((r) => r.provider)).toEqual(["claude"])
  })
})

describe("getAiProviders (masking)", () => {
  beforeEach(reset)

  it("never returns a raw api_key — only hasApiKey", async () => {
    store.providers = [
      { provider: "claude", enabled: true, priority: 10, api_key: "super-secret", base_url: null, model: "c" },
    ]
    store.settings = { primary_provider: "claude" }
    const view = await getAiProviders(ctx)
    expect(JSON.stringify(view)).not.toContain("super-secret")
    const claude = view.providers.find((p) => p.provider === "claude")!
    expect(claude.hasApiKey).toBe(true)
    expect(claude.configured).toBe(true)
    expect(view.primaryProvider).toBe("claude")
    // all six providers are always listed
    expect(view.providers).toHaveLength(6)
  })

  it("marks env-only providers configured even without a DB row", async () => {
    mockEnv.GOOGLE_API_KEY = "env-gem"
    const view = await getAiProviders(ctx)
    const gemini = view.providers.find((p) => p.provider === "gemini")!
    expect(gemini.hasApiKey).toBe(false) // DB has no key
    expect(gemini.configured).toBe(true) // env makes it usable
  })
})

describe("updateAiProviders (write-only secrets)", () => {
  beforeEach(reset)

  it("blank api_key never writes the column (leave-blank-to-keep)", async () => {
    await updateAiProviders(ctx, {
      providers: [{ provider: "claude", enabled: true, apiKey: "", baseUrl: "", model: "c", priority: 10 }],
    })
    const claudeUpdate = store.updates.find((u) => u.eq?.val === "claude")!
    expect(claudeUpdate.patch).not.toHaveProperty("api_key")
    expect(claudeUpdate.patch.base_url).toBeNull() // "" → null
    expect(claudeUpdate.patch.enabled).toBe(true)
  })

  it("a provided api_key is written", async () => {
    await updateAiProviders(ctx, {
      providers: [{ provider: "deepseek", apiKey: "new-key", priority: 40 }],
    })
    const dsUpdate = store.updates.find((u) => u.eq?.val === "deepseek")!
    expect(dsUpdate.patch.api_key).toBe("new-key")
  })

  it("sets the primary on the ai_settings row", async () => {
    store.settings = { id: "s1", primary_provider: null }
    await updateAiProviders(ctx, { providers: [], primaryProvider: "gemini" })
    const settingsUpdate = store.updates.find((u) => u.table === "ai_settings")!
    expect(settingsUpdate.patch.primary_provider).toBe("gemini")
  })

  it("writes the per-feature override map to ai_settings (ORR-674)", async () => {
    store.settings = { id: "s1", primary_provider: null }
    await updateAiProviders(ctx, {
      providers: [],
      featureProviderOverrides: { opportunity_extraction: "claude" },
    })
    const settingsUpdate = store.updates.find((u) => u.table === "ai_settings")!
    expect(settingsUpdate.patch.feature_provider_overrides).toEqual({ opportunity_extraction: "claude" })
  })

  it("leaves ai_settings untouched when neither primary nor overrides are sent", async () => {
    store.settings = { id: "s1", primary_provider: null }
    await updateAiProviders(ctx, { providers: [{ provider: "claude", enabled: true, priority: 10 }] })
    expect(store.updates.find((u) => u.table === "ai_settings")).toBeUndefined()
  })
})
