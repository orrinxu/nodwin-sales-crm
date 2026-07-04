import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const state: { existing: unknown; updateArg: unknown; insertArg: unknown; insertData: unknown } = {
  existing: null,
  updateArg: null,
  insertArg: null,
  insertData: null,
}

function makeSelf() {
  const self: Record<string, unknown> = {}

  self.then = (resolve: (v: { data: unknown; error: unknown }) => void) => {
    if (state.existing === null) {
      resolve({ data: null, error: { code: "PGRST116" } })
    } else {
      resolve({ data: state.existing, error: null })
    }
  }
  self.select = () => self
  self.order = () => self
  self.limit = () => self
  self.single = () => self
  self.eq = () => self
  self.update = (arg: unknown) => {
    state.updateArg = arg
    return self
  }
  self.insert = (arg: unknown) => {
    state.insertArg = arg
    const insertSelf: Record<string, unknown> = {}
    insertSelf.select = () => insertSelf
    insertSelf.single = () => insertSelf
    insertSelf.then = (resolve: (v: { data: unknown; error: null }) => void) =>
      resolve({ data: state.insertData, error: null })
    return insertSelf
  }
  return self
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ from: () => makeSelf() })),
}))
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ from: () => makeSelf() })),
}))
vi.mock("@/lib/security/env", () => ({ env: {} }))

const ctx = { user: { id: "u", email: "a@b.com", role: "admin" }, source: "web" as const }

describe("knowledge admin data layer", () => {
  beforeEach(() => {
    state.existing = null
    state.updateArg = null
    state.insertArg = null
    state.insertData = null
    vi.clearAllMocks()
  })

  it("maskSettingsForDisplay masks secrets (shows last 4 chars only)", async () => {
    const { maskSettingsForDisplay } = await import("../knowledge-admin")
    const settings = {
      id: "row-1",
      embeddingsEndpoint: "https://api.example.com/v1/embeddings",
      embeddingsModel: "text-embedding-3-small",
      embeddingsKey: "sk-abc123secretkey",
      generationEndpoint: "https://api.example.com/v1/chat",
      generationModel: "gpt-4o",
      generationKey: "sk-xyz789apikey",
      ingestionEnabled: true,
      searchEnabled: true,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    }
    const masked = maskSettingsForDisplay(settings)

    expect(masked.embeddingsKey).toBe("**************tkey")
    expect(masked.generationKey).toBe("***********ikey")
    expect(masked.embeddingsEndpoint).toBe("https://api.example.com/v1/embeddings")
    expect(masked.ingestionEnabled).toBe(true)
    expect(masked.searchEnabled).toBe(true)
  })

  it("maskSettingsForDisplay leaves short keys as-is", async () => {
    const { maskSettingsForDisplay } = await import("../knowledge-admin")
    const settings = {
      id: "row-1",
      embeddingsEndpoint: "",
      embeddingsModel: "",
      embeddingsKey: "ab",
      generationEndpoint: "",
      generationModel: "",
      generationKey: "",
      ingestionEnabled: false,
      searchEnabled: false,
      createdAt: "",
      updatedAt: "",
    }
    const masked = maskSettingsForDisplay(settings)

    expect(masked.embeddingsKey).toBe("ab")
    expect(masked.generationKey).toBe("")
  })

  it("updateAISettings keeps existing secrets when keys are omitted (write-only)", async () => {
    state.existing = {
      id: "row-1",
      embeddings_endpoint: "",
      embeddings_model: "",
      embeddings_key: "sk-secret-embeddings",
      generation_endpoint: "",
      generation_model: "",
      generation_key: "sk-secret-generation",
      ingestion_enabled: false,
      search_enabled: false,
    }
    const { updateAISettings } = await import("../knowledge-admin")
    await updateAISettings(ctx, "row-1", {
      embeddingsEndpoint: "https://new.example.com",
      generationModel: "gpt-4o",
    })

    const patch = state.updateArg as Record<string, unknown>
    expect(patch.embeddings_endpoint).toBe("https://new.example.com")
    expect(patch.generation_model).toBe("gpt-4o")
    expect("embeddings_key" in patch).toBe(false)
    expect("generation_key" in patch).toBe(false)
  })

  it("updateAISettings writes the secret when a value is provided", async () => {
    state.existing = {
      id: "row-1",
      embeddings_endpoint: "",
      embeddings_model: "",
      embeddings_key: "old-key",
      generation_endpoint: "",
      generation_model: "",
      generation_key: "old-gen-key",
      ingestion_enabled: false,
      search_enabled: false,
    }
    const { updateAISettings } = await import("../knowledge-admin")
    await updateAISettings(ctx, "row-1", {
      embeddingsKey: "sk-new-embedding-key",
      generationKey: "sk-new-generation-key",
    })

    const patch = state.updateArg as Record<string, unknown>
    expect(patch.embeddings_key).toBe("sk-new-embedding-key")
    expect(patch.generation_key).toBe("sk-new-generation-key")
  })

  it("getOrCreateAISettings inserts defaults when no row exists", async () => {
    state.existing = null
    state.insertData = {
      id: "new-row",
      embeddings_endpoint: "",
      embeddings_model: "",
      embeddings_key: "",
      generation_endpoint: "",
      generation_model: "",
      generation_key: "",
      ingestion_enabled: false,
      search_enabled: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    }
    const { getOrCreateAISettings } = await import("../knowledge-admin")
    const settings = await getOrCreateAISettings(ctx)

    expect(settings).not.toBeNull()
    expect(settings.embeddingsEndpoint).toBe("")
    expect(settings.ingestionEnabled).toBe(false)
    expect(settings.searchEnabled).toBe(false)
    expect(state.insertArg).toEqual({})
  })
})
