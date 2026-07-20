"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react"

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
import type { CashflowMilestoneRecord } from "@/lib/data/cashflow-milestones"
import type { WorkingCapitalDTO } from "@/lib/finance/working-capital-dto"
import type {
  CostMilestoneInputDTO,
  ScheduleMonthDTO,
} from "@/app/(crm)/opportunities/finance-actions"

// ORR-708 — the per-deal P&L / cash-plan tab. Reads the derived working-capital
// position (revenue schedule inflows netted against cost-milestone outflows) and
// lets the user edit the cost milestones. Summary + series come straight from the
// server DTO; after any milestone edit we router.refresh() so the whole panel
// re-derives from one source of truth rather than recomputing on the client.

interface CashPlanPanelProps {
  opportunityId: string
  currency: string
  workingCapital: WorkingCapitalDTO
  revenueSchedule: ScheduleMonthDTO[]
  costMilestones: CashflowMilestoneRecord[]
  createAction: (opportunityId: string, input: CostMilestoneInputDTO) => Promise<CashflowMilestoneRecord>
  updateAction: (opportunityId: string, milestoneId: string, input: CostMilestoneInputDTO) => Promise<CashflowMilestoneRecord>
  deleteAction: (opportunityId: string, milestoneId: string) => Promise<void>
}

// "YYYY-MM(-01)" → "Mon YYYY" (constructed locally, so no timezone slip).
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-")
  const d = new Date(Number(y), Number(m) - 1, 1)
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" })
}

// "YYYY-MM-01" → "YYYY-MM" for <input type="month">.
function toMonthInput(ym: string): string {
  return ym.slice(0, 7)
}

function money(currency: string, amount: string): string {
  return `${currency} ${amount}`
}

const H = "text-[13.5px] font-semibold tracking-[-0.01em]"

interface DraftState {
  label: string
  month: string
  amount: string
}

const EMPTY_DRAFT: DraftState = { label: "", month: "", amount: "" }

