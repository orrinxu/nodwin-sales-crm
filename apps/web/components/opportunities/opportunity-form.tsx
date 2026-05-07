"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Save, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

import type { OpportunityRecord, OpportunityCreateInput } from "@/lib/data/opportunities"
import type { AccountOption } from "@/lib/data/contacts"

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  accountId: z.string().min(1, "Account is required"),
  amount: z.coerce.number().min(0).optional().or(z.literal("")),
  currency: z.string().max(10).optional().or(z.literal("")),
  closeDate: z.string().optional().or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
  salesUnitId: z.string().min(1, "Sales unit is required"),
  probabilityPct: z.coerce.number().min(0).max(100).optional().or(z.literal("")),
})

type FormData = z.infer<typeof formSchema>

interface BusinessUnitOption {
  id: string
  name: string
}

interface OpportunityFormProps {
  accounts: AccountOption[]
  businessUnits: BusinessUnitOption[]
  createAction: (input: OpportunityCreateInput) => Promise<OpportunityRecord>
  onSuccess: () => void
  trigger?: React.ReactNode
}

export function OpportunityForm({
  accounts,
  businessUnits,
  createAction,
  onSuccess,
  trigger,
}: OpportunityFormProps) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      accountId: "",
      amount: 0,
      currency: "USD",
      closeDate: "",
      description: "",
      salesUnitId: "",
      probabilityPct: 0,
    },
  })

  async function onSubmit(data: FormData) {
    setPending(true)
    setError(null)
    try {
      const input: OpportunityCreateInput = {
        name: data.name,
        accountId: data.accountId,
        amount: data.amount || 0,
        currency: data.currency || "USD",
        closeDate: data.closeDate || undefined,
        description: data.description || undefined,
        salesUnitId: data.salesUnitId,
        probabilityPct: data.probabilityPct || 0,
      }

      await createAction(input)

      setOpen(false)
      form.reset()
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : "An unexpected error occurred")
    } finally {
      setPending(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
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
          <SheetTitle>Create Opportunity</SheetTitle>
          <SheetDescription>
            Fill in the details to create a new opportunity.
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
              {pending ? "Saving..." : "Create Opportunity"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
