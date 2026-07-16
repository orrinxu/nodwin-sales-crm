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

export interface RecordsImportResult {
  entity: "accounts"
  total: number
  created: number
  skipped: number
  failed: number
  errors: { row: number; message: string }[]
  jobId: string | null
}

export function RecordsImportCard({
  importAction,
}: {
  importAction: (input: {
    entity: string
    csvText: string
  }) => Promise<RecordsImportResult>
}) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RecordsImportResult | null>(null)

  async function handleImport() {
    if (!file) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const csvText = await file.text()
      const res = await importAction({ entity: "accounts", csvText })
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
        <CardTitle>Import accounts from CSV</CardTitle>
        <CardDescription>
          Upload any CSV of accounts. Columns are matched to fields by header name —
          include a <strong>Name</strong> (or Company) column; optional columns:
          Legal Name, Website, Country, Industry, Description. Rows whose name
          already exists are skipped, so re-uploading the same file is safe.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:max-w-xs">
          <Label htmlFor="records-import-file">CSV file</Label>
          <Input
            id="records-import-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null)
              setResult(null)
              setError(null)
            }}
          />
        </div>

        <Button onClick={handleImport} disabled={!file || busy}>
          {busy ? "Importing…" : "Import accounts"}
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {result && (
          <div className="rounded-md border p-4 text-sm">
            <p className="font-medium">
              Imported {result.created} of {result.total} accounts.
            </p>
            <p className="text-muted-foreground">
              {result.created} created · {result.skipped} skipped (name already
              exists) · {result.failed} failed
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
