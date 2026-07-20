import "server-only"
import { env } from "../security/env"
import { Money } from "../money"

// ORR-808 (f): flat per-clip cost estimate used to meter + cap transcription (a
// dictated note is a short clip). No per-second STT pricing table exists yet; this
// gives the cap enforcer + usage log a non-zero, attributable figure. A real
// per-provider price is a follow-up.
export const TRANSCRIPTION_ESTIMATED_COST = Money.fromAmount("0.02", "USD")

// ORR-737 (Voice/Text Record Generator, Track B, gate G2): speech-to-text seam.
//
// This is a SEPARATE call path from `aiCall`/the provider adapters — those are
// text/vision chat only. We POST audio to an OpenAI-compatible transcription
// server (`${baseUrl}/audio/transcriptions`, i.e. the Whisper API shape), which
// can be a local whisper.cpp/faster-whisper on the VPS or a lanbox, or a cloud
// STT — swappable by changing the admin base URL (no code change).
//
// Concurrency (gate G2): the workload is bursty, not streaming. This client does
// NOT assume instant transcription — it applies a timeout, a bounded retry on
// "busy" responses (429/503/network/timeout), and surfaces a distinct
// `TranscriptionUnavailableError` so the caller can degrade gracefully ("the
// transcription service is busy, try again") instead of failing hard. The
// endpoint owns its own queue/concurrency, so it can be scaled independently.
//
// Retention (gate G4): audio bytes are passed in and never stored here.

export interface TranscriptionResult {
  /** The transcribed text. */
  text: string
  /** The model that produced it (echoed from config; STT servers rarely return it). */
  model: string | null
}

export interface TranscriptionAudio {
  /** Raw audio bytes. */
  bytes: ArrayBuffer | Uint8Array
  /** File name incl. extension — some servers sniff the container from it. */
  filename: string
  /** MIME type, e.g. "audio/webm", "audio/wav", "audio/mpeg". */
  contentType: string
  /** Optional ISO-639-1 hint (e.g. "en") to skip language detection. */
  language?: string
}

/** Injectable interface so the record generator and tests can swap the client. */
export interface Transcriber {
  transcribe(audio: TranscriptionAudio): Promise<TranscriptionResult>
}

/** Resolved endpoint config (from ai_settings DB-then-env). */
export interface TranscriberConfig {
  baseUrl: string | null
  model: string | null
  apiKey: string | null
}

export interface TranscriberOptions {
  /** Abort a single attempt after this long. Default 60s. */
  timeoutMs?: number
  /** Extra attempts after the first on a "busy" failure. Default 2. */
  maxRetries?: number
  /** Base backoff between retries (ms); grows linearly with attempt. Default 500. */
  retryBaseMs?: number
  /** Injectable fetch + sleep for tests. */
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

/** The endpoint is not configured (no base URL / model). Not retryable. */
export class TranscriptionNotConfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TranscriptionNotConfiguredError"
  }
}

/** The endpoint is busy/unreachable/timed out after retries — the caller should
 *  degrade gracefully and let the user retry. Retryable. */
export class TranscriptionUnavailableError extends Error {
  readonly retryable = true
  constructor(message: string) {
    super(message)
    this.name = "TranscriptionUnavailableError"
  }
}

interface OpenAITranscriptionResponse {
  text?: string
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** "Busy" HTTP statuses that should be retried rather than surfaced as hard errors. */
function isBusyStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504
}

/**
 * Default transcriber: an OpenAI-compatible `/audio/transcriptions` client. Pass a
 * resolved config (ORR-634 ai_settings, DB-then-env); with no arg it falls back to
 * the TRANSCRIPTION_* env vars. Throws `TranscriptionNotConfiguredError` until an
 * endpoint + model are set.
 */
export function createTranscriber(
  config?: TranscriberConfig,
  options: TranscriberOptions = {},
): Transcriber {
  const src: TranscriberConfig = config ?? {
    baseUrl: env.TRANSCRIPTION_BASE_URL ?? null,
    model: env.TRANSCRIPTION_MODEL ?? null,
    apiKey: env.TRANSCRIPTION_API_KEY ?? null,
  }
  const timeoutMs = options.timeoutMs ?? 60_000
  const maxRetries = options.maxRetries ?? 2
  const retryBaseMs = options.retryBaseMs ?? 500
  const doFetch = options.fetchImpl ?? fetch
  const sleep = options.sleep ?? defaultSleep

  return {
    async transcribe(audio: TranscriptionAudio): Promise<TranscriptionResult> {
      const baseUrl = src.baseUrl?.replace(/\/+$/, "")
      const model = src.model
      if (!baseUrl || !model) {
        throw new TranscriptionNotConfiguredError(
          "Transcription is not configured — set a Transcription endpoint (base URL + model) " +
            "in Admin → AI, or TRANSCRIPTION_BASE_URL / TRANSCRIPTION_MODEL, pointing at an " +
            "OpenAI-compatible Whisper server.",
        )
      }

      // Build the multipart body once; FormData is re-usable across attempts.
      const bytes = audio.bytes instanceof Uint8Array ? audio.bytes : new Uint8Array(audio.bytes)
      // Cast: the DOM lib types BlobPart as ArrayBufferView<ArrayBuffer>, but a
      // Uint8Array is Uint8Array<ArrayBufferLike>; it's a valid BufferSource at runtime.
      const blob = new Blob([bytes as BlobPart], { type: audio.contentType })

      let lastBusy: string | null = null
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) await sleep(retryBaseMs * attempt)

        const form = new FormData()
        form.append("file", blob, audio.filename)
        form.append("model", model)
        form.append("response_format", "json")
        if (audio.language) form.append("language", audio.language)

        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        let response: Response
        try {
          response = await doFetch(`${baseUrl}/audio/transcriptions`, {
            method: "POST",
            headers: src.apiKey ? { Authorization: `Bearer ${src.apiKey}` } : {},
            body: form,
            signal: controller.signal,
          })
        } catch (e) {
          // Abort (timeout) or a network error — treat as busy/unreachable and retry.
          lastBusy =
            e instanceof Error && e.name === "AbortError"
              ? `timed out after ${timeoutMs}ms`
              : e instanceof Error
                ? e.message
                : "network error"
          continue
        } finally {
          clearTimeout(timer)
        }

        if (isBusyStatus(response.status)) {
          lastBusy = `endpoint busy (HTTP ${response.status})`
          continue
        }
        if (!response.ok) {
          const err = await response.text().catch(() => "")
          throw new Error(`Transcription API error ${response.status}: ${err}`)
        }

        const json = (await response.json()) as OpenAITranscriptionResponse
        const text = (json.text ?? "").trim()
        return { text, model }
      }

      throw new TranscriptionUnavailableError(
        `Transcription endpoint unavailable after ${maxRetries + 1} attempt(s): ${lastBusy ?? "unknown error"}.`,
      )
    },
  }
}
