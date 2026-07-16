import type { LineItemsSummary } from "@/lib/data/opportunity-line-items"

/**
 * Read-only breakdown of a deal's line items (ORR-752, §E). Rendered on the
 * Overview tab so the deal's composition is visible without opening the editor.
 * Returns null when there are no lines.
 */
export function OpportunityLineItemsSummary({ summary }: { summary: LineItemsSummary }) {
  const { lines, currency, subtotal, discountAmount, total, overridden } = summary
  if (lines.length === 0) return null

  const money = (amount: string) => `${currency} ${amount}`

  return (
    <div className="space-y-3 text-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="py-1.5 pr-3 text-left font-medium">Item</th>
              <th className="px-3 py-1.5 text-right font-medium">Qty</th>
              <th className="px-3 py-1.5 text-right font-medium">Unit price</th>
              <th className="px-3 py-1.5 text-right font-medium">Disc</th>
              <th className="py-1.5 pl-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b last:border-0">
                <td className="py-1.5 pr-3">{line.description}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{line.quantity}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money(line.unitPriceAmount)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {line.discountPct ? `${line.discountPct}%` : "—"}
                </td>
                <td className="py-1.5 pl-3 text-right font-medium tabular-nums">{money(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-1 border-t pt-2 sm:ml-auto sm:max-w-xs">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span className="tabular-nums">{money(subtotal)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Deal discount</span>
          <span className="tabular-nums">− {money(discountAmount)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Deal amount</span>
          <span className="tabular-nums">
            {overridden ? `${money(total)} (manual)` : money(total)}
          </span>
        </div>
      </div>
    </div>
  )
}
