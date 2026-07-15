import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/security/auth", () => ({ requireUser: vi.fn(async () => ({ id: "u1", email: "a@x.com", role: "sales" })) }))
vi.mock("@/lib/ai/opportunity-extraction", () => ({ extractOpportunityFromText: vi.fn() }))
vi.mock("@/lib/data/opportunity-extraction-resolver", () => ({ resolveExtractedOpportunity: vi.fn() }))
vi.mock("@/lib/data/ai-settings", () => ({ resolveAiConfig: vi.fn() }))
vi.mock("@/lib/ai/transcription", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/transcription")>("@/lib/ai/transcription")
  return { ...actual, createTranscriber: vi.fn() }
})

import { generateOpportunityAction, transcribeAudioAction } from "./generate-actions"
import { extractOpportunityFromText } from "@/lib/ai/opportunity-extraction"
import { resolveExtractedOpportunity } from "@/lib/data/opportunity-extraction-resolver"
import { resolveAiConfig } from "@/lib/data/ai-settings"
import { createTranscriber, TranscriptionUnavailableError } from "@/lib/ai/transcription"

const mockExtract = vi.mocked(extractOpportunityFromText)
const mockResolve = vi.mocked(resolveExtractedOpportunity)
const mockResolveConfig = vi.mocked(resolveAiConfig)
const mockCreateTranscriber = vi.mocked(createTranscriber)

beforeEach(() => {
  mockExtract.mockReset()
  mockResolve.mockReset()
  mockResolveConfig.mockReset()
  mockCreateTranscriber.mockReset()
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test config stub; only transcription fields are read
const cfg = (transcription: any, enabled = true) => ({ transcription, transcriptionEnabled: enabled }) as any
const audioForm = (bytes = [1, 2, 3]) => {
  const fd = new FormData()
  fd.append("audio", new File([new Uint8Array(bytes)], "note.webm", { type: "audio/webm" }))
  return fd
}

describe("transcribeAudioAction", () => {
  it("rejects when no audio is provided (before touching config)", async () => {
    const res = await transcribeAudioAction(new FormData())
    expect(res.ok).toBe(false)
    expect(mockResolveConfig).not.toHaveBeenCalled()
  })

  it("returns unconfigured when no endpoint/model is set", async () => {
    mockResolveConfig.mockResolvedValue(cfg({ baseUrl: null, model: null, apiKey: null }))
    const res = await transcribeAudioAction(audioForm())
    expect(res.ok).toBe(false)
    expect(res.unconfigured).toBe(true)
    expect(mockCreateTranscriber).not.toHaveBeenCalled()
  })

  it("returns unconfigured when the feature is disabled", async () => {
    mockResolveConfig.mockResolvedValue(cfg({ baseUrl: "http://w/v1", model: "m", apiKey: null }, false))
    const res = await transcribeAudioAction(audioForm())
    expect(res.unconfigured).toBe(true)
    expect(mockCreateTranscriber).not.toHaveBeenCalled()
  })

  it("transcribes and returns the text on success", async () => {
    mockResolveConfig.mockResolvedValue(cfg({ baseUrl: "http://w/v1", model: "whisper-1", apiKey: null }))
    const transcribe = vi.fn(async () => ({ text: "hello from the mic", model: "whisper-1" }))
    mockCreateTranscriber.mockReturnValue({ transcribe })
    const res = await transcribeAudioAction(audioForm())
    expect(res).toEqual({ ok: true, text: "hello from the mic" })
    expect(mockCreateTranscriber).toHaveBeenCalledWith({ baseUrl: "http://w/v1", model: "whisper-1", apiKey: null })
    expect(transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "note.webm", contentType: "audio/webm" }),
    )
  })

  it("maps a busy endpoint to unavailable (retryable)", async () => {
    mockResolveConfig.mockResolvedValue(cfg({ baseUrl: "http://w/v1", model: "m", apiKey: null }))
    mockCreateTranscriber.mockReturnValue({
      transcribe: vi.fn(async () => { throw new TranscriptionUnavailableError("busy") }),
    })
    const res = await transcribeAudioAction(audioForm())
    expect(res.ok).toBe(false)
    expect(res.unavailable).toBe(true)
  })

  it("errors when the transcript is empty", async () => {
    mockResolveConfig.mockResolvedValue(cfg({ baseUrl: "http://w/v1", model: "m", apiKey: null }))
    mockCreateTranscriber.mockReturnValue({ transcribe: vi.fn(async () => ({ text: "   ", model: "m" })) })
    const res = await transcribeAudioAction(audioForm())
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/couldn't hear/i)
  })
})

describe("generateOpportunityAction", () => {
  it("chains extraction → resolver and returns prefill/resolution/notes", async () => {
    mockExtract.mockResolvedValue({ ok: true, fields: { name: { value: "Deal", confidence: 1, source: "s" } }, truncated: false })
    mockResolve.mockResolvedValue({
      prefill: { name: "Deal" },
      resolution: { name: { status: "ok", source: "s", confidence: 1, raw: "Deal", display: "Deal" } },
      notes: [],
    })
    const res = await generateOpportunityAction({ text: "an RFP" })
    expect(res.ok).toBe(true)
    expect(res.prefill).toEqual({ name: "Deal" })
    expect(res.resolution?.name.status).toBe("ok")
    expect(mockExtract).toHaveBeenCalledWith({ text: "an RFP", userId: "u1" })
  })

  it("passes through an unconfigured extraction without calling the resolver", async () => {
    mockExtract.mockResolvedValue({ ok: false, unconfigured: true, error: "AI is not configured." })
    const res = await generateOpportunityAction({ text: "x" })
    expect(res.ok).toBe(false)
    expect(res.unconfigured).toBe(true)
    expect(mockResolve).not.toHaveBeenCalled()
  })

  it("rejects empty input before any model call", async () => {
    const res = await generateOpportunityAction({ text: "" })
    expect(res.ok).toBe(false)
    expect(mockExtract).not.toHaveBeenCalled()
  })
})