export function CashPlanPanel({
  opportunityId,
  currency,
  workingCapital,
  revenueSchedule,
  costMilestones,
  createAction,
  updateAction,
  deleteAction,
}: CashPlanPanelProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [addDraft, setAddDraft] = useState<DraftState>(EMPTY_DRAFT)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<DraftState>(EMPTY_DRAFT)
  const [busy, setBusy] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<CashflowMilestoneRecord | null>(null)

  const wc = workingCapital
  const deductionLabel = `${(wc.deductionPct * 100).toFixed(1)}%`

  function draftValid(d: DraftState): boolean {
    return d.label.trim().length > 0 && /^\d{4}-\d{2}$/.test(d.month) && d.amount.trim().length > 0
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  async function handleAdd() {
    if (!draftValid(addDraft)) return
    await run(async () => {
      await createAction(opportunityId, {
        label: addDraft.label.trim(),
        scheduledMonth: addDraft.month,
        amount: addDraft.amount,
      })
      setAddDraft(EMPTY_DRAFT)
      setAdding(false)
    })
  }

  async function handleSaveEdit(id: string) {
    if (!draftValid(editDraft)) return
    await run(async () => {
      await updateAction(opportunityId, id, {
        label: editDraft.label.trim(),
        scheduledMonth: editDraft.month,
        amount: editDraft.amount,
      })
      setEditingId(null)
    })
  }

  async function handleDelete(id: string) {
    await run(async () => {
      await deleteAction(opportunityId, id)
    })
  }

  function startEdit(m: CashflowMilestoneRecord) {
    setEditingId(m.id)
    setEditDraft({ label: m.label, month: toMonthInput(m.scheduledMonth), amount: m.amount })
    setError(null)
  }

  const disabled = busy || pending

  return (
    <div className="space-y-6">
      {/* ── P&L summary ─────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="Peak financed" value={money(currency, wc.peakFinanced)} tone={wc.monthsFinanced > 0 ? "warn" : "neutral"} />
        <SummaryTile label="Months financed" value={String(wc.monthsFinanced)} />
        <SummaryTile label="Cost of cash" value={money(currency, wc.costOfCash)} />
        <SummaryTile label="Revenue deduction" value={deductionLabel} tone={wc.deductionPct > 0 ? "warn" : "neutral"} />
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* ── Revenue schedule (inflows, read-only) ───────────────────── */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className={H}>Revenue schedule</h3>
          <span className="text-xs text-muted-foreground">Inflows · edit via “Set Revenue Schedule”</span>
        </div>
        {revenueSchedule.length > 0 ? (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <tbody>
                {revenueSchedule.map((m) => (
                  <tr key={m.month} className="border-t first:border-t-0">
                    <td className="px-3 py-2 text-muted-foreground">{monthLabel(m.month)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(currency, m.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
            No revenue schedule yet. Use the “Set Revenue Schedule” action above to spread this deal&rsquo;s amount across its service months.
          </p>
        )}
      </section>

      {/* ── Cost milestones (outflows, editable) ────────────────────── */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className={H}>Cost milestones</h3>
          {!adding && (
            <Button variant="outline" size="sm" onClick={() => { setAdding(true); setAddDraft(EMPTY_DRAFT); setError(null) }} disabled={disabled}>
              <Plus className="size-4" /> Add cost
            </Button>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Milestone</th>
                <th className="px-3 py-2 font-medium">Month</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="w-20 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {costMilestones.length === 0 && !adding && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-sm text-muted-foreground">
                    No cost milestones yet. Add the planned outflows to complete the cash plan.
                  </td>
                </tr>
              )}

              {costMilestones.map((m) =>
                editingId === m.id ? (
                  <tr key={m.id} className="border-t first:border-t-0">
                    <td className="px-3 py-2">
                      <Input value={editDraft.label} onChange={(e) => setEditDraft((d) => ({ ...d, label: e.target.value }))} placeholder="Label" />
                    </td>
                    <td className="px-3 py-2">
                      <Input type="month" value={editDraft.month} onChange={(e) => setEditDraft((d) => ({ ...d, month: e.target.value }))} />
                    </td>
                    <td className="px-3 py-2">
                      <Input type="number" min="0" step="0.01" className="text-right" value={editDraft.amount} onChange={(e) => setEditDraft((d) => ({ ...d, amount: e.target.value }))} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleSaveEdit(m.id)} disabled={disabled || !draftValid(editDraft)} title="Save">
                          <Check className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setEditingId(null)} disabled={disabled} title="Cancel">
                          <X className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={m.id} className="border-t first:border-t-0">
                    <td className="px-3 py-2">{m.label}</td>
                    <td className="px-3 py-2 text-muted-foreground">{monthLabel(m.scheduledMonth)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(currency, m.amount)}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => startEdit(m)} disabled={disabled} title="Edit">
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setPendingDelete(m)} disabled={disabled} title="Delete">
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ),
              )}

              {adding && (
                <tr className="border-t first:border-t-0 bg-muted/20">
                  <td className="px-3 py-2">
                    <Input autoFocus value={addDraft.label} onChange={(e) => setAddDraft((d) => ({ ...d, label: e.target.value }))} placeholder="e.g. Talent advance" />
                  </td>
                  <td className="px-3 py-2">
                    <Input type="month" value={addDraft.month} onChange={(e) => setAddDraft((d) => ({ ...d, month: e.target.value }))} />
                  </td>
                  <td className="px-3 py-2">
                    <Input type="number" min="0" step="0.01" className="text-right" value={addDraft.amount} onChange={(e) => setAddDraft((d) => ({ ...d, amount: e.target.value }))} placeholder="0.00" />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={handleAdd} disabled={disabled || !draftValid(addDraft)} title="Add">
                        {disabled ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setAdding(false); setAddDraft(EMPTY_DRAFT) }} disabled={disabled} title="Cancel">
                        <X className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Monthly cumulative cash series ──────────────────────────── */}
      {wc.series.length > 0 && (
        <section className="space-y-2">
          <h3 className={H}>Monthly cash position</h3>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Month</th>
                  <th className="px-3 py-2 text-right font-medium">Net</th>
                  <th className="px-3 py-2 text-right font-medium">Cumulative</th>
                </tr>
              </thead>
              <tbody>
                {wc.series.map((p) => {
                  // Cumulative is a canonical decimal string; a financed month is
                  // strictly negative (zero serialises as "0.00", never "-0.00").
                  const financed = p.cumulative.startsWith("-")
                  return (
                    <tr key={p.month} className="border-t first:border-t-0">
                      <td className="px-3 py-2 text-muted-foreground">{monthLabel(p.month)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(currency, p.net)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${financed ? "font-medium text-destructive" : ""}`}>
                        {money(currency, p.cumulative)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Negative cumulative months are financed. Cost of cash assumes the group financing rate.
          </p>
        </section>
      )}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete cost milestone</DialogTitle>
            <DialogDescription>
              Delete “{pendingDelete?.label}”? This removes it from the cash plan
              and recomputes the working-capital position.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                const target = pendingDelete
                setPendingDelete(null)
                if (target) void handleDelete(target.id)
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SummaryTile({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "warn" }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-[11.5px] font-medium text-muted-foreground">{label}</div>
      <div className={`mt-1 text-[18px] font-bold tabular-nums tracking-[-0.02em] ${tone === "warn" ? "text-amber-600 dark:text-amber-500" : ""}`}>
        {value}
      </div>
    </div>
  )
}
