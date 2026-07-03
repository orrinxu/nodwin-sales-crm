"use client"

import { useState, useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Save, Plus, ChevronDown } from "lucide-react"

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
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible"
import { EntityCombobox } from "@/components/entity-combobox"
import type { EntityOption } from "@/components/entity-combobox"
import type { AccountRecord, AccountCreateInput, AccountUpdateInput, AccountRelationshipKind } from "@/lib/data/accounts"
import type { FieldDefinition } from "@/lib/data/field-definitions.types"
import type { TaxIdType, AccountTaxId } from "@/lib/data/account-tax-ids"
import { CustomFieldsForm } from "@/components/contacts/custom-fields-form"
import { TaxIdsEditor, type TaxIdRow } from "@/components/accounts/tax-ids-editor"

const RELATIONSHIP_KIND_OPTIONS: { value: AccountRelationshipKind; label: string }[] = [
  { value: "subsidiary_of", label: "Subsidiary of" },
  { value: "parent_of", label: "Parent of" },
  { value: "partner_with", label: "Partner with" },
  { value: "procurement_via", label: "Procurement via" },
  { value: "sister_company", label: "Sister company" },
]

const SECTION_3_CF_KEYS = ["payment_terms", "credit_risk_flag"]
const SECTION_5_CF_KEYS = ["phone_main", "hq_address"]

// Legacy per-type tax custom fields, now replaced by structured account_tax_ids
// (ORR-622). They are excluded from every custom-field section so they neither
// render as editable custom fields nor leak into the generic Custom Fields
// bucket; the structured Tax IDs editor is the sole surface for tax identifiers.
export const TAX_CF_KEYS = ["tax_gst_in", "tax_pan_in", "tax_vat_eu", "tax_trn_mena"]

const formSchema = z.object({
  name: z.string().min(1, "Account name is required").max(200),
  legalName: z.string().max(200).optional().or(z.literal("")),
  accountOwnerUserId: z.string().optional().or(z.literal("")),
  website: z.string().max(500).optional().or(z.literal("")),
  country: z.string().min(1, "Country is required").max(100),
  industry: z.string().max(100).optional().or(z.literal("")),
  description: z.string().max(5000).optional().or(z.literal("")),
  emailDomainsInput: z.string().max(1000).optional().or(z.literal("")),
})

type FormData = z.infer<typeof formSchema>

interface AccountFormProps {
  account?: AccountRecord
  fieldDefinitions?: FieldDefinition[]
  taxIdTypes?: TaxIdType[]
  initialTaxIds?: AccountTaxId[]
  ownerOptions: EntityOption[]
  accountOptions: EntityOption[]
  currentUserId?: string
  parentRelationship?: {
    toAccountId: string
    kind: AccountRelationshipKind
  } | null
  createAction: (input: AccountCreateInput) => Promise<AccountRecord>
  updateAction?: (id: string, input: AccountUpdateInput) => Promise<AccountRecord>
  onSaveRelationship?: (data: { parentAccountId: string; kind: AccountRelationshipKind }) => Promise<void>
  saveTaxIdsAction?: (accountId: string, input: { taxIds: TaxIdRow[] }) => Promise<void>
  onSuccess: () => void
  trigger?: React.ReactNode
}

