"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface StageSummary {
  stage: string
  label: string
  count: number
  value: number
}

interface PipelineSummaryProps {
  stages: StageSummary[]
}

function formatCurrency(value: number): string {
  const formatter = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  })
  return formatter.format(value)
}

const stageColors: Record<string, string> = {
  qualify: "bg-amber-400",
  meet_and_present: "bg-sky-400",
  propose: "bg-violet-400",
  negotiate: "bg-orange-400",
  verbal_agreement: "bg-emerald-400",
  closed_won: "bg-emerald-600",
}

export function PipelineSummary({ stages }: PipelineSummaryProps) {
  const totalValue = stages.reduce((sum, s) => sum + s.value, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline Overview</CardTitle>
        <CardDescription>Current deals by stage</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {stages.map((stage) => {
            const pct = totalValue > 0 ? (stage.value / totalValue) * 100 : 0
            return (
              <div key={stage.stage} className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{stage.label}</span>
                  <span className="text-muted-foreground">
                    {stage.count} deals · {formatCurrency(stage.value)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${stageColors[stage.stage] ?? "bg-primary"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
