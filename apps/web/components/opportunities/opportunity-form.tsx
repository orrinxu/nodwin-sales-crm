"use client"

import { useState, useMemo } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Save, Plus, Repeat } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Money } from "@/lib/money"
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

import type { OpportunityRecord, OpportunityCreateInput, BusinessUnitOption } from "@/lib/data/opportunities.types"
import type { AccountOption } from "@/lib/data/contacts"
import type { FieldDefinition } from "@/lib/data/field-definitions.types"
import { CustomFieldsForm } from "@/components/contacts/custom-fields-form"

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  accountId: z.string().min(1, "Account is required"),
  amount: z.string().optional(),
  currency: z.string().max(10).optional().or(z.literal("")),
  closeDate: z.string().optional().or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
  salesUnitId: z.string().min(1, "Sales unit is required"),
  probabilityPct: z.coerce.number().min(0).max(100).optional().or(z.literal("")),
  recurring: z.boolean().optional(),
  recurringSplitKind: z.string().optional().or(z.literal("")),
  servicePeriodStart: z.string().optional().or(z.literal("")),
  servicePeriodEnd: z.string().optional().or(z.literal("")),
})

type FormData = z.infer<typeof formSchema>

interface CustomMonthEntry {
  month: string
  amount: string
}

function getMonthsBetween(start: string, end: string): string[] {
  const startDate = new Date(start + "T00:00:00Z")
  const endDate = new Date(end + "T00:00:00Z")
  const months: string[] = []

  let current = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1))
  const lastMonth = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1))

  while (current <= lastMonth) {
    const y = current.getUTCFullYear()
    const m = String(current.getUTCMonth() + 1).padStart(2, "0")
    months.push(`${y}-${m}-01`)
    current = new Date(Date.UTC(y, current.getUTCMonth() + 1, 1))
  }

  return months
}

function computeFlatSchedule(amount: string, currency: string, start: string, end: string): CustomMonthEntry[] {
  if (!amount || !start || !end) return []
  const months = getMonthsBetween(start, end)
  if (months.length === 0) return []

  try {
    const total = Money.fromAmount(amount, currency)
    const perMonth = total.divide(months.length, "floor")
    const remainder = total.subtract(perMonth.multiply(months.length))

    return months.map((month, i) => ({
      month,
      amount: i === months.length - 1
        ? perMonth.add(remainder).toAmount()
        : perMonth.toAmount(),
    }))
  } catch {
    return []
  }
}

interface OpportunityFormProps {
  opportunity?: OpportunityRecord
  accounts?: AccountOption[]
  businessUnits: BusinessUnitOption[]
  fieldDefinitions?: FieldDefinition[]
  createAction: (input: OpportunityCreateInput) => Promise<OpportunityRecord>
  updateAction?: (id: string, input: unknown) => Promise<OpportunityRecord>
  saveRevenueScheduleAction?: (opportunityId: string, input: unknown) => Promise<void>
  onSuccess: () => void
  trigger?: React.ReactNode
}

