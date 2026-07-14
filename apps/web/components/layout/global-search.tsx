"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, Loader2, Briefcase, Building2, User } from "lucide-react"
import { Input } from "@/components/ui/input"
import { globalSearchAction } from "@/app/(crm)/search-actions"
import type { GlobalSearchResult, GlobalSearchType } from "@/lib/data/search"

const TYPE_META: Record<GlobalSearchType, { label: string; Icon: typeof Briefcase }> = {
  opportunity: { label: "Deals", Icon: Briefcase },
  account: { label: "Accounts", Icon: Building2 },
  contact: { label: "Contacts", Icon: User },
}

const MIN_QUERY = 2
const DEBOUNCE_MS = 250

export function GlobalSearch() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<GlobalSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const reqId = useRef(0)

  // Debounced, race-safe search. All state updates run inside the timeout (never
  // synchronously in the effect body), so a sub-min query resets after a tick too.
  useEffect(() => {
    const q = query.trim()
    const id = ++reqId.current
    const timer = setTimeout(async () => {
      if (q.length < MIN_QUERY) {
        if (id === reqId.current) {
          setResults([])
          setOpen(false)
          setLoading(false)
        }
        return
      }
      if (id === reqId.current) setLoading(true)
      try {
        const r = await globalSearchAction(q)
        if (id === reqId.current) {
          setResults(r)
          setActive(0)
          setOpen(true)
        }
      } finally {
        if (id === reqId.current) setLoading(false)
      }
    }, q.length < MIN_QUERY ? 0 : DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  // Close on outside click.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [])

  const go = useCallback(
    (r: GlobalSearchResult) => {
      setOpen(false)
      setQuery("")
      setResults([])
      router.push(r.href)
    },
    [router],
  )

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false)
      e.currentTarget.blur()
      return
    }
    if (!open || results.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const r = results.at(active)
      if (r) go(r)
    }
  }

  const showPanel = open && query.trim().length >= MIN_QUERY

  return (
    <div ref={containerRef} className="relative hidden sm:block sm:w-64 lg:w-80">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => { if (results.length > 0) setOpen(true) }}
        placeholder="Search deals, accounts, contacts…"
        className="pl-10"
        aria-label="Global search"
      />
      {loading && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}

      {showPanel && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-96 overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-muted-foreground">{loading ? "Searching…" : "No matches."}</p>
          ) : (
            results.map((r, i) => {
              const prev = results.at(i - 1)
              const showGroup = i === 0 || prev?.type !== r.type
              const meta = TYPE_META[r.type]
              return (
                <div key={`${r.type}-${r.id}`}>
                  {showGroup && (
                    <p className="px-2 pb-0.5 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{meta.label}</p>
                  )}
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left ${i === active ? "bg-accent" : ""}`}
                  >
                    <meta.Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{r.label}</span>
                    {r.sublabel && <span className="max-w-[45%] truncate text-xs text-muted-foreground">{r.sublabel}</span>}
                  </button>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
