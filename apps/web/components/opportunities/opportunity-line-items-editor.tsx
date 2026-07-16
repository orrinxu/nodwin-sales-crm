"use client"

import { useMemo, useState } from "react"
import { Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Money } from "@/lib/money"
import type { LineItemInput, LineItemsSummary } from "@/lib/data/opportunity-line-items"

export interface ProductOption {
  id: string
  name: string
  sku: string | null
  unitPriceAmount: string
  unitCostAmount: string
}

interface Row {
  productId: string | null
  description: string
  quantity: number
  unitPriceAmount: string
  unitCostAmount: string
  discountPct: number
}

interface OpportunityLineItemsEditorProps {
  currency: string
  summary: LineItemsSummary
  products: ProductOption[]
  onSave: (payload: {
    lines: LineItemInput[]
    discountAmount: string
    overridden: boolean
  }) => Promise<void>
}

const CUSTOM = "__custom__"

function rowTotal(row: Row, currency: string): Money {
  const price = Money.fromAmount(row.unitPriceAmount || "0", currency)
  // quantity / discountPct are counts, not money — plain arithmetic is fine.
  const factor = (row.quantity || 0) * (100 - (row.discountPct || 0)) / 100
  return price.multiply(factor)
}

function fmt(money: Money, currency: string): string {
  return `${currency} ${money.toAmount()}`
}

export function OpportunityLineItemsEditor({
  currency,
  summary,
  products,
  onSave,
}: OpportunityLineItemsEditorProps) {
  const [rows, setRows] = useState<Row[]>(() =>
    summary.lines.map((l) => ({
      productId: l.productId,
      description: l.description,
      quantity: Number(l.quantity),
      unitPriceAmount: l.unitPriceAmount,
      unitCostAmount: l.unitCostAmount,
      discountPct: l.discountPct,
    })),
  )
  const [discountAmount, setDiscountAmount] = useState(summary.discountAmount)
  const [overridden, setOverridden] = useState(summary.overridden)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { subtotal, total } = useMemo(() => {
    const sub = rows.reduce(
      (acc, r) => acc.add(rowTotal(r, currency)),
      Money.zero(currency),
    )
    const disc = Money.fromAmount(discountAmount || "0", currency)
    const net = sub.subtract(disc)
    const zero = Money.zero(currency)
    return { subtotal: sub, total: net.gte(zero) ? net : zero }
  }, [rows, discountAmount, currency])

  function addRow() {
    setRows((prev) => [
      ...prev,
      { productId: null, description: "", quantity: 1, unitPriceAmount: "0", unitCostAmount: "0", discountPct: 0 },
    ])
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  function update(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function pickProduct(index: number, productId: string) {
    if (productId === CUSTOM) {
      update(index, { productId: null })
      return
    }
    const p = products.find((x) => x.id === productId)
    if (!p) return
    // eslint-disable-next-line security/detect-object-injection -- index is a numeric row index
    const cur = rows[index]
    update(index, {
      productId: p.id,
      // Prefill only empty fields so an edited description/price isn't clobbered.
      description: cur.description || p.name,
      unitPriceAmount: p.unitPriceAmount,
      unitCostAmount: p.unitCostAmount,
    })
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const lines: LineItemInput[] = rows
        .filter((r) => r.description.trim())
        .map((r, i) => ({
          productId: r.productId,
          description: r.description.trim(),
          quantity: r.quantity || 1,
          unitPriceAmount: r.unitPriceAmount || "0",
          unitCostAmount: r.unitCostAmount || "0",
          discountPct: r.discountPct || 0,
          position: i,
        }))
      await onSave({ lines, discountAmount: discountAmount || "0", overridden })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save line items")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No line items. Add products or a custom line to build the deal amount.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={index} className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Product</label>
                <select
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={row.productId ?? CUSTOM}
                  onChange={(e) => pickProduct(index, e.target.value)}
                >
                  <option value={CUSTOM}>Custom (no product)</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.sku ? ` (${p.sku})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid flex-1 gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <Input
                  className="min-w-[140px]"
                  value={row.description}
                  onChange={(e) => update(index, { description: e.target.value })}
                  placeholder="Line description"
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Qty</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-20"
                  value={row.quantity || ""}
                  onChange={(e) => update(index, { quantity: Number(e.target.value) })}
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Unit price</label>
                <Input
                  inputMode="decimal"
                  className="w-28"
                  value={row.unitPriceAmount}
                  onChange={(e) => update(index, { unitPriceAmount: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Disc %</label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="w-20"
                  value={row.discountPct || ""}
                  onChange={(e) => update(index, { discountPct: Number(e.target.value) })}
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Line total</label>
                <div className="flex h-8 items-center text-sm font-medium tabular-nums">
                  {fmt(rowTotal(row, currency), currency)}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => removeRow(index)}
                aria-label="Remove line"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="size-4" />
        Add line
      </Button>

      <div className="grid gap-3 rounded-lg border p-3 sm:max-w-sm">
        <div className="grid gap-1.5">
          <Label htmlFor="li-deal-discount">Deal discount ({currency})</Label>
          <Input
            id="li-deal-discount"
            inputMode="decimal"
            value={discountAmount}
            onChange={(e) => setDiscountAmount(e.target.value)}
            placeholder="0"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={overridden}
            onChange={(e) => setOverridden(e.target.checked)}
          />
          Override the deal amount manually (ignore line totals)
        </label>
        <div className="space-y-1 border-t pt-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span className="tabular-nums">{fmt(subtotal, currency)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Deal discount</span>
            <span className="tabular-nums">
              − {fmt(Money.fromAmount(discountAmount || "0", currency), currency)}
            </span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Deal amount</span>
            <span className="tabular-nums">
              {overridden ? "Manual (set on the deal)" : fmt(total, currency)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save line items"}
        </Button>
      </div>
    </div>
  )
}
