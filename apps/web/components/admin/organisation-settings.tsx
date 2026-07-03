"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { PlusIcon, Trash2Icon, Loader2, Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type {
  ReportingCurrencyOverview,
  EntityReportingCurrency,
} from "@/lib/data/organisation-settings"
import type { CurrencyOption } from "@/lib/data/user-preferences"

const GROUP_UNSET = "__group_unset__"

interface EntityOption {
  id: string
  name: string
}

interface OrganisationSettingsProps {
  overview: ReportingCurrencyOverview
  currencies: CurrencyOption[]
  entities: EntityOption[]
  defaultCurrency: string
  // Super Admin only — an Entity Admin sees the group default read-only.
  canEditGroupDefault: boolean
  setGroupAction: (input: { currencyCode: string | null }) => Promise<void>
  setEntityAction: (input: { entityId: string; currencyCode: string }) => Promise<void>
  removeEntityAction: (entityId: string) => Promise<void>
}

type SaveState = "idle" | "saving" | "saved" | "error"

function Saved({ state }: { state: SaveState }) {
  if (state === "saving") return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Saving…</span>
  if (state === "saved") return <span className="inline-flex items-center gap-1 text-xs text-primary"><Check className="size-3" /> Saved</span>
  return null
}

export function OrganisationSettings({
  overview,
  currencies,
  entities,
  defaultCurrency,
  canEditGroupDefault,
  setGroupAction,
  setEntityAction,
  removeEntityAction,
}: OrganisationSettingsProps) {
  const router = useRouter()

  const [groupValue, setGroupValue] = useState(overview.groupDefault ?? GROUP_UNSET)
  const [groupState, setGroupState] = useState<SaveState>("idle")
  const [error, setError] = useState<string | null>(null)

  const [addEntity, setAddEntity] = useState<string>("")
  const [addCurrency, setAddCurrency] = useState<string>("")
  const [addPending, setAddPending] = useState(false)

  const overrides = overview.entityOverrides
  const overriddenIds = new Set(overrides.map((o) => o.entityId))
  const addableEntities = entities.filter((e) => !overriddenIds.has(e.id))

  async function saveGroup() {
    setGroupState("saving")
    setError(null)
    try {
      await setGroupAction({ currencyCode: groupValue === GROUP_UNSET ? null : groupValue })
      setGroupState("saved")
      router.refresh()
    } catch (err) {
      setGroupState("error")
      setError(err instanceof Error ? err.message : "Failed to save group currency.")
    }
  }

  async function addOverride() {
    if (!addEntity || !addCurrency) return
    setAddPending(true)
    setError(null)
    try {
      await setEntityAction({ entityId: addEntity, currencyCode: addCurrency })
      setAddEntity("")
      setAddCurrency("")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add override.")
    } finally {
      setAddPending(false)
    }
  }

  async function changeOverride(o: EntityReportingCurrency, code: string) {
    setError(null)
    try {
      await setEntityAction({ entityId: o.entityId, currencyCode: code })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update override.")
    }
  }

  async function removeOverride(entityId: string) {
    setError(null)
    try {
      await removeEntityAction(entityId)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove override.")
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organisation Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Group-wide defaults and per-entity overrides.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Reporting currency</CardTitle>
          <CardDescription>
            The currency dashboards and reports are converted into. Deals keep their own currency;
            this only controls how rolled-up totals are displayed. A user&rsquo;s personal display
            currency, if set, takes precedence over these.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Group-wide default — Super Admin edits; Entity Admin sees it read-only. */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Group default</label>
            {canEditGroupDefault ? (
              <div className="flex flex-wrap items-center gap-2">
                <Select value={groupValue} onValueChange={(v) => setGroupValue(v ?? GROUP_UNSET)}>
                  <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GROUP_UNSET}>Not set — defaults to {defaultCurrency}</SelectItem>
                    {currencies.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={saveGroup} disabled={groupState === "saving"}>Save</Button>
                <Saved state={groupState} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {overview.groupDefault ?? defaultCurrency}{" "}
                <span className="text-xs">(set by a group admin)</span>
              </p>
            )}
          </div>

          {/* Per-entity overrides */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Per-entity overrides</label>
            {overrides.length > 0 && (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Entity</TableHead>
                      <TableHead>Reporting currency</TableHead>
                      <TableHead className="w-16 text-right"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overrides.map((o) => (
                      <TableRow key={o.entityId}>
                        <TableCell className="font-medium">{o.entityName ?? o.entityId}</TableCell>
                        <TableCell>
                          <Select value={o.currencyCode} onValueChange={(v) => v && changeOverride(o, v)}>
                            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {currencies.map((c) => (
                                <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeOverride(o.entityId)}
                            aria-label={`Remove override for ${o.entityName ?? o.entityId}`}
                          >
                            <Trash2Icon className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Add override */}
            {addableEntities.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Select value={addEntity} onValueChange={(v) => setAddEntity(v ?? "")}>
                  <SelectTrigger className="w-56"><SelectValue placeholder="Select entity…" /></SelectTrigger>
                  <SelectContent>
                    {addableEntities.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={addCurrency} onValueChange={(v) => setAddCurrency(v ?? "")}>
                  <SelectTrigger className="w-48"><SelectValue placeholder="Currency…" /></SelectTrigger>
                  <SelectContent>
                    {currencies.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={addOverride} disabled={addPending || !addEntity || !addCurrency}>
                  <PlusIcon className="h-4 w-4" /> Add override
                </Button>
              </div>
            ) : (
              overrides.length === 0 && (
                <p className="text-xs text-muted-foreground">No entities available for an override.</p>
              )
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
