"use client"

import { useEffect } from "react"

/**
 * Registers the PWA service worker (public/sw.js) on the client (ORR-705).
 *
 * Renders nothing. Registration is production-only — a service worker in `next
 * dev` aggressively caches build assets and fights hot-reload, so we skip it
 * there. The worker itself is versioned and self-updates on the next visit.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        // Non-fatal: the app works without the worker, just without offline support.
        console.error("Service worker registration failed:", err)
      })
    }

    // Defer until after load so registration never competes with first paint.
    if (document.readyState === "complete") register()
    else {
      window.addEventListener("load", register, { once: true })
      return () => window.removeEventListener("load", register)
    }
  }, [])

  return null
}
