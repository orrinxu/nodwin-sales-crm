/*
 * Service worker for the Nodwin CRM PWA (ORR-705).
 *
 * This app is fully auth-gated and every page is per-request (force-dynamic), so
 * the worker deliberately DOES NOT cache HTML, RSC payloads, or API responses —
 * caching per-user authenticated documents would leak one user's data to the next
 * on a shared device. It only:
 *   1. precaches the offline fallback + icons,
 *   2. cache-firsts Next's immutable /_next/static/* build assets,
 *   3. network-firsts navigations, falling back to /offline.html when offline.
 *
 * Bump CACHE_VERSION on any change here to roll caches on the next visit.
 */
const CACHE_VERSION = "v1"
const STATIC_CACHE = `nodwin-static-${CACHE_VERSION}`
const ASSET_CACHE = `nodwin-assets-${CACHE_VERSION}`
const OFFLINE_URL = "/offline.html"

const PRECACHE = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)),
  )
  // Activate this worker as soon as it finishes installing.
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  const keep = new Set([STATIC_CACHE, ASSET_CACHE])
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

// Cache-first for immutable build assets; hydrate the cache on first hit.
async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(ASSET_CACHE)
    cache.put(request, response.clone())
  }
  return response
}

// Network-first for navigations; on failure serve the offline shell.
async function navigateOrOffline(request) {
  try {
    return await fetch(request)
  } catch {
    const cache = await caches.open(STATIC_CACHE)
    const offline = await cache.match(OFFLINE_URL)
    return offline ?? Response.error()
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // never touch cross-origin

  if (request.mode === "navigate") {
    event.respondWith(navigateOrOffline(request))
    return
  }

  // Only immutable build output is safe to persist; everything else (API,
  // per-user data) falls through to the network untouched.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request))
  }
})
