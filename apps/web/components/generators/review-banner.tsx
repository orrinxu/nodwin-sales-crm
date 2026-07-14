"use client"

import { Sparkles, CheckCircle2, AlertTriangle } from "lucide-react"
import { Badge } from "@/components/ui/badge"

// Shared "AI-generated draft — review" banner (ORR-735). Extracted from the
// opportunity generator so account/contact generators render the same per-field
// provenance review. Parametric over the field-label map; each generator supplies
// its own. The result shape is the common {resolution, notes, truncated} that every
// Generate*Result carries.

export interface GeneratorReviewResult {
  resolution?: Record<string, { status: string; display: string | null }>
  notes?: string[]
  truncated?: boolean
}

export function GeneratorReviewBanner({
  result,
  fieldLabels,
}: {
  result: GeneratorReviewResult
  fieldLabels: Record<string, string>
}) {
  const entries = Object.entries(result.resolution ?? {})
  const needsReview = entries.filter(([, r]) => r.status !== "ok" && r.status !== "matched")
  return (
    <div className="mb-4 space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="size-4 text-primary" />
        AI-generated draft — review each field before saving.
      </div>
      {result.truncated && (
        <p className="text-xs text-muted-foreground">The note was long and was trimmed before analysing.</p>
      )}
      {entries.length > 0 && (
        <ul className="grid gap-1 text-xs sm:grid-cols-2">
          {entries.map(([key, r]) => {
            const review = r.status !== "ok" && r.status !== "matched"
            // eslint-disable-next-line security/detect-object-injection -- key comes from the resolver's fixed field set
            const label = fieldLabels[key] ?? key
            return (
              <li key={key} className="flex items-start gap-1.5">
                {review ? (
                  <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-500" />
                ) : (
                  <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-primary" />
                )}
                <span>
                  <span className="text-muted-foreground">{label}:</span>{" "}
                  <span className="font-medium">{r.display ?? "—"}</span>
                  {review && (
                    <Badge variant="secondary" className="ml-1 px-1 py-0 text-[10px]">needs review</Badge>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {needsReview.length === 0 && entries.length > 0 && (
        <p className="text-xs text-muted-foreground">Everything matched — double-check and save.</p>
      )}
      {(result.notes ?? []).length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
          {result.notes!.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
    </div>
  )
}
