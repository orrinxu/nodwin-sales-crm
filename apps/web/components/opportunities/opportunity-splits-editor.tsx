"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type {
  OpportunitySplit,
  OpportunitySplitInput,
  BusinessUnitOption,
  UserOption,
} from "@/lib/data/opportunities.types"

interface OpportunitySplitsEditorProps {
  splits: OpportunitySplit[]
  businessUnits: BusinessUnitOption[]
  users: UserOption[]
  onSave: (splits: OpportunitySplitInput[]) => Promise<void>
}

export function OpportunitySplitsEditor({
  splits,
  businessUnits,
  users,
  onSave,
}: OpportunitySplitsEditorProps) {
  const [items, setItems] = useState<OpportunitySplitInput[]>(
    () => splits.map((s) => ({
      salesUnitId: s.salesUnitId,
      userId: s.userId,
      pct: s.pct,
      notes: s.notes,
    })),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalPct = items.reduce((sum, item) => sum + (item.pct || 0), 0)

  function addRow() {
    setItems((prev) => [
      ...prev,
      { salesUnitId: "", userId: null, pct: 0, notes: null },
    ])
  }

  function removeRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  function updateRow(
    index: number,
    field: keyof OpportunitySplitInput,
    value: string | number | null,
  ) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    )
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const validItems = items.filter((item) => item.salesUnitId)
      await onSave(validItems)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save splits")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No splits configured.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={index}
              className="flex flex-wrap items-end gap-3 rounded-lg border p-3"
            >
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Sales Unit
                </label>
                <select
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={item.salesUnitId}
                  onChange={(e) => updateRow(index, "salesUnitId", e.target.value)}
                >
                  <option value="">Select unit</option>
                  {businessUnits.map((bu) => (
                    <option key={bu.id} value={bu.id}>
                      {bu.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  User
                </label>
                <select
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={item.userId ?? ""}
                  onChange={(e) =>
                    updateRow(index, "userId", e.target.value || null)
                  }
                >
                  <option value="">Select user</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  %
                </label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="w-20"
                  value={item.pct || ""}
                  onChange={(e) =>
                    updateRow(index, "pct", Number(e.target.value))
                  }
                />
              </div>
              <div className="grid flex-1 gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Notes
                </label>
                <Input
                  className="min-w-[120px]"
                  value={item.notes ?? ""}
                  onChange={(e) =>
                    updateRow(index, "notes", e.target.value || null)
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => removeRow(index)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="text-sm">
          Total:{" "}
          <span
            className={
              totalPct === 100
                ? "font-semibold text-success"
                : "font-semibold text-destructive"
            }
          >
            {totalPct.toFixed(2)}%
          </span>
          {totalPct !== 100 && (
            <span className="ml-1 text-xs text-muted-foreground">
              (must equal 100%)
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
          >
            <Plus className="size-4" />
            Add Split
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Splits"}
          </Button>
        </div>
      </div>
    </div>
  )
}
