"use client"

import { useState, useRef } from "react"
import { Upload, AlertCircle, CheckCircle2, X, ArrowLeft, ArrowRight, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import {
  CONTACT_CSV_FIELDS,
  CONTACT_FIELD_LABELS,
} from "@/lib/data/contacts"
import type { ContactCreateInput, BulkImportResult } from "@/lib/data/contacts"

type Step = "upload" | "mapping" | "preview" | "results"

interface ParsedCSV {
  headers: string[]
  rows: Record<string, string>[]
}

export function parseCSVLine(line: string): string[] {
  const values: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- local string var, not object
    const char = line[i]
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === "," && !inQuotes) {
      values.push(current.trim())
      current = ""
    } else {
      current += char
    }
  }
  values.push(current.trim())

  return values
}

export function parseCSV(text: string): ParsedCSV {
  const lines: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- local string var, not object
    const char = text[i]
    if (char === '"') {
      current += char
      inQuotes = !inQuotes
    } else if (char === "\n" && !inQuotes) {
      if (current.trim()) lines.push(current.trim())
      current = ""
    } else if (char === "\r" && !inQuotes) {
      continue
    } else {
      current += char
    }
  }
  if (current.trim()) lines.push(current.trim())

  if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row")

  const headerLine = lines[0]
  const headers = parseCSVLine(headerLine)

  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- lines is a local array, i is numeric
    const values = parseCSVLine(lines[i])
    const row = Object.create(null) as Record<string, string>
    for (let h = 0; h < headers.length; h++) {
      // eslint-disable-next-line security/detect-object-injection -- row uses Object.create(null); headers are CSV column names; array index is numeric
      row[headers[h]] = values[h] ?? ""
    }
    rows.push(row)
  }

  return { headers, rows }
}

function getCSVCell(row: Record<string, string>, header: string): string {
  if (Object.prototype.hasOwnProperty.call(row, header)) {
    // eslint-disable-next-line security/detect-object-injection -- row uses Object.create(null); header is a CSV column name
    return row[header]
  }
  return ""
}

interface ColumnMapping {
  header: string
  field: string
}

const csvFields = CONTACT_CSV_FIELDS.map((f) => f.key)
const allFieldKeys = csvFields

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[\s_-]+/g, "")
}

function buildAutoMap(headers: string[]): ColumnMapping[] {
  const result: ColumnMapping[] = []
  for (const header of headers) {
    const normalized = normalizeForMatch(header)
    const matched = allFieldKeys.find((k) => {
      // eslint-disable-next-line security/detect-object-injection -- CONTACT_FIELD_LABELS is a const lookup; k comes from predefined allFieldKeys
      const label = CONTACT_FIELD_LABELS[k]
      return normalizeForMatch(k) === normalized || (label != null && normalizeForMatch(label) === normalized)
    })
    if (matched) {
      result.push({ header, field: matched })
    }
  }
  return result
}

function buildContactRows(columnMappings: ColumnMapping[], parsedRows: Record<string, string>[]): ContactCreateInput[] {
  return parsedRows.map((row) => {
    const input: ContactCreateInput = { fullName: "" }
    for (const mapping of columnMappings) {
      const value = getCSVCell(row, mapping.header).trim()
      if (mapping.field === "fullName") input.fullName = value
      else if (mapping.field === "title") input.title = value || null
      else if (mapping.field === "email") input.email = value || null
      else if (mapping.field === "phone") input.phone = value || null
      else if (mapping.field === "notes") input.notes = value || null
    }
    return input
  })
}

function getContactValue(row: ContactCreateInput, field: string): string | null | undefined {
  if (field === "fullName") return row.fullName
  if (field === "title") return row.title
  if (field === "email") return row.email
  if (field === "phone") return row.phone
  if (field === "notes") return row.notes
  return ""
}

interface BulkImportSheetProps {
  trigger?: React.ReactNode
  onImport: (rows: ContactCreateInput[]) => Promise<BulkImportResult>
}

