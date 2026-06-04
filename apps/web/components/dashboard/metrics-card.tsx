"use client"

import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface SalesMetric {
  label: string
  value: string
  change: number
  trend: "up" | "down" | "neutral"
}

interface MetricCardProps {
  metric: SalesMetric
}

export function MetricCard({ metric }: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {metric.label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between">
          <span className="text-2xl font-bold">{metric.value}</span>
          <div
            className={cn(
              "flex items-center gap-1 text-sm font-medium",
              metric.trend === "up" && "text-emerald-600",
              metric.trend === "down" && "text-destructive",
              metric.trend === "neutral" && "text-muted-foreground",
            )}
          >
            {metric.trend === "up" && <TrendingUp className="size-4" />}
            {metric.trend === "down" && <TrendingDown className="size-4" />}
            {metric.trend === "neutral" && <Minus className="size-4" />}
            {Math.abs(metric.change)}%
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface MetricsGridProps {
  metrics: SalesMetric[]
}

export function MetricsGrid({ metrics }: MetricsGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <MetricCard key={metric.label} metric={metric} />
      ))}
    </div>
  )
}
