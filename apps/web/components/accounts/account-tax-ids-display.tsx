"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import type { AccountTaxId, TaxIdType } from "@/lib/data/account-tax-ids"

interface AccountTaxIdsDisplayProps {
  taxIds: AccountTaxId[]
  taxIdTypes: TaxIdType[]
}

export function AccountTaxIdsDisplay({ taxIds, taxIdTypes }: AccountTaxIdsDisplayProps) {
  if (taxIds.length === 0) return null

  // Fall back to the raw code so a row of a now-inactive type still shows.
  const labelFor = (code: string) =>
    taxIdTypes.find((t) => t.code === code)?.label ?? code

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tax IDs</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 sm:grid-cols-2">
          {taxIds.map((t) => (
            <div key={t.id} className="grid gap-1.5">
              <Label className="text-muted-foreground text-xs">{labelFor(t.taxType)}</Label>
              <span className="text-sm font-medium">{t.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
