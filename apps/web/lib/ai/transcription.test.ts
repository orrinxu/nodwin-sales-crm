import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const { mockEnv } = vi.hoisted(() => ({ mockEnv: {} as Record<string, string | undefined> }))
vi.mock("../security/env", () => ({ env: mockEnv }))

import {
  createTranscriber,
  TranscriptionNotConfiguredError,
  TranscriptionUnavailableError,
} from "./transcription"

const audio = {
  bytes: new Uint8Array([1, 2, 3, 4]),
  filename: "note.webm",
  contentType: "audio/webm",
}

const okResponse = (text: string) => ({ ok: true, status: 200, json: async () => ({ text }) })
const busyResponse = (status = 503) => ({ ok: false, status, text: async () => "busy" })

// No real backoff waits in tests.
const noSleep = () => Promise.resolve()

describe("createTranscriber", () => {
  beforeEach(() => {
    mockEnv.TRANSCRIPTION_BASE_URL = undefined
    mockEnv.TRANSCRIPTION_MODEL = undefined
    mockEnv.TRANSCRIPTION_API_KEY = undefined
  })

  it("throws NotConfigured when no endpoint/model is set", async () => {
    await expect(createTranscriber().transcribe(audio)).rejects.toBeInstanceOf(
      TranscriptionNotConfiguredError,
    )
  })

  it("POSTs multipart to /audio/transcriptions with model + auth, returns trimmed text", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse("  hello world  "))
    const t = createTranscriber(
      { baseUrl: "http://whisper:9000/v1/", model: "whisper-1", apiKey: "sk-x" },
      { fetchImpl, sleep: noSleep },
    )

    const res = await t.transcribe({ ...audio, language: "en" })

    expect(res).toEqual({ text: "hello world", model: "whisper-1" })
    const [url, init] = fetchImpl.mock.calls[0]
    // Trailing slash on baseUrl is normalised.
    expect(url).toBe("http://whisper:9000/v1/audio/transcriptions")
    expect(init.method).toBe("POST")
    expect(init.headers.Authorization).toBe("Bearer sk-x")
    const form = init.body as FormData
    expect(form.get("model")).toBe("whisper-1")
    expect(form.get("response_format")).toBe("json")
    expect(form.get("language")).toBe("en")
    expect(form.get("file")).toBeInstanceOf(Blob)
  })

  it("omits the Authorization header when no api key is set", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse("hi"))
    const t = createTranscriber(
      { baseUrl: "http://whisper:9000", model: "whisper-1", apiKey: null },
      { fetchImpl, sleep: noSleep },
    )
    await t.transcribe(audio)
    const [, init] = fetchImpl.mock.calls[0]
    expect(init.headers.Authorization).toBeUndefined()
  })

  it("retries a busy (503) endpoint, then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(busyResponse(503))
      .mockResolvedValueOnce(okResponse("recovered"))
    const t = createTranscriber(
      { baseUrl: "http://w/v1", model: "m", apiKey: null },
      { fetchImpl, sleep: noSleep, maxRetries: 2 },
    )
    const res = await t.transcribe(audio)
    expect(res.text).toBe("recovered")
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("throws Unavailable (retryable) after exhausting retries on persistent busy", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(busyResponse(429))
    const t = createTranscriber(
      { baseUrl: "http://w/v1", model: "m", apiKey: null },
      { fetchImpl, sleep: noSleep, maxRetries: 2 },
    )
    const err = await t.transcribe(audio).catch((e) => e)
    expect(err).toBeInstanceOf(TranscriptionUnavailableError)
    expect(err.retryable).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(3) // 1 + 2 retries
  })

  it("retries on a network error, then surfaces Unavailable if it never recovers", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))
    const t = createTranscriber(
      { baseUrl: "http://w/v1", model: "m", apiKey: null },
      { fetchImpl, sleep: noSleep, maxRetries: 1 },
    )
    await expect(t.transcribe(audio)).rejects.toBeInstanceOf(TranscriptionUnavailableError)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("throws a hard error on a non-busy failure (e.g. 400) without retrying", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 400, text: async () => "bad model" })
    const t = createTranscriber(
      { baseUrl: "http://w/v1", model: "m", apiKey: null },
      { fetchImpl, sleep: noSleep, maxRetries: 2 },
    )
    await expect(t.transcribe(audio)).rejects.toThrow(/Transcription API error 400/)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
