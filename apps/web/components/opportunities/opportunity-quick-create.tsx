"use client"

import { useState, useCallback } from "react"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"

import type { OpportunityRecord, OpportunityCreateInput, BusinessUnitOption } from "@/lib/data/opportunities.types"
import type { AccountOption } from "@/lib/data/contacts"

interface FormErrors {
  name?: string
  accountId?: string
  salesUnitId?: string
}

interface OpportunityQuickCreateProps {
  accounts: AccountOption[]
  businessUnits: BusinessUnitOption[]
  createAction: (input: OpportunityCreateInput) => Promise<OpportunityRecord>
  onSuccess: () => void
  defaultAccountId?: string
  trigger?: React.ReactNode
}

export function OpportunityQuickCreate({
  accounts,
  businessUnits,
  createAction,
  onSuccess,
  defaultAccountId,
  trigger,
}: OpportunityQuickCreateProps) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [accountId, setAccountId] = useState(defaultAccountId ?? "")
  const [salesUnitId, setSalesUnitId] = useState("")
  const [amount, setAmount] = useState("")
  const [errors, setErrors] = useState<FormErrors>({})

  const validate = useCallback((): FormErrors => {
    const errs: FormErrors = {}
    if (!name.trim()) errs.name = "Name is required"
    if (!accountId.trim()) errs.accountId = "Account is required"
    if (!salesUnitId.trim()) errs.salesUnitId = "Sales unit is required"
    return errs
  }, [name, accountId, salesUnitId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setPending(true)
    setError(null)
    try {
      const input: OpportunityCreateInput = {
        name: name.trim(),
        accountId,
        amount: amount || undefined,
        salesUnitId,
      }

      await createAction(input)

      setOpen(false)
      setName("")
      setAccountId(defaultAccountId ?? "")
      setSalesUnitId("")
      setAmount("")
      setErrors({})
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : "An unexpected error occurred")
    } finally {
      setPending(false)
    }
  }

  function handleOpenChange(open: boolean) {
    setOpen(open)
    if (!open) {
      setError(null)
      setErrors({})
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          (trigger ?? (
            <Button variant="outline" size="sm">
              <Plus className="size-4" />
              Quick Add
            </Button>
          )) as React.ReactElement
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick Create Opportunity</DialogTitle>
          <DialogDescription>
            Capture the essential details now. You can edit more later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="qc-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="qc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Deal name"
              autoFocus
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="qc-accountId">
              Account <span className="text-destructive">*</span>
            </Label>
            <Select value={accountId} onValueChange={(v) => setAccountId(v ?? "")}>
              <SelectTrigger id="qc-accountId">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((acct) => (
                  <SelectItem key={acct.id} value={acct.id}>
                    {acct.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.accountId && (
              <p className="text-xs text-destructive">{errors.accountId}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="qc-salesUnitId">
              Sales Unit <span className="text-destructive">*</span>
            </Label>
            <Select value={salesUnitId} onValueChange={(v) => setSalesUnitId(v ?? "")}>
              <SelectTrigger id="qc-salesUnitId">
                <SelectValue placeholder="Select sales unit" />
              </SelectTrigger>
              <SelectContent>
                {businessUnits.map((bu) => (
                  <SelectItem key={bu.id} value={bu.id}>
                    {bu.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.salesUnitId && (
              <p className="text-xs text-destructive">{errors.salesUnitId}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="qc-amount">Amount</Label>
            <Input
              id="qc-amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={pending}>
                  Cancel
                </Button>
              }
            />
            <Button type="submit" disabled={pending}>
              {pending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
