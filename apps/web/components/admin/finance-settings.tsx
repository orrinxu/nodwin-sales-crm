"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Landmark, Check, Loader2 } from "lucide-react"

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import type {
  CostOfCashSettings,
  FinancingCostMethod,
  DeductionBase,
} from "@/lib/data/finance-settings"

interface Props {
  settings: CostOfCashSettings
  saveAction: (input: unknown) => Promise<void>
}

export function FinanceSettings({ settings, saveAction }: Props) {
  const router = useRouter()
  // Rate is stored as a decimal (0.18) but edited as a percent (18).
  const [ratePct, setRatePct] = useState(String(+(settings.annualRate * 100).toFixed(3)))
  const [method, setMethod] = useState<FinancingCostMethod>(settings.financingCostMethod)
  const [base, setBase] = useState<DeductionBase>(settings.deductionBase)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  async function handleSave() {
    setError(null)
    setSaved(false)
    const pct = Number(ratePct)
    if (!Number.isFinite(pct) || pct < 0 || pct >= 1000) {
      setError("Enter a rate between 0 and 999 %.")
      return
    }
    try {
      await saveAction({
        annualRate: +(pct / 100).toFixed(5),
        financingCostMethod: method,
        deductionBase: base,
      })
      setSaved(true)
      startTransition(() => router.refresh())
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Landmark className="size-5" /> Finance
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Working-capital parameters used when a deal&apos;s cash-flow milestones are turned into a
          cost-of-cash figure. Group-wide defaults; per-entity overrides come later.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Cost of cash</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-1.5">
            <Label htmlFor="rate">Annual financing rate</Label>
            <div className="flex items-center gap-2">
              <Input
                id="rate"
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                value={ratePct}
                onChange={(e) => setRatePct(e.target.value)}
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">% per year</span>
            </div>
            <p className="text-xs text-muted-foreground">
              The cost of financing negative working capital. Default 18%/yr (1.5%/month).
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label>Financing-cost method</Label>
            <Select value={method} onValueChange={(v) => setMethod(String(v) as FinancingCostMethod)}>
              <SelectTrigger className="w-full sm:w-80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="integral">Integral (financed balance × rate, every month)</SelectItem>
                <SelectItem value="peak_duration">Peak × duration (simpler, less accurate)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              TBD pending finance sign-off. The integral method is correct for lumpy multi-period deals.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label>Deduction base</Label>
            <Select value={base} onValueChange={(v) => setBase(String(v) as DeductionBase)}>
              <SelectTrigger className="w-full sm:w-80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="revenue">Over revenue</SelectItem>
                <SelectItem value="profit">Over profit</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Denominator for the project % deduction. May be changed by finance.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center gap-3">
            <Button onClick={() => void handleSave()} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : saved ? <Check className="size-4" /> : null}
              {saved ? "Saved" : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
