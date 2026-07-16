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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface BusinessUnitOption {
  id: string
  name: string
}

export interface SalesforceImportResult {
  entity: "accounts" | "contacts" | "opportunities"
  total: number
  created: number
  skipped: number
  failed: number
  errors: { row: number; message: string }[]
  jobId: string | null
}

const ENTITY_OPTIONS = [
  { value: "accounts", label: "Accounts" },
  { value: "contacts", label: "Contacts" },
  { value: "opportunities", label: "Opportunities" },
] as const

type Entity = (typeof ENTITY_OPTIONS)[number]["value"]

export function SalesforceImportCard({
  businessUnits,
  importAction,
}: {
  businessUnits: BusinessUnitOption[]
  importAction: (input: {
    entity: string
    csvText: string
    salesUnitId?: string
  }) => Promise<SalesforceImportResult>
}) {
  const router = useRouter()
  const [entity, setEntity] = useState<Entity>("accounts")
  const [salesUnitId, setSalesUnitId] = useState<string>("")
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SalesforceImportResult | null>(null)

  const needsBusinessUnit = entity === "opportunities"
  const canImport =
    !!file && !busy && (!needsBusinessUnit || salesUnitId !== "")

  async function handleImport() {
    if (!file) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const csvText = await file.text()
      const res = await importAction({
        entity,
        csvText,
        salesUnitId: needsBusinessUnit ? salesUnitId : undefined,
      })
      setResult(res)
      // Reflect the new records + the import_jobs audit row.
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import from Salesforce</CardTitle>
        <CardDescription>
          Upload a Salesforce CSV export for one object at a time. Re-running the
          same file is safe — rows already imported (matched by Salesforce Id) are
          skipped. Import <strong>Accounts first</strong> so Contacts and
          Opportunities can link to them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:max-w-xs">
          <Label htmlFor="sf-import-entity">Object</Label>
          <Select
            value={entity}
            onValueChange={(v) => {
              if (v) setEntity(v as Entity)
              setResult(null)
              setError(null)
            }}
          >
            <SelectTrigger id="sf-import-entity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENTITY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {needsBusinessUnit && (
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="sf-import-bu">Assign to business unit</Label>
            <Select
              value={salesUnitId}
              onValueChange={(v) => setSalesUnitId(v ?? "")}
            >
              <SelectTrigger id="sf-import-bu">
                <SelectValue placeholder="Select a business unit…" />
              </SelectTrigger>
              <SelectContent>
                {businessUnits.map((bu) => (
                  <SelectItem key={bu.id} value={bu.id}>
                    {bu.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Salesforce has no equivalent field, so imported opportunities are
              assigned here. You can reassign them later.
            </p>
          </div>
        )}

        <div className="grid gap-2 sm:max-w-xs">
          <Label htmlFor="sf-import-file">CSV file</Label>
          <Input
            id="sf-import-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null)
              setResult(null)
              setError(null)
            }}
          />
        </div>

        <Button onClick={handleImport} disabled={!canImport}>
          {busy ? "Importing…" : "Import"}
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {result && (
          <div className="rounded-md border p-4 text-sm">
            <p className="font-medium">
              Imported {result.created} of {result.total} {result.entity}.
            </p>
            <p className="text-muted-foreground">
              {result.created} created · {result.skipped} skipped (already
              imported) · {result.failed} failed
            </p>
            {result.errors.length > 0 && (
              <div className="mt-3">
                <p className="font-medium">
                  First {result.errors.length} error
                  {result.errors.length === 1 ? "" : "s"}:
                </p>
                <ul className="mt-1 list-inside list-disc text-muted-foreground">
                  {result.errors.map((e) => (
                    <li key={e.row}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
