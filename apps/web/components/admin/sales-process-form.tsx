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
import { Label } from "@/components/ui/label"
import { NON_TERMINAL_STAGES } from "@/lib/opportunity"
import { getStageLabel } from "@/lib/data/opportunities.types"
import type { SalesProcessSettings } from "@/lib/data/sales-process-settings"

export function SalesProcessForm({
  settings,
  updateAction,
}: {
  settings: SalesProcessSettings
  updateAction: (input: unknown) => Promise<SalesProcessSettings>
}) {
  const router = useRouter()
  const [stage, setStage] = useState<string>(settings.lineItemsRequiredFromStage ?? "")
  const [overrideExempts, setOverrideExempts] = useState(settings.lineItemsOverrideExempts)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await updateAction({
        lineItemsRequiredFromStage: stage === "" ? null : stage,
        lineItemsOverrideExempts: overrideExempts,
      })
      setSaved(true)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sales Process</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pipeline rules for how deals are worked.
        </p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Line items requirement</CardTitle>
          <CardDescription>
            Remind reps to itemize a deal into line items once it reaches a chosen
            stage. Early stages only need the overall amount; later stages should
            carry the breakdown. This is a warning on the deal — not a hard block.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="li-stage">Require line items from stage</Label>
            <select
              id="li-stage"
              className="h-9 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={stage}
              onChange={(e) => {
                setStage(e.target.value)
                setSaved(false)
              }}
            >
              <option value="">Off — never warn</option>
              {NON_TERMINAL_STAGES.map((s) => (
                <option key={s} value={s}>
                  {getStageLabel(s)}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              The warning shows once a deal reaches this stage (and beyond) with no
              line items.
            </p>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={overrideExempts}
              onChange={(e) => {
                setOverrideExempts(e.target.checked)
                setSaved(false)
              }}
            />
            <span>
              A manually-overridden deal amount satisfies the requirement
              <span className="block text-xs text-muted-foreground">
                When on, a deal whose amount was set manually (override toggle) is
                not warned even without line items.
              </span>
            </span>
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {saved && <p className="text-sm text-success">Saved.</p>}

          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