export function BulkImportSheet({ trigger, onImport }: BulkImportSheetProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("upload")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedCSV | null>(null)
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([])
  const [result, setResult] = useState<BulkImportResult | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setStep("upload")
    setError(null)
    setParsed(null)
    setColumnMappings([])
    setResult(null)
    setPending(false)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function handleOpenChange(newOpen: boolean) {
    setOpen(newOpen)
    if (!newOpen) {
      setTimeout(reset, 200)
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string
        const parsedCSV = parseCSV(text)
        setParsed(parsedCSV)
        setColumnMappings(buildAutoMap(parsedCSV.headers))
        setStep("mapping")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse CSV")
      }
    }
    reader.onerror = () => setError("Failed to read file")
    reader.readAsText(file)
  }

  function handleMappingChange(header: string, field: string) {
    setColumnMappings((prev) => {
      const filtered = prev.filter((m) => m.header !== header)
      if (field === "__skip__") return filtered

      const existingIdx = filtered.findIndex((m) => m.field === field)
      const updated = existingIdx >= 0
        ? filtered.map((m, i) => (i === existingIdx ? { header: m.header, field: "__skip__" } : m))
        : filtered

      updated.push({ header, field })
      return updated
    })
  }

  function getMappingForHeader(header: string): string {
    const mapping = columnMappings.find((m) => m.header === header)
    return mapping?.field ?? "__skip__"
  }

  function goToPreview() {
    const requiredMapped = CONTACT_CSV_FIELDS.filter((f) => f.required).every((f) =>
      columnMappings.some((m) => m.field === f.key),
    )
    if (!requiredMapped) {
      setError("Full Name must be mapped to a CSV column")
      return
    }
    setError(null)
    setStep("preview")
  }

  async function handleImport() {
    setPending(true)
    setError(null)
    try {
      const rows = buildContactRows(columnMappings, parsed?.rows ?? [])
      const importResult = await onImport(rows)
      setResult(importResult)
      setStep("results")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed")
    } finally {
      setPending(false)
    }
  }

  const mappedColumns = columnMappings.filter((m) => m.field !== "__skip__")
  const previewRows = parsed ? buildContactRows(columnMappings, parsed.rows) : []

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger
        render={
          (trigger ?? (
            <Button variant="outline">
              <Upload className="size-4" />
              Import CSV
            </Button>
          )) as React.ReactElement
        }
      />
      <SheetContent side="right" className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {step === "upload" && "Import Contacts from CSV"}
            {step === "mapping" && "Map CSV Columns"}
            {step === "preview" && "Preview & Import"}
            {step === "results" && "Import Results"}
          </SheetTitle>
          <SheetDescription>
            {step === "upload" && "Upload a CSV file to bulk import contacts."}
            {step === "mapping" && "Match your CSV columns to contact fields."}
            {step === "preview" && `Review ${previewRows.length} contact(s) before importing.`}
            {step === "results" && result && `${result.successCount} of ${result.successCount + result.errorCount} contact(s) imported.`}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 py-4">
          {error && (
            <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === "upload" && (
            <div
              className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-12 text-center hover:border-muted-foreground/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mb-4 size-10 text-muted-foreground" />
              <p className="text-sm font-medium">Click to upload a CSV file</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Files must have a header row with column names
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>
          )}

          {step === "mapping" && parsed && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Map each CSV column to a contact field. Required fields are marked with <span className="text-destructive">*</span>.
              </p>
              <div className="space-y-3">
                {parsed.headers.map((header) => {
                  const mappedField = getMappingForHeader(header)
                  return (
                    <div key={header} className="flex items-center gap-3">
                      <div className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-medium truncate">
                        {header}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">&rarr;</span>
                        <Select
                          value={mappedField}
                          onValueChange={(v) => handleMappingChange(header, v ?? "__skip__")}
                        >
                          <SelectTrigger className="w-44">
                            <SelectValue placeholder="Skip column" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__skip__">Skip column</SelectItem>
                            {allFieldKeys.map((key) => (
                              <SelectItem key={key} value={key}>
                                {/* eslint-disable-next-line security/detect-object-injection -- CONTACT_FIELD_LABELS is a const lookup; key comes from predefined allFieldKeys */}
                                {CONTACT_FIELD_LABELS[key]}
                                {CONTACT_CSV_FIELDS.find((f) => f.key === key)?.required ? " *" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {step === "preview" && parsed && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Showing first 20 rows. A total of {previewRows.length} row(s) will be imported.
              </p>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      {mappedColumns.map((m) => (
                        <TableHead key={m.header}>{m.header}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.slice(0, 20).map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                        {mappedColumns.map((m) => (
                          <TableCell key={m.header} className="max-w-48 truncate">
                            {getContactValue(row, m.field) || "-"}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {step === "results" && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex flex-1 flex-col items-center rounded-lg border bg-muted/30 p-6">
                  <CheckCircle2 className="mb-2 size-8 text-green-600" />
                  <p className="text-2xl font-bold">{result.successCount}</p>
                  <p className="text-sm text-muted-foreground">Imported</p>
                </div>
                <div className="flex flex-1 flex-col items-center rounded-lg border bg-muted/30 p-6">
                  <X className="mb-2 size-8 text-destructive" />
                  <p className="text-2xl font-bold">{result.errorCount}</p>
                  <p className="text-sm text-muted-foreground">Failed</p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                  <p className="mb-2 text-sm font-medium text-destructive">Errors</p>
                  <ul className="space-y-1">
                    {result.errors.map((err, idx) => (
                      <li key={idx} className="text-xs text-destructive/80">
                        Row {err.row}: {err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <SheetFooter>
          {step === "upload" && (
            <SheetClose render={<Button variant="outline">Cancel</Button>} />
          )}
          {step === "mapping" && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
              <Button onClick={goToPreview}>
                Next
                <ArrowRight className="size-4" />
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("mapping")}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
              <Button onClick={handleImport} disabled={pending}>
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="size-4" />
                    Import {previewRows.length} Contact(s)
                  </>
                )}
              </Button>
            </>
          )}
          {step === "results" && (
            <SheetClose render={<Button>Done</Button>} />
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
