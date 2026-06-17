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
import type { AccountRecord, AccountCreateInput, AccountUpdateInput } from "@/lib/data/accounts"
import type { FieldDefinition } from "@/lib/data/field-definitions.types"
import { CustomFieldsForm } from "@/components/contacts/custom-fields-form"

const formSchema = z.object({
  name: z.string().min(1, "Account name is required").max(200),
  legalName: z.string().max(200).optional().or(z.literal("")),
  website: z.string().max(500).optional().or(z.literal("")),
  country: z.string().max(100).optional().or(z.literal("")),
  industry: z.string().max(100).optional().or(z.literal("")),
  description: z.string().max(5000).optional().or(z.literal("")),
  emailDomainsInput: z.string().max(1000).optional().or(z.literal("")),
  accountOwnerUserId: z.string().optional().or(z.literal("")),
})

type FormData = z.infer<typeof formSchema>

interface AccountFormProps {
  account?: AccountRecord
  fieldDefinitions?: FieldDefinition[]
  ownerOptions?: { id: string; name: string }[]
  createAction: (input: AccountCreateInput) => Promise<AccountRecord>
  updateAction?: (id: string, input: AccountUpdateInput) => Promise<AccountRecord>
  onSuccess: () => void
  trigger?: React.ReactNode
}

export function AccountForm({
  account,
  fieldDefinitions = [],
  ownerOptions = [],
  createAction,
  updateAction,
  onSuccess,
  trigger,
}: AccountFormProps) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>(
    () => account?.customData ?? {},
  )

  const isEditing = !!account

  const initialDomains = account?.emailDomains?.join(", ") ?? ""

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: account?.name ?? "",
      legalName: account?.legalName ?? "",
      website: account?.website ?? "",
      country: account?.country ?? "",
      industry: account?.industry ?? "",
      description: account?.description ?? "",
      emailDomainsInput: initialDomains,
      accountOwnerUserId: account?.accountOwnerUserId ?? "",
    },
  })

  async function onSubmit(data: FormData) {
    setPending(true)
    setError(null)
    try {
      const emailDomains = data.emailDomainsInput
        ? data.emailDomainsInput.split(",").map((d) => d.trim()).filter(Boolean)
        : undefined

      const input: AccountCreateInput = {
        name: data.name,
        legalName: data.legalName || null,
        website: data.website || null,
        country: data.country || null,
        industry: data.industry || null,
        description: data.description || null,
        accountOwnerUserId: data.accountOwnerUserId || null,
        emailDomains,
        customData: Object.keys(customFieldValues).length > 0 ? customFieldValues : undefined,
      }

      if (isEditing && account && updateAction) {
        await updateAction(account.id, input)
      } else if (!isEditing) {
        await createAction(input)
      }

      setOpen(false)
      form.reset()
      setCustomFieldValues(account?.customData ?? {})
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : "An unexpected error occurred")
    } finally {
      setPending(false)
    }
  }

  function handleOpenChange(newOpen: boolean) {
    setOpen(newOpen)
    if (newOpen) {
      setCustomFieldValues(account?.customData ?? {})
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger
        render={
          (trigger ?? (
            <Button>
              <Plus className="size-4" />
              Create Account
            </Button>
          )) as React.ReactElement
        }
      />
      <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Edit Account" : "Create Account"}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Update the account details below."
              : "Fill in the details to create a new account."}
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
                Account Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                {...form.register("name")}
                placeholder="Company or organization name"
              />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="legalName">Legal Name</Label>
              <Input
                id="legalName"
                {...form.register("legalName")}
                placeholder="Registered legal name"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                type="url"
                {...form.register("website")}
                placeholder="https://example.com"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  {...form.register("country")}
                  placeholder="Country"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="industry">Industry</Label>
                <Input
                  id="industry"
                  {...form.register("industry")}
                  placeholder="Industry"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="emailDomainsInput">Email Domains</Label>
              <Input
                id="emailDomainsInput"
                {...form.register("emailDomainsInput")}
                placeholder="example.com, other.com (comma separated)"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list of company email domains. Used for automatic contact association.
              </p>
            </div>

            {ownerOptions.length > 0 && (
              <div className="grid gap-1.5">
                <Label htmlFor="accountOwnerUserId">Account Owner</Label>
                <select
                  id="accountOwnerUserId"
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  {...form.register("accountOwnerUserId")}
                >
                  <option value="">No owner</option>
                  {ownerOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                className="min-h-[100px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-y placeholder:text-muted-foreground"
                placeholder="Company description"
                {...form.register("description")}
              />
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
              {pending
                ? "Saving..."
                : isEditing
                  ? "Save Changes"
                  : "Create Account"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
