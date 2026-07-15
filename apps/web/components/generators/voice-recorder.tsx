"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Mic, Square, RotateCcw, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

// Reusable microphone capture for the record generators (ORR-741, Track B).
//
// Uses the browser MediaRecorder API. On stop it assembles the recorded chunks
// into a single audio Blob and hands it up via `onRecorded` — the parent posts it
// to the transcription action. Feature-detects gracefully (older browsers /
// denied permission / insecure origin) so the dialog never hard-crashes; the
// caller keeps the paste-a-note fallback. Nothing is uploaded from here.

type RecorderState = "idle" | "recording" | "recorded" | "denied" | "unsupported"

interface VoiceRecorderProps {
  /** Called with the recorded audio (or null when cleared / re-recording). */
  onRecorded: (blob: Blob | null) => void
  disabled?: boolean
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t))
}

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function VoiceRecorder({ onRecorded, disabled }: VoiceRecorderProps) {
  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"

  const [state, setState] = useState<RecorderState>(supported ? "idle" : "unsupported")
  const [elapsed, setElapsed] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // Clean up the mic stream/timer if the component unmounts mid-recording.
  useEffect(() => () => stopTracks(), [stopTracks])

  const startRecording = useCallback(async () => {
    if (!supported) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || "audio/webm"
        const blob = new Blob(chunksRef.current, { type })
        stopTracks()
        onRecorded(blob.size > 0 ? blob : null)
        setState(blob.size > 0 ? "recorded" : "idle")
      }
      recorder.start()
      setElapsed(0)
      setState("recording")
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)
    } catch {
      // Permission denied, no device, or insecure origin.
      stopTracks()
      setState("denied")
    }
  }, [supported, onRecorded, stopTracks])

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop()
  }, [])

  const reRecord = useCallback(() => {
    onRecorded(null)
    setElapsed(0)
    setState("idle")
  }, [onRecorded])

  if (state === "unsupported") {
    return (
      <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <span>Recording isn&apos;t available in this browser. Paste the note text instead.</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-6 text-center">
      {state === "denied" && (
        <div className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>Microphone access was blocked. Allow it in your browser, then try again.</span>
        </div>
      )}

      {state === "recording" ? (
        <>
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="size-2.5 animate-pulse rounded-full bg-destructive" aria-hidden />
            Recording — {formatElapsed(elapsed)}
          </div>
          <Button type="button" variant="destructive" onClick={stopRecording}>
            <Square className="size-4" /> Stop
          </Button>
        </>
      ) : state === "recorded" ? (
        <>
          <p className="text-sm text-muted-foreground">Recorded {formatElapsed(elapsed)} — ready to transcribe.</p>
          <Button type="button" variant="outline" onClick={reRecord} disabled={disabled}>
            <RotateCcw className="size-4" /> Re-record
          </Button>
        </>
      ) : (
        <>
          <Mic className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Tap to record a short voice note.</p>
          <Button type="button" onClick={startRecording} disabled={disabled}>
            <Mic className="size-4" /> Start recording
          </Button>
        </>
      )}
    </div>
  )
}
