"use client"

import dynamic from "next/dynamic"

// The reports view is a large, recharts-heavy client view (ORR-760) — dynamic
// import it so recharts + the view load client-side after paint, not in the
// route's initial JS.
export const ReportsViewLazy = dynamic(
  () => import("./reports-view").then((m) => m.ReportsView),
  {
    ssr: false,
    loading: () => <div className="h-[600px] w-full animate-pulse rounded-lg bg-muted" />,
  },
)
