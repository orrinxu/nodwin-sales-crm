import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { DealStage } from "@/lib/opportunity"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const STAGE_TOKEN_VARIANTS: Record<DealStage, { bg: string; fg: string; chart: string }> = {
  qualify: {
    bg: "var(--stage-qualify-bg)",
    fg: "var(--stage-qualify-fg)",
    chart: "var(--stage-qualify-chart)",
  },
  meet_and_present: {
    bg: "var(--stage-meet-and-present-bg)",
    fg: "var(--stage-meet-and-present-fg)",
    chart: "var(--stage-meet-and-present-chart)",
  },
  propose: {
    bg: "var(--stage-propose-bg)",
    fg: "var(--stage-propose-fg)",
    chart: "var(--stage-propose-chart)",
  },
  negotiate: {
    bg: "var(--stage-negotiate-bg)",
    fg: "var(--stage-negotiate-fg)",
    chart: "var(--stage-negotiate-chart)",
  },
  verbal_agreement: {
    bg: "var(--stage-verbal-agreement-bg)",
    fg: "var(--stage-verbal-agreement-fg)",
    chart: "var(--stage-verbal-agreement-chart)",
  },
  closed_won: {
    bg: "var(--stage-closed-won-bg)",
    fg: "var(--stage-closed-won-fg)",
    chart: "var(--stage-closed-won-chart)",
  },
  closed_lost: {
    bg: "var(--stage-closed-lost-bg)",
    fg: "var(--stage-closed-lost-fg)",
    chart: "var(--stage-closed-lost-chart)",
  },
}

export function stageTokens(stage: DealStage): { bg: string; fg: string; chart: string } {
  const t = STAGE_TOKEN_VARIANTS[stage]
  if (!t) {
    throw new Error(`Unknown deal stage: ${stage}`)
  }
  return t
}
