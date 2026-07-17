"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"

type ParamUpdates = Record<string, string | null | undefined>

/**
 * URL-param driver for the server-driven lists (ORR-755). Filter / sort / page
 * state lives in the query string so the server can render the exact page; this
 * hook reads the current params and pushes updates without dropping the ones a
 * caller didn't touch (scope / view / entity all survive a filter change).
 */
export function useListQuery() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setParams = useCallback(
    (updates: ParamUpdates, opts?: { resetPage?: boolean }) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value == null || value === "") params.delete(key)
        else params.set(key, value)
      }
      // Any filter / sort change invalidates the current page offset — snap back
      // to page 1 so the user never lands past the new last page.
      if (opts?.resetPage) params.delete("page")
      const qs = params.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname)
    },
    [router, pathname, searchParams],
  )

  return { searchParams, setParams }
}
