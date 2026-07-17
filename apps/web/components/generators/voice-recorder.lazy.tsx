"use client"

import dynamic from "next/dynamic"

// Defer the VoiceRecorder — and the MediaRecorder/audio chunk it pulls in — off
// the initial JS of the list routes that mount the record-generator chain
// (opportunities / accounts / contacts). It only renders inside the "Record a
// voice note" dialog step, so it's client-loaded on demand with a skeleton
// placeholder (ORR-769, mirroring ORR-760). `ssr: false` requires a client
// boundary; record-generator is already a client component.
export const VoiceRecorderLazy = dynamic(
  () => import("./voice-recorder").then((m) => m.VoiceRecorder),
  {
    ssr: false,
    loading: () => <div className="h-24 w-full animate-pulse rounded-lg bg-muted" />,
  },
)
