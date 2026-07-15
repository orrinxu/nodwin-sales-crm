"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"

// Consumes the `?create=1` flag set by the global "+ New" launcher (Track C,
// ORR-746). Read exactly once on mount, then stripped from the URL via
// history.replaceState so a refresh or Back doesn't reopen the dialog — and
// WITHOUT a Next navigation, which would re-run these force-dynamic pages' server
// data fetch. Each destination page hosts exactly one record generator, so
// whichever one is mounted consumes the flag.
export function useAutoOpenCreate(): boolean {
  const searchParams = useSearchParams()
  // Capture the initial value once; the history cleanup below flips the live
  // params, and re-renders must not re-trigger the open.
  const [autoOpen] = useState(() => searchParams.get("create") === "1")

  useEffect(() => {
    if (!autoOpen || typeof window === "undefined") return
    const url = new URL(window.location.href)
    if (!url.searchParams.has("create")) return
    url.searchParams.delete("create")
    const qs = url.searchParams.toString()
    window.history.replaceState(window.history.state, "", `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`)
  }, [autoOpen])

  return autoOpen
}
