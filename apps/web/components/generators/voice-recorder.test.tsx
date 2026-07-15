/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { VoiceRecorder } from "./voice-recorder"

class MockMediaRecorder {
  state = "inactive"
  mimeType = "audio/webm"
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  constructor(
    public stream: unknown,
    public opts?: { mimeType?: string },
  ) {}
  static isTypeSupported() {
    return true
  }
  start() {
    this.state = "recording"
  }
  stop() {
    this.state = "inactive"
    this.ondataavailable?.({ data: new Blob(["audio-bytes"], { type: "audio/webm" }) })
    this.onstop?.()
  }
}

function stubMediaSupport(getUserMedia: () => Promise<unknown>) {
  vi.stubGlobal("MediaRecorder", MockMediaRecorder as unknown as typeof MediaRecorder)
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  // @ts-expect-error — clean the test-only define
  delete navigator.mediaDevices
})

describe("VoiceRecorder", () => {
  it("shows an unsupported message when MediaRecorder is missing", () => {
    render(<VoiceRecorder onRecorded={vi.fn()} />)
    expect(screen.getByText(/recording isn't available/i)).toBeInTheDocument()
  })

  it("records and hands the audio blob up on stop", async () => {
    const stream = { getTracks: () => [{ stop: vi.fn() }] }
    stubMediaSupport(vi.fn(async () => stream))
    const onRecorded = vi.fn()

    render(<VoiceRecorder onRecorded={onRecorded} />)
    await userEvent.click(screen.getByRole("button", { name: /start recording/i }))

    await waitFor(() => expect(screen.getByRole("button", { name: /stop/i })).toBeInTheDocument())
    await userEvent.click(screen.getByRole("button", { name: /stop/i }))

    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1))
    const blob = onRecorded.mock.calls[0][0] as Blob
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(0)
    expect(screen.getByText(/ready to transcribe/i)).toBeInTheDocument()
  })

  it("surfaces a permission-denied message when the mic is blocked", async () => {
    stubMediaSupport(vi.fn(async () => Promise.reject(new Error("NotAllowedError"))))
    const onRecorded = vi.fn()

    render(<VoiceRecorder onRecorded={onRecorded} />)
    await userEvent.click(screen.getByRole("button", { name: /start recording/i }))

    await waitFor(() => expect(screen.getByText(/microphone access was blocked/i)).toBeInTheDocument())
    expect(onRecorded).not.toHaveBeenCalled()
  })
})
