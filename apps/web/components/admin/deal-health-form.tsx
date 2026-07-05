"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { StuckThresholdRow } from "@/lib/data/stuck-deal-settings"

interface Props {
  rows: StuckThresholdRow[]
  saveAction: (input: unknown) => Promise<void>
}

export function DealHealthForm({ rows, saveAction }: Props) {
  const [values, setValues] = useState<Map<string, number>>(
    () => new Map(rows.map((r) => [r.stage, r.thresholdDays])),
  )
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setDay(stage: string, raw: string) {
    setValues((v) => new Map(v).set(stage, Number(raw)))
    setSaved(false)
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault()
    setPending(true); setError(null); setSaved(false)
    try {
      await saveAction({
        thresholds: rows.map((r) => ({ stage: r.stage, thresholdDays: values.get(r.stage) ?? r.thresholdDays })),
      })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Deal Health</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A deal shows on the dashboard&rsquo;s <strong>Stuck Deals</strong> widget when its
          days-since-last-activity reaches the threshold for its stage. Set the per-stage limits
          below (days). Deals whose close date has passed while still open are always flagged as
          overdue, regardless of these values.
        </p>
      </div>

      <form onSubmit={onSave} className="max-w-2xl">
        <Card>
          <CardHeader><CardTitle className="text-sm">Staleness thresholds (days since last activity)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {rows.map((r) => (
              <div key={r.stage} className="flex items-center justify-between gap-4">
                <label htmlFor={`stage-${r.stage}`} className="text-sm">{r.label}</label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`stage-${r.stage}`}
                    type="number" min={1} max={365}
                    className="w-24 tabular-nums"
                    value={values.get(r.stage) ?? r.thresholdDays}
                    onChange={(e) => setDay(r.stage, e.target.value)}
                  />
                  <span className="w-10 text-xs text-muted-foreground">days</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <div className="mt-4 flex items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save thresholds"}</Button>
          {saved && <span className="text-sm text-muted-foreground">Saved.</span>}
        </div>
      </form>
    </div>
  )
}