export function OpportunityForm({
  opportunity,
  accounts = [],
  businessUnits,
  fieldDefinitions = [],
  createAction,
  updateAction,
  saveRevenueScheduleAction,
  onSuccess,
  trigger,
}: OpportunityFormProps) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>(
    () => opportunity?.customData ?? {},
  )
  const [customSchedule, setCustomSchedule] = useState<CustomMonthEntry[]>(() => {
    if (opportunity?.recurring && opportunity.recurringSplitKind === "custom" &&
        opportunity.servicePeriodStart && opportunity.servicePeriodEnd) {
      return getMonthsBetween(
        opportunity.servicePeriodStart,
        opportunity.servicePeriodEnd,
      ).map((m) => ({ month: m, amount: "" }))
    }
    return []
  })

  const isEditing = !!opportunity

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: opportunity?.name ?? "",
      accountId: opportunity?.accountId ?? "",
      amount: opportunity ? String(opportunity.amount) : undefined,
      currency: opportunity?.currency ?? "USD",
      closeDate: opportunity?.closeDate ?? "",
      description: opportunity?.description ?? "",
      salesUnitId: opportunity?.salesUnitId ?? "",
      probabilityPct: opportunity?.probabilityPct ?? 0,
      recurring: opportunity?.recurring ?? false,
      recurringSplitKind: opportunity?.recurringSplitKind ?? "",
      servicePeriodStart: opportunity?.servicePeriodStart ?? "",
      servicePeriodEnd: opportunity?.servicePeriodEnd ?? "",
    },
  })

  const recurring = useWatch({ control: form.control, name: "recurring" })
  const recurringSplitKind = useWatch({ control: form.control, name: "recurringSplitKind" })
  const servicePeriodStart = useWatch({ control: form.control, name: "servicePeriodStart" })
  const servicePeriodEnd = useWatch({ control: form.control, name: "servicePeriodEnd" })
  const amount = useWatch({ control: form.control, name: "amount" })
  const currency = useWatch({ control: form.control, name: "currency" })

  const flatSchedule = useMemo(() => {
    if (recurring && recurringSplitKind === "flat" && amount && servicePeriodStart && servicePeriodEnd) {
      return computeFlatSchedule(amount, currency || "USD", servicePeriodStart, servicePeriodEnd)
    }
    return []
  }, [recurring, recurringSplitKind, amount, currency, servicePeriodStart, servicePeriodEnd])

  const customScheduleSum = useMemo(() => {
    if (!currency || customSchedule.length === 0) return null
    try {
      return customSchedule.reduce(
        (sum, m) => {
          if (!m.amount) return sum
          try {
            return sum.add(Money.fromAmount(m.amount, currency || "USD"))
          } catch {
            return sum
          }
        },
        Money.zero(currency || "USD"),
      ).toAmount()
    } catch {
      return null
    }
  }, [customSchedule, currency])

  function handleRecurringToggle(checked: boolean) {
    form.setValue("recurring", checked)
    if (checked) {
      form.setValue("recurringSplitKind", "flat")
    } else {
      form.setValue("recurringSplitKind", "")
      form.setValue("servicePeriodStart", "")
      form.setValue("servicePeriodEnd", "")
      setCustomSchedule([])
    }
  }

  function handleSplitKindChange(kind: string) {
    form.setValue("recurringSplitKind", kind)
    if (kind === "custom" && servicePeriodStart && servicePeriodEnd) {
      const months = getMonthsBetween(servicePeriodStart, servicePeriodEnd)
      setCustomSchedule(months.map((m) => ({ month: m, amount: opportunity?.recurring ? "" : "" })))
    } else {
      setCustomSchedule([])
    }
  }

  function handleServicePeriodChange(field: "servicePeriodStart" | "servicePeriodEnd", value: string) {
    form.setValue(field, value)
    if (field === "servicePeriodEnd" && recurringSplitKind === "custom" && servicePeriodStart && value) {
      const months = getMonthsBetween(servicePeriodStart, value)
      setCustomSchedule(months.map((m) => ({ month: m, amount: "" })))
    } else if (field === "servicePeriodStart" && recurringSplitKind === "custom" && value && servicePeriodEnd) {
      const months = getMonthsBetween(value, servicePeriodEnd)
      setCustomSchedule(months.map((m) => ({ month: m, amount: "" })))
    }
  }

  function handleCustomAmountChange(month: string, value: string) {
    setCustomSchedule((prev) =>
      prev.map((m) => (m.month === month ? { ...m, amount: value } : m)),
    )
  }

  const customScheduleValid = recurring && recurringSplitKind === "custom"
    ? customSchedule.length > 0 &&
      customScheduleSum !== null &&
      customScheduleSum === (amount ?? "")
    : true

  async function onSubmit(data: FormData) {
    if (recurring && recurringSplitKind === "custom" && !customScheduleValid) {
      setError("Custom schedule months must sum exactly to the deal amount.")
      return
    }

    setPending(true)
    setError(null)
    try {
      const input: OpportunityCreateInput = {
        name: data.name,
        accountId: data.accountId,
        amount: data.amount,
        currency: data.currency || "USD",
        closeDate: data.closeDate || undefined,
        description: data.description || undefined,
        salesUnitId: data.salesUnitId,
        probabilityPct: data.probabilityPct || 0,
        customData: Object.keys(customFieldValues).length > 0 ? customFieldValues : undefined,
        recurring: data.recurring || false,
        recurringSplitKind: data.recurring ? (data.recurringSplitKind as "flat" | "custom") || "flat" : null,
        servicePeriodStart: data.recurring ? data.servicePeriodStart || undefined : undefined,
        servicePeriodEnd: data.recurring ? data.servicePeriodEnd || undefined : undefined,
      }

      let result: OpportunityRecord
      if (isEditing && opportunity && updateAction) {
        result = await updateAction(opportunity.id, input)
      } else {
        result = await createAction(input)
      }

      if (recurring && recurringSplitKind === "custom" && customSchedule.length > 0 && saveRevenueScheduleAction) {
        await saveRevenueScheduleAction(result.id, {
          months: customSchedule.filter((m) => m.amount),
        })
      }

      setOpen(false)
      form.reset()
      setCustomFieldValues(opportunity?.customData ?? {})
      setCustomSchedule([])
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : "An unexpected error occurred")
    } finally {
      setPending(false)
    }
  }

  function handleOpenChange(newOpen: boolean) {
    setOpen(newOpen)
    if (newOpen && opportunity) {
      form.reset({
        name: opportunity.name,
        accountId: opportunity.accountId,
        amount: String(opportunity.amount),
        currency: opportunity.currency,
        closeDate: opportunity.closeDate ?? "",
        description: opportunity.description ?? "",
        salesUnitId: opportunity.salesUnitId,
        probabilityPct: opportunity.probabilityPct,
        recurring: opportunity.recurring ?? false,
        recurringSplitKind: opportunity.recurringSplitKind ?? "",
        servicePeriodStart: opportunity.servicePeriodStart ?? "",
        servicePeriodEnd: opportunity.servicePeriodEnd ?? "",
      })
      setCustomFieldValues(opportunity.customData ?? {})
      if (opportunity.recurring && opportunity.recurringSplitKind === "custom" &&
          opportunity.servicePeriodStart && opportunity.servicePeriodEnd) {
        setCustomSchedule(
          getMonthsBetween(opportunity.servicePeriodStart, opportunity.servicePeriodEnd).map((m) => ({
            month: m,
            amount: "",
          })),
        )
      } else {
        setCustomSchedule([])
      }
    } else if (newOpen) {
      setCustomFieldValues({})
      setCustomSchedule([])
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger
        render={
          (trigger ?? (
            <Button>
              <Plus className="size-4" />
              Create Opportunity
            </Button>
          )) as React.ReactElement
        }
      />
      <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Edit Opportunity" : "Create Opportunity"}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Update the opportunity details below."
              : "Fill in the details to create a new opportunity."}
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-1 flex-col"
        >
          <div className="flex-1 space-y-4 px-4 py-4">
            {error && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                {...form.register("name")}
                placeholder="Deal name"
              />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="accountId">
                Account <span className="text-destructive">*</span>
              </Label>
              <select
                id="accountId"
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                {...form.register("accountId")}
              >
                <option value="">Select account</option>
                {accounts.map((acct) => (
                  <option key={acct.id} value={acct.id}>
                    {acct.name}
                  </option>
                ))}
              </select>
              {form.formState.errors.accountId && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.accountId.message}
                </p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="salesUnitId">
                Sales Unit <span className="text-destructive">*</span>
              </Label>
              <select
                id="salesUnitId"
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                {...form.register("salesUnitId")}
              >
                <option value="">Select sales unit</option>
                {businessUnits.map((bu) => (
                  <option key={bu.id} value={bu.id}>
                    {bu.name}
                  </option>
                ))}
              </select>
              {form.formState.errors.salesUnitId && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.salesUnitId.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  {...form.register("amount")}
                  placeholder="0.00"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="currency">Currency</Label>
                <Input
                  id="currency"
                  {...form.register("currency")}
                  placeholder="USD"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="probabilityPct">Probability (%)</Label>
              <Input
                id="probabilityPct"
                type="number"
                min="0"
                max="100"
                {...form.register("probabilityPct")}
                placeholder="0"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="closeDate">Close Date</Label>
              <Input
                id="closeDate"
                type="date"
                {...form.register("closeDate")}
              />
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Label className="flex items-center gap-2 cursor-pointer">
                  <Repeat className="size-4 text-muted-foreground" />
                  Recurring Revenue
                </Label>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input accent-primary"
                  checked={!!recurring}
                  onChange={(e) => handleRecurringToggle(e.target.checked)}
                />
              </div>

              {recurring && (
                <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
                  <div className="grid gap-1.5">
                    <Label>Split Kind</Label>
                    <select
                      className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      value={recurringSplitKind || "flat"}
                      onChange={(e) => handleSplitKindChange(e.target.value)}
                    >
                      <option value="flat">Flat (equal per month)</option>
                      <option value="custom">Custom (per-month amounts)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-1.5">
                      <Label htmlFor="servicePeriodStart">Service Start</Label>
                      <Input
                        id="servicePeriodStart"
                        type="date"
                        value={servicePeriodStart || ""}
                        onChange={(e) => handleServicePeriodChange("servicePeriodStart", e.target.value)}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="servicePeriodEnd">Service End</Label>
                      <Input
                        id="servicePeriodEnd"
                        type="date"
                        value={servicePeriodEnd || ""}
                        onChange={(e) => handleServicePeriodChange("servicePeriodEnd", e.target.value)}
                      />
                    </div>
                  </div>

                  {recurringSplitKind === "flat" && flatSchedule.length > 0 && (
                    <div className="grid gap-1.5">
                      <Label>Monthly Schedule (computed)</Label>
                      <div className="rounded-lg border bg-background">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">Month</th>
                              <th className="px-3 py-1.5 text-right text-xs font-medium text-muted-foreground">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {flatSchedule.map((row) => (
                              <tr key={row.month} className="border-b last:border-0">
                                <td className="px-3 py-1.5 text-xs">
                                  {new Date(row.month + "T00:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "short" })}
                                </td>
                                <td className="px-3 py-1.5 text-right text-xs tabular-nums">
                                  {row.amount}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {recurringSplitKind === "custom" && (
                    <div className="grid gap-1.5">
                      <div className="flex items-center justify-between">
                        <Label>Monthly Schedule</Label>
                        {customScheduleSum !== null && (
                          <span className={`text-xs font-medium tabular-nums ${
                            customScheduleSum === (amount ?? "") ? "text-green-600" : "text-destructive"
                          }`}>
                            Sum: {customScheduleSum}
                            {customScheduleSum !== (amount ?? "") ? ` (need ${amount ?? "?"})` : " \u2713"}
                          </span>
                        )}
                      </div>
                      <div className="rounded-lg border bg-background">
                        {customSchedule.length > 0 ? (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b bg-muted/50">
                                <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">Month</th>
                                <th className="px-3 py-1.5 text-right text-xs font-medium text-muted-foreground">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {customSchedule.map((row) => (
                                <tr key={row.month} className="border-b last:border-0">
                                  <td className="px-3 py-1.5 text-xs">
                                    {new Date(row.month + "T00:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "short" })}
                                  </td>
                                  <td className="px-2 py-1">
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      className="h-7 w-full rounded border border-input bg-transparent px-2 text-right text-xs outline-none focus-visible:border-ring"
                                      value={row.amount}
                                      onChange={(e) => handleCustomAmountChange(row.month, e.target.value)}
                                      placeholder="0.00"
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="px-3 py-3 text-xs text-muted-foreground">
                            Set service period start and end dates to define months.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {fieldDefinitions.length > 0 && (
              <CustomFieldsForm
                fieldDefinitions={fieldDefinitions}
                values={customFieldValues}
                onChange={(key, value) =>
                  setCustomFieldValues((prev) => ({ ...prev, [key]: value }))
                }
                errors={{}}
              />
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                className="min-h-[100px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-y placeholder:text-muted-foreground"
                placeholder="Notes about this opportunity"
                {...form.register("description")}
              />
            </div>
          </div>

          <SheetFooter>
            <SheetClose
              render={
                <Button type="button" variant="outline" disabled={pending}>
                  Cancel
                </Button>
              }
            />
            <Button type="submit" disabled={pending}>
              <Save className="size-4" />
              {pending ? "Saving..." : isEditing ? "Save Changes" : "Create Opportunity"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
