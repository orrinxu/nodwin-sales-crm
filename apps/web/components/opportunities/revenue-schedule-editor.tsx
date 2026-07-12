"use client"

import { useState } from "react"
import { Calendar, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Money } from "@/lib/money"
import type {
  RevenueScheduleData,
  ScheduleMonthDTO,
} from "@/app/(crm)/opportunities/finance-actions"

interface RevenueScheduleEditorProps {
  opportunityId: string
  currency: string
  getAction: (opportunityId: string) => Promise<RevenueScheduleData>
  saveAction: (opportunityId: string, months: ScheduleMonthDTO[]) => Promise<void>
  onSaved?: () => void
}

// "YYYY-MM-01" → "Mon YYYY" (constructed locally, so no timezone slip).
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-")
  const d = new Date(Number(y), Number(m) - 1, 1)
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" })
}

export function RevenueScheduleEditor({
  opportunityId,
  currency,
  getAction,
  saveAction,
  onSaved,
}: RevenueScheduleEditorProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<ScheduleMonthDTO[]>([])
  const [target, setTarget] = useState("0")
  const [hasServicePeriod, setHasServicePeriod] = useState(true)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await getAction(opportunityId)
      setRows(data.months)
      setTarget(data.amount)
      setHasServicePeriod(data.hasServicePeriod)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the schedule.")
    } finally {
      setLoading(false)
    }
  }

  function openDialog() {
    setOpen(true)
    void load()
  }

  const total = rows.reduce(
    (sum, r) => sum.add(Money.fromAmount(r.amount || "0", currency)),
    Money.zero(currency),
  )
  const targetMoney = Money.fromAmount(target || "0", currency)
  const balanced = total.eq(targetMoney)

  function updateAmount(index: number, value: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, amount: value } : r)))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await saveAction(
        opportunityId,
        rows.map((r) => ({
          month: r.month,
          amount: Money.fromAmount(r.amount || "0", currency).toAmount(),
        })),
      )
      setOpen(false)
      onSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save the schedule.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={openDialog}>
        <Calendar className="size-4" />
        Set Revenue Schedule
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Revenue schedule</DialogTitle>
            <DialogDescription>
              Spread this deal&rsquo;s revenue across its service months. The total must equal the deal amount.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : !hasServicePeriod && rows.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              Set a service period (start and end) on this deal first — the schedule spreads the amount across those months.
            </p>
          ) : rows.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No months to schedule.</p>
          ) : (
            <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
              {rows.map((r, i) => (
                <div key={r.month} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-sm text-muted-foreground">{monthLabel(r.month)}</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={r.amount}
                    onChange={(e) => updateAmount(i, e.target.value)}
                    className="flex-1"
                  />
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              Total{" "}
              <span className={balanced ? "font-semibold text-success" : "font-semibold text-destructive"}>
                {currency} {total.toAmount()}
              </span>
              {!balanced && (
                <span className="ml-1 text-xs text-muted-foreground">
                  (must equal {currency} {targetMoney.toAmount()})
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={saving || loading || rows.length === 0 || !balanced}
              >
                {saving ? "Saving…" : "Save schedule"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
