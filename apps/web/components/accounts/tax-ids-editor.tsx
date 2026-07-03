"use client"

import { useMemo } from "react"
import { X, Plus } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { TaxIdType } from "@/lib/data/account-tax-ids"

export interface TaxIdRow {
  taxType: string
  value: string
}

interface TaxIdsEditorProps {
  taxIdTypes: TaxIdType[]
  value: TaxIdRow[]
  onChange: (rows: TaxIdRow[]) => void
}

// Longest value we bother format-checking. The DB caps the value at 100 chars;
// this bound also keeps regex evaluation cheap and caps any ReDoS exposure from
// a pathological admin-configured pattern.
const MAX_VALIDATED_LENGTH = 120

function labelForType(code: string, types: TaxIdType[]): string {
  // Falls back to the raw code so rows of a now-inactive/unknown type still
  // render with a sensible label (Ticket 3 must never silently drop them).
  return types.find((t) => t.code === code)?.label ?? code
}

export function TaxIdsEditor({ taxIdTypes, value, onChange }: TaxIdsEditorProps) {
  // Group the active types by country for the "add" picker (grouped, not
  // hard-filtered by the account's free-text country).
  const grouped = useMemo(() => {
    const byCountry = new Map<string, TaxIdType[]>()
    for (const t of taxIdTypes) {
      const arr = byCountry.get(t.countryIso) ?? []
      arr.push(t)
      byCountry.set(t.countryIso, arr)
    }
    return Array.from(byCountry.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [taxIdTypes])

  // Compile each type's format pattern ONCE (not per keystroke/render). An
  // unparseable pattern is stored as null → treated as "no constraint".
  const formatByCode = useMemo(() => {
    const m = new Map<string, RegExp | null>()
    for (const t of taxIdTypes) {
      if (!t.formatRegex) {
        m.set(t.code, null)
        continue
      }
      try {
        // eslint-disable-next-line security/detect-non-literal-regexp -- pattern is admin-managed reference data (tax_id_types.format_regex), compiled once, and only used for a soft non-blocking hint on a length-bounded value (see MAX_VALIDATED_LENGTH).
        m.set(t.code, new RegExp(t.formatRegex))
      } catch {
        m.set(t.code, null)
      }
    }
    return m
  }, [taxIdTypes])

  // Soft (non-blocking) format check. A mismatch only warns — it never prevents
  // a save (the seeded regexes are provisional).
  function isValid(row: TaxIdRow): boolean {
    const v = row.value.trim()
    if (v === "" || v.length > MAX_VALIDATED_LENGTH) return true
    const re = formatByCode.get(row.taxType)
    return re ? re.test(v) : true
  }

  function addRow(taxType: string) {
    if (!taxType) return
    onChange([...value, { taxType, value: "" }])
  }
  function updateRow(index: number, newValue: string) {
    onChange(value.map((r, i) => (i === index ? { ...r, value: newValue } : r)))
  }
  function removeRow(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div className="grid gap-2">
      <Label className="text-xs">Tax IDs</Label>

      {value.length === 0 && (
        <p className="text-xs text-muted-foreground">No tax IDs added yet.</p>
      )}

      {value.map((row, i) => {
        const label = labelForType(row.taxType, taxIdTypes)
        const ok = isValid(row)
        return (
          <div key={i} className="grid gap-1">
            <div className="flex items-center gap-2">
              <span
                className="w-28 shrink-0 truncate text-xs font-medium text-muted-foreground"
                title={label}
              >
                {label}
              </span>
              <Input
                value={row.value}
                onChange={(e) => updateRow(i, e.target.value)}
                placeholder="Tax ID value"
                aria-label={`${label} value`}
                aria-invalid={!ok}
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                aria-label={`Remove ${label}`}
              >
                <X className="size-4" />
              </button>
            </div>
            {!ok && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Doesn&apos;t match the expected {label} format (you can still save).
              </p>
            )}
          </div>
        )
      })}

      {taxIdTypes.length > 0 && (
        <div className="flex items-center gap-2">
          <Plus className="size-3.5 shrink-0 text-muted-foreground" />
          <select
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value=""
            onChange={(e) => addRow(e.target.value)}
            aria-label="Add tax ID"
          >
            <option value="">Add tax ID…</option>
            {grouped.map(([country, types]) => (
              <optgroup key={country} label={country}>
                {types.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
