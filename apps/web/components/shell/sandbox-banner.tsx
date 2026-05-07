"use client"

export function SandboxBanner() {
  if (typeof process === "undefined" || process.env.NEXT_PUBLIC_ENV !== "sandbox") {
    return null
  }

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-50 px-4 py-1.5 text-sm font-medium text-amber-800 border-b border-amber-200">
      <span aria-hidden>🧪</span>
      <span>Sandbox environment — data is not real and resets periodically.</span>
    </div>
  )
}
