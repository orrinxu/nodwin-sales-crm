"use client"

import dynamic from "next/dynamic"

// Defer recharts (large, v3) off the dashboard's initial JS (ORR-760). The chart
// is below the headline numbers and non-critical, so it's client-loaded after
// paint with a skeleton placeholder. `ssr: false` requires a client boundary.
export const PipelineChartLazy = dynamic(
  () => import("./pipeline-chart").then((m) => m.PipelineChart),
  {
    ssr: false,
    loading: () => <div className="h-[320px] w-full animate-pulse rounded-lg bg-muted" />,
  },
)
