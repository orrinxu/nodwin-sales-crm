"use client"

import dynamic from "next/dynamic"

// Defer recharts (large, v3) off the /admin/ai-usage route's initial JS (ORR-769,
// mirroring ORR-760). The whole dashboard is a recharts-heavy client view, so it
// loads client-side after paint with a skeleton placeholder. `ssr: false`
// requires a client boundary.
export const AiUsageDashboardLazy = dynamic(
  () => import("./ai-usage-dashboard").then((m) => m.AiUsageDashboard),
  {
    ssr: false,
    loading: () => <div className="h-[600px] w-full animate-pulse rounded-lg bg-muted" />,
  },
)
