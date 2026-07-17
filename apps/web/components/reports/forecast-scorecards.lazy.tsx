"use client"

import dynamic from "next/dynamic"

// Defer recharts off the reports route's initial JS (ORR-760).
export const ForecastScorecardsLazy = dynamic(
  () => import("./forecast-scorecards").then((m) => m.ForecastScorecards),
  {
    ssr: false,
    loading: () => <div className="h-[220px] w-full animate-pulse rounded-lg bg-muted" />,
  },
)
