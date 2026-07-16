"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { UserTarget } from "@/lib/data/sales-targets"

interface SalesTargetsFormProps {
  year: number
  quarter: number
  currency: string
  targets: UserTarget[]
  saveAction: (input: unknown) => Promise<void>
}

export function SalesTargetsForm({
  year,
  quarter,
  currency: initialCurrency,
  targets,
  saveAction,
}: SalesTargetsFormProps) {
  const router = useRouter()
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(targets.map((t) => [t.userId, t.amount ?? ""])),
  )
  const [currency, setCurrency] = useState(initialCurrency)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function goTo(y: number, q: number) {
    router.push(`/admin/targets?year=${y}&quarter=${q}`)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await saveAction({
        year,
        quarter,
        currency: currency || "USD",
        targets: targets.map((t) => ({ userId: t.userId, amount: amounts[t.userId] ?? "" })),
      })
      setSaved(true)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save targets")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sales Targets</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Per-rep closed-won revenue quotas by quarter. Reps see their target and
          progress on the dashboard.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Quotas — Q{quarter} {year}</CardTitle>
              <CardDescription>Leave a rep blank to clear their target.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => goTo(quarter === 1 ? year - 1 : year, quarter === 1 ? 4 : quarter - 1)}>
                ← Prev
              </Button>
              <Button variant="outline" size="sm" onClick={() => goTo(quarter === 4 ? year + 1 : year, quarter === 4 ? 1 : quarter + 1)}>
                Next →
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:max-w-[8rem]">
            <Label htmlFor="target-currency">Currency</Label>
            <Input
              id="target-currency"
              value={currency}
              onChange={(e) => { setCurrency(e.target.value); setSaved(false) }}
              placeholder="USD"
            />
          </div>

          <div className="divide-y rounded-lg border">
            {targets.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No users.</p>
            ) : (
              targets.map((t) => (
                <div key={t.userId} className="flex items-center gap-3 p-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm">{t.userName}</span>
                  <Input
                    inputMode="decimal"
                    className="w-40"
                    value={amounts[t.userId] ?? ""}
                    onChange={(e) => {
                      setAmounts((prev) => ({ ...prev, [t.userId]: e.target.value }))
                      setSaved(false)
                    }}
                    placeholder="No target"
                    aria-label={`Target for ${t.userName}`}
                  />
                </div>
              ))
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {saved && <p className="text-sm text-success">Saved.</p>}

          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save quotas"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
