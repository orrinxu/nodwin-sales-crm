"use client"

import { useState } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Save, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
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
import {
  ACCOUNT_TYPES,
  LIFECYCLE_STATUSES,
  ACCOUNT_TIERS,
  ACCOUNT_REGIONS,
  ACCOUNT_SOURCES,
  ACCOUNT_INDUSTRIES,
} from "@/lib/data/accounts"
import type { FieldDefinition } from "@/lib/data/field-definitions.types"
import { CustomFieldsForm } from "@/components/contacts/custom-fields-form"

function enumLabel(value: string): string {
  return value
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

const formSchema = z.object({
  name: z.string().min(1, "Account name is required").max(200),
  legalName: z.string().max(200).optional().or(z.literal("")),
  website: z.string().max(500).optional().or(z.literal("")),
  country: z.string().max(100).optional().or(z.literal("")),
  industry: z.enum(ACCOUNT_INDUSTRIES).optional().or(z.literal("")),
  description: z.string().max(5000).optional().or(z.literal("")),
  emailDomainsInput: z.string().max(1000).optional().or(z.literal("")),
  accountType: z.enum(ACCOUNT_TYPES).optional().or(z.literal("")),
  lifecycleStatus: z.enum(LIFECYCLE_STATUSES).optional().or(z.literal("")),
  tier: z.enum(ACCOUNT_TIERS).optional().or(z.literal("")),
  region: z.enum(ACCOUNT_REGIONS).optional().or(z.literal("")),
  defaultCurrency: z.string().max(3).optional().or(z.literal("")),
  tagsInput: z.string().max(1000).optional().or(z.literal("")),
  source: z.enum(ACCOUNT_SOURCES).optional().or(z.literal("")),
  legacySalesforceId: z.string().max(100).optional().or(z.literal("")),
  active: z.boolean(),
})

type FormData = z.infer<typeof formSchema>

interface AccountFormProps {
  account?: AccountRecord
  fieldDefinitions?: FieldDefinition[]
  createAction: (input: AccountCreateInput) => Promise<AccountRecord>
  updateAction?: (id: string, input: AccountUpdateInput) => Promise<AccountRecord>
  onSuccess: () => void
  trigger?: React.ReactNode
}

export function AccountForm({
  account,
  fieldDefinitions = [],
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
  const initialTags = account?.tags?.join(", ") ?? ""

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
      accountType: account?.accountType ?? "",
      lifecycleStatus: account?.lifecycleStatus ?? "",
      tier: account?.tier ?? "",
      region: account?.region ?? "",
      defaultCurrency: account?.defaultCurrency ?? "",
      tagsInput: initialTags,
      source: account?.source ?? "",
      legacySalesforceId: account?.legacySalesforceId ?? "",
      active: account?.active ?? true,
    },
  })

  async function onSubmit(data: FormData) {
    setPending(true)
    setError(null)
    try {
      const emailDomains = data.emailDomainsInput
        ? data.emailDomainsInput.split(",").map((d) => d.trim()).filter(Boolean)
        : undefined

      const tags = data.tagsInput
        ? data.tagsInput.split(",").map((t) => t.trim()).filter(Boolean)
        : undefined

      const input: AccountCreateInput = {
        name: data.name,
        legalName: data.legalName || null,
        website: data.website || null,
        country: data.country || null,
        industry: (data.industry as AccountCreateInput["industry"]) || null,
        description: data.description || null,
        emailDomains,
        accountType: (data.accountType as AccountCreateInput["accountType"]) || null,
        lifecycleStatus: (data.lifecycleStatus as AccountCreateInput["lifecycleStatus"]) || null,
        tier: (data.tier as AccountCreateInput["tier"]) || null,
        region: (data.region as AccountCreateInput["region"]) || null,
        defaultCurrency: data.defaultCurrency || null,
        tags,
        source: (data.source as AccountCreateInput["source"]) || null,
        legacySalesforceId: data.legacySalesforceId || null,
        active: data.active,
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
                <Controller
                  name="industry"
                  control={form.control}
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={(v) => field.onChange(v || "")}>
                      <SelectTrigger id="industry">
                        <SelectValue placeholder="Select industry" />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCOUNT_INDUSTRIES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {enumLabel(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="accountType">Account Type</Label>
              <Controller
                name="accountType"
                control={form.control}
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={(v) => field.onChange(v || "")}>
                    <SelectTrigger id="accountType">
                      <SelectValue placeholder="Select account type" />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {enumLabel(t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="lifecycleStatus">Lifecycle Status</Label>
                <Controller
                  name="lifecycleStatus"
                  control={form.control}
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={(v) => field.onChange(v || "")}>
                      <SelectTrigger id="lifecycleStatus">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {LIFECYCLE_STATUSES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {enumLabel(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="tier">Tier</Label>
                <Controller
                  name="tier"
                  control={form.control}
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={(v) => field.onChange(v || "")}>
                      <SelectTrigger id="tier">
                        <SelectValue placeholder="Select tier" />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCOUNT_TIERS.map((t) => (
                          <SelectItem key={t} value={t}>
                            {enumLabel(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="region">Region</Label>
                <Controller
                  name="region"
                  control={form.control}
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={(v) => field.onChange(v || "")}>
                      <SelectTrigger id="region">
                        <SelectValue placeholder="Select region" />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCOUNT_REGIONS.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t.toUpperCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="source">Source</Label>
                <Controller
                  name="source"
                  control={form.control}
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={(v) => field.onChange(v || "")}>
                      <SelectTrigger id="source">
                        <SelectValue placeholder="Select source" />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCOUNT_SOURCES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {enumLabel(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="defaultCurrency">Default Currency</Label>
                <Input
                  id="defaultCurrency"
                  {...form.register("defaultCurrency")}
                  placeholder="USD"
                  maxLength={3}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="legacySalesforceId">Salesforce ID</Label>
                <Input
                  id="legacySalesforceId"
                  {...form.register("legacySalesforceId")}
                  placeholder="Legacy Salesforce ID"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="tagsInput">Tags</Label>
              <Input
                id="tagsInput"
                {...form.register("tagsInput")}
                placeholder="esports, gaming, premium (comma separated)"
              />
            </div>

            <div className="flex items-center gap-2">
              <Controller
                name="active"
                control={form.control}
                render={({ field }) => (
                  <Checkbox
                    id="active"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <Label htmlFor="active">Active</Label>
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