export function AccountForm({
  account,
  fieldDefinitions = [],
  taxIdTypes = [],
  initialTaxIds = [],
  ownerOptions,
  accountOptions,
  currentUserId,
  parentRelationship,
  createAction,
  updateAction,
  onSaveRelationship,
  saveTaxIdsAction,
  onSuccess,
  trigger,
}: AccountFormProps) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [parentAccountId, setParentAccountId] = useState("")
  const [relationshipKind, setRelationshipKind] = useState<AccountRelationshipKind | "">("")

  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>(
    () => account?.customData ?? {},
  )

  const initialTaxIdRows = useMemo<TaxIdRow[]>(
    () => initialTaxIds.map((t) => ({ taxType: t.taxType, value: t.value })),
    [initialTaxIds],
  )
  const [taxIds, setTaxIds] = useState<TaxIdRow[]>(initialTaxIdRows)

  const isEditing = !!account

  const initialDomains = account?.emailDomains?.join(", ") ?? ""

  const defaultOwnerId = currentUserId && ownerOptions.some((o) => o.id === currentUserId)
    ? currentUserId
    : ""

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: account?.name ?? "",
      legalName: account?.legalName ?? "",
      accountOwnerUserId: account?.accountOwnerUserId ?? defaultOwnerId,
      website: account?.website ?? "",
      country: account?.country ?? "",
      industry: account?.industry ?? "",
      description: account?.description ?? "",
      emailDomainsInput: initialDomains,
    },
  })

  const ownerValue = form.watch("accountOwnerUserId")

  const { section3Defs, section5Defs, section7Defs } = useMemo(() => {
    const s3 = fieldDefinitions.filter((d) => SECTION_3_CF_KEYS.includes(d.key))
    const s5 = fieldDefinitions.filter((d) => SECTION_5_CF_KEYS.includes(d.key))
    // TAX_CF_KEYS are deliberately excluded everywhere — replaced by the
    // structured Tax IDs editor — so they never leak into the s7 bucket.
    const used = new Set([...SECTION_3_CF_KEYS, ...SECTION_5_CF_KEYS, ...TAX_CF_KEYS])
    const s7 = fieldDefinitions.filter((d) => !used.has(d.key))
    return { section3Defs: s3, section5Defs: s5, section7Defs: s7 }
  }, [fieldDefinitions])

  // The structured Tax IDs editor shows whenever there are types to add or rows
  // already present (incl. rows of a now-inactive type that must not be dropped).
  const showTaxEditor = taxIdTypes.length > 0 || taxIds.length > 0

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
        accountOwnerUserId: data.accountOwnerUserId || null,
        website: data.website || null,
        country: data.country || null,
        industry: data.industry || null,
        description: data.description || null,
        emailDomains,
        customData: Object.keys(customFieldValues).length > 0 ? customFieldValues : undefined,
      }

      let savedAccount: AccountRecord

      if (isEditing && account && updateAction) {
        savedAccount = await updateAction(account.id, input)
      } else {
        savedAccount = await createAction(input)
      }

      if (onSaveRelationship && parentAccountId && relationshipKind) {
        await onSaveRelationship({
          parentAccountId,
          kind: relationshipKind as AccountRelationshipKind,
        })
      }

      // Persist tax IDs as a second call, once we have the account id — mirrors
      // the relationship save. The replace RPC treats an empty list as "clear".
      if (saveTaxIdsAction) {
        await saveTaxIdsAction(savedAccount.id, {
          taxIds: taxIds
            .map((t) => ({ taxType: t.taxType, value: t.value.trim() }))
            .filter((t) => t.value !== ""),
        })
      }

      setOpen(false)
      form.reset()
      setParentAccountId("")
      setRelationshipKind("")
      setCustomFieldValues(account?.customData ?? {})
      setTaxIds(initialTaxIdRows)
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
      setTaxIds(initialTaxIdRows)
      setParentAccountId(parentRelationship?.toAccountId ?? "")
      setRelationshipKind(parentRelationship?.kind ?? "")
      form.reset({
        name: account?.name ?? "",
        legalName: account?.legalName ?? "",
        accountOwnerUserId: account?.accountOwnerUserId ?? defaultOwnerId,
        website: account?.website ?? "",
        country: account?.country ?? "",
        industry: account?.industry ?? "",
        description: account?.description ?? "",
        emailDomainsInput: initialDomains,
      })
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

            {/* hidden input for accountOwnerUserId so the form field is registered */}
            <input type="hidden" {...form.register("accountOwnerUserId")} />

            {/* ── Section 1: Essentials ────────────────────────────── */}
            <SectionHeader title="Essentials" />

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
              <Label>Account Owner</Label>
              <EntityCombobox
                items={ownerOptions}
                value={ownerValue ?? ""}
                onChange={(v) => form.setValue("accountOwnerUserId", v ?? undefined)}
                placeholder="Select owner..."
                searchPlaceholder="Search users..."
                emptyMessage="No users found."
              />
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

            {/* ── Section 2: Hierarchy ────────────────────────────── */}
            <CollapsibleSection title="Hierarchy" defaultOpen>
              <div className="grid gap-1.5">
                <Label>Parent / Related Account</Label>
                <EntityCombobox
                  items={accountOptions}
                  value={parentAccountId}
                  onChange={(v) => setParentAccountId(v ?? "")}
                  placeholder="Select account..."
                  searchPlaceholder="Search accounts..."
                  emptyMessage="No accounts found."
                />
              </div>

              {parentAccountId && (
                <div className="grid gap-1.5">
                  <Label>Relationship</Label>
                  <select
                    className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    value={relationshipKind}
                    onChange={(e) => setRelationshipKind(e.target.value as AccountRelationshipKind)}
                  >
                    <option value="">Select relationship kind...</option>
                    {RELATIONSHIP_KIND_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </CollapsibleSection>

            {/* ── Section 3: Commercial (custom fields + structured Tax IDs) ── */}
            {(section3Defs.length > 0 || showTaxEditor) && (
              <CollapsibleSection title="Commercial" defaultOpen={false}>
                {section3Defs.length > 0 && (
                  <CustomFieldsForm
                    fieldDefinitions={section3Defs}
                    values={customFieldValues}
                    onChange={(key, value) =>
                      setCustomFieldValues((prev) => ({ ...prev, [key]: value }))
                    }
                    errors={{}}
                  />
                )}
                {showTaxEditor && (
                  <TaxIdsEditor
                    taxIdTypes={taxIdTypes}
                    value={taxIds}
                    onChange={setTaxIds}
                  />
                )}
              </CollapsibleSection>
            )}

            {/* ── Section 5: Contact & Matching ────────────────────────────── */}
            <CollapsibleSection title="Contact & Matching" defaultOpen={false}>
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

              {section5Defs.length > 0 && (
                <CustomFieldsForm
                  fieldDefinitions={section5Defs}
                  values={customFieldValues}
                  onChange={(key, value) =>
                    setCustomFieldValues((prev) => ({ ...prev, [key]: value }))
                  }
                  errors={{}}
                />
              )}
            </CollapsibleSection>

            {/* ── Section 6: Description ────────────────────────────── */}
            <SectionHeader title="Description" />
            <div className="grid gap-1.5">
              <textarea
                id="description"
                className="min-h-[100px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-y placeholder:text-muted-foreground"
                placeholder="Company description or notes"
                {...form.register("description")}
              />
            </div>

            {/* ── Section 7: Custom Fields ────────────────────────────── */}
            {section7Defs.length > 0 && (
              <CustomFieldsForm
                fieldDefinitions={section7Defs}
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

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="border-b pb-1.5 pt-1">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
    </div>
  )
}

function CollapsibleSection({
  title,
  defaultOpen,
  children,
}: {
  title: string
  defaultOpen: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <button
        type="button"
        className="group flex w-full items-center gap-2 py-1 cursor-pointer select-none rounded-md transition-colors hover:bg-muted/50"
        onClick={() => setOpen(!open)}
      >
        <ChevronDown
          className="size-3.5 shrink-0 transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
      </button>
      <CollapsibleContent>
        <div className="space-y-3 pt-2 pb-0.5">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
