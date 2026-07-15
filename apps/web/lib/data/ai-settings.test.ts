import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const { mockEnv, ssrRow, serverRow } = vi.hoisted(() => ({
  mockEnv: {} as Record<string, string | undefined>,
  ssrRow: { value: null as Record<string, unknown> | null },
  serverRow: { value: null as Record<string, unknown> | null },
}))

vi.mock("@/lib/security/env", () => ({ env: mockEnv }))

function chain(rowHolder: { value: Record<string, unknown> | null }) {
  const c: Record<string, unknown> = {}
  const self = () => c
  c.from = self; c.select = self; c.order = self; c.limit = self; c.eq = self
  c.maybeSingle = async () => ({ data: rowHolder.value, error: null })
  c.update = () => ({ eq: async () => ({ error: null }) })
  c.insert = async () => ({ error: null })
  return c
}

// service-role client (resolveAiConfig)
vi.mock("@supabase/ssr", () => ({ createServerClient: () => chain(ssrRow) }))
// user client (getAiSettings / updateAiSettings)
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => chain(serverRow) }))

import { resolveAiConfig, getAiSettings } from "./ai-settings"

const ctx = { user: { id: "u1", email: "a@nodwin.com", role: "admin" }, source: "web" as const }

function resetEnv() {
  // eslint-disable-next-line security/detect-object-injection -- REASON: keys come from Object.keys(mockEnv) itself (test-controlled), not external input
  for (const k of Object.keys(mockEnv)) delete mockEnv[k]
}

describe("resolveAiConfig (DB-then-env)", () => {
  beforeEach(() => {
    resetEnv()
    ssrRow.value = null
  })

  it("uses env when there is no DB row", async () => {
    mockEnv.EMBEDDINGS_BASE_URL = "http://env:8080/v1"
    mockEnv.EMBEDDINGS_MODEL = "env-model"
    const cfg = await resolveAiConfig()
    expect(cfg.embeddings.baseUrl).toBe("http://env:8080/v1")
    expect(cfg.embeddings.model).toBe("env-model")
    expect(cfg.ingestionEnabled).toBe(true) // default when no row
  })

  it("DB values win over env; env fills the gaps", async () => {
    mockEnv.EMBEDDINGS_BASE_URL = "http://env:8080/v1"
    mockEnv.EMBEDDINGS_MODEL = "env-model"
    mockEnv.GENERATION_BASE_URL = "http://env-gen/v1"
    mockEnv.TRANSCRIPTION_MODEL = "env-whisper" // gap → env
    ssrRow.value = {
      embeddings_base_url: "http://db:8080/v1", // DB wins
      embeddings_model: null, // gap → env
      generation_base_url: null, // gap → env
      generation_model: "db-gen-model",
      transcription_base_url: "http://db-whisper/v1", // DB wins
      transcription_model: null, // gap → env
      ingestion_enabled: false,
      search_enabled: true,
      transcription_enabled: false,
    }
    const cfg = await resolveAiConfig()
    expect(cfg.embeddings.baseUrl).toBe("http://db:8080/v1")
    expect(cfg.embeddings.model).toBe("env-model")
    expect(cfg.generation.baseUrl).toBe("http://env-gen/v1")
    expect(cfg.generation.model).toBe("db-gen-model")
    expect(cfg.transcription.baseUrl).toBe("http://db-whisper/v1")
    expect(cfg.transcription.model).toBe("env-whisper")
    expect(cfg.ingestionEnabled).toBe(false)
    expect(cfg.transcriptionEnabled).toBe(false)
  })

  it("defaults transcriptionEnabled to true when no row", async () => {
    const cfg = await resolveAiConfig()
    expect(cfg.transcriptionEnabled).toBe(true)
    expect(cfg.transcription.baseUrl).toBeNull()
  })
})

describe("getAiSettings (masking)", () => {
  beforeEach(() => {
    resetEnv()
    serverRow.value = null
  })

  it("never returns raw API keys — only whether each is set", async () => {
    serverRow.value = {
      embeddings_base_url: "http://db/v1",
      embeddings_model: "m",
      embeddings_api_key: "super-secret-key",
      generation_api_key: null,
      transcription_base_url: "http://whisper/v1",
      transcription_model: "whisper-1",
      transcription_api_key: "whisper-secret",
      ingestion_enabled: true,
      search_enabled: true,
    }
    const safe = await getAiSettings(ctx)
    expect(safe.hasEmbeddingsApiKey).toBe(true)
    expect(safe.hasGenerationApiKey).toBe(false)
    expect(safe.hasTranscriptionApiKey).toBe(true)
    expect(safe.transcriptionConfigured).toBe(true)
    expect(safe.transcriptionEnabled).toBe(true) // default when column absent
    expect(JSON.stringify(safe)).not.toContain("super-secret-key")
    expect(JSON.stringify(safe)).not.toContain("whisper-secret")
    expect(safe.embeddingsConfigured).toBe(true)
  })
})
