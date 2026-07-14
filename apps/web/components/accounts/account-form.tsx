"use client"

import { useState, useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Save, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RecordEditDialog } from "@/components/forms/record-edit-dialog"
import { FormSection } from "@/components/forms/form-section"
import { EntityCombobox } from "@/components/entity-combobox"
import type { EntityOption } from "@/components/entity-combobox"
import type { AccountRecord, AccountCreateInput, AccountUpdateInput, AccountRelationshipKind } from "@/lib/data/accounts"
import type { AccountPrefill } from "@/lib/data/account-extraction-resolver"
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
  // ── Account Generator (ORR-735) — all optional, additive ──
  /** AI-extracted values used to pre-fill a NEW account. Ignored when editing. */
  prefill?: AccountPrefill
  /** Controlled open state (the generator drives the dialog after "analysing"). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Rendered at the top of the dialog body — the "AI-generated, review" banner. */
  banner?: React.ReactNode
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
  prefill,
  open: controlledOpen,
  onOpenChange: onOpenChangeProp,
  banner,
}: AccountFormProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlledOpen = controlledOpen !== undefined
  const open = isControlledOpen ? controlledOpen : internalOpen
  const setOpen = (next: boolean) => {
    if (onOpenChangeProp) onOpenChangeProp(next)
    if (!isControlledOpen) setInternalOpen(next)
  }
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
    // ORR-735: on a NEW account, `prefill` (AI-extracted) seeds the fields. Owner
    // is never inferred (gate G5), so it keeps its default.
    defaultValues: {
      name: account?.name ?? prefill?.name ?? "",
      legalName: account?.legalName ?? prefill?.legalName ?? "",
      accountOwnerUserId: account?.accountOwnerUserId ?? defaultOwnerId,
      website: account?.website ?? prefill?.website ?? "",
      country: account?.country ?? prefill?.country ?? "",
      industry: account?.industry ?? prefill?.industry ?? "",
      description: account?.description ?? prefill?.description ?? "",
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
        name: account?.name ?? prefill?.name ?? "",
        legalName: account?.legalName ?? prefill?.legalName ?? "",
        accountOwnerUserId: account?.accountOwnerUserId ?? defaultOwnerId,
        website: account?.website ?? prefill?.website ?? "",
        country: account?.country ?? prefill?.country ?? "",
        industry: account?.industry ?? prefill?.industry ?? "",
        description: account?.description ?? prefill?.description ?? "",
        emailDomainsInput: initialDomains,
      })
    }
  }

  return (
    <RecordEditDialog
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        // When the dialog is controlled (e.g. the AI generator owns the launcher
        // button), render no trigger of our own — otherwise the page shows two
        // "Create Account" buttons.
        isControlledOpen
          ? undefined
          : ((trigger ?? (
              <Button>
                <Plus className="size-4" />
                Create Account
              </Button>
            )) as React.ReactElement)
      }
      title={isEditing ? "Edit Account" : "Create Account"}
      description={
        isEditing
          ? "Update the account details below."
          : "Fill in the details to create a new account."
      }
      onSubmit={form.handleSubmit(onSubmit)}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            <Save className="size-4" />
            {pending ? "Saving..." : isEditing ? "Save Changes" : "Create Account"}
          </Button>
        </>
      }
    >
      {banner}
      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* hidden input for accountOwnerUserId so the form field is registered */}
      <input type="hidden" {...form.register("accountOwnerUserId")} />

      {/* ── Essentials ───────────────────────────────────────────────── */}
      <FormSection title="Essentials" collapsible={false}>
        <div className="col-span-full grid gap-1.5">
          <Label htmlFor="name">
            Account Name <span className="text-destructive">*</span>
          </Label>
          <Input id="name" {...form.register("name")} placeholder="Company or organization name" />
          {form.formState.errors.name && (
            <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
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
          <Input id="legalName" {...form.register("legalName")} placeholder="Registered legal name" />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="website">Website</Label>
          <Input id="website" type="url" {...form.register("website")} placeholder="https://example.com" />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="country">
            Country <span className="text-destructive">*</span>
          </Label>
          <Input id="country" {...form.register("country")} placeholder="Country" />
          {form.formState.errors.country && (
            <p className="text-xs text-destructive">{form.formState.errors.country.message}</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="industry">Industry</Label>
          <Input id="industry" {...form.register("industry")} placeholder="Industry" />
        </div>
      </FormSection>

      {/* ── Hierarchy ────────────────────────────────────────────────── */}
      <FormSection title="Hierarchy" defaultOpen>
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
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}
      </FormSection>

      {/* ── Commercial (custom fields + structured Tax IDs) ──────────── */}
      {(section3Defs.length > 0 || showTaxEditor) && (
        <FormSection title="Commercial" defaultOpen={false}>
          {section3Defs.length > 0 && (
            <div className="col-span-full">
              <CustomFieldsForm
                fieldDefinitions={section3Defs}
                values={customFieldValues}
                onChange={(key, value) => setCustomFieldValues((prev) => ({ ...prev, [key]: value }))}
                errors={{}}
              />
            </div>
          )}
          {showTaxEditor && (
            <div className="col-span-full">
              <TaxIdsEditor taxIdTypes={taxIdTypes} value={taxIds} onChange={setTaxIds} />
            </div>
          )}
        </FormSection>
      )}

      {/* ── Contact & Matching ───────────────────────────────────────── */}
      <FormSection title="Contact & Matching" defaultOpen={false}>
        <div className="col-span-full grid gap-1.5">
          <Label htmlFor="emailDomainsInput">Email Domains</Label>
          <Input id="emailDomainsInput" {...form.register("emailDomainsInput")} placeholder="example.com, other.com (comma separated)" />
          <p className="text-xs text-muted-foreground">
            Comma-separated list of company email domains. Used for automatic contact association.
          </p>
        </div>

        {section5Defs.length > 0 && (
          <div className="col-span-full">
            <CustomFieldsForm
              fieldDefinitions={section5Defs}
              values={customFieldValues}
              onChange={(key, value) => setCustomFieldValues((prev) => ({ ...prev, [key]: value }))}
              errors={{}}
            />
          </div>
        )}
      </FormSection>

      {/* ── Description ──────────────────────────────────────────────── */}
      <FormSection title="Description" collapsible={false}>
        <div className="col-span-full grid gap-1.5">
          <textarea
            id="description"
            className="min-h-[100px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-y placeholder:text-muted-foreground"
            placeholder="Company description or notes"
            {...form.register("description")}
          />
        </div>

        {section7Defs.length > 0 && (
          <div className="col-span-full">
            <CustomFieldsForm
              fieldDefinitions={section7Defs}
              values={customFieldValues}
              onChange={(key, value) => setCustomFieldValues((prev) => ({ ...prev, [key]: value }))}
              errors={{}}
            />
          </div>
        )}
      </FormSection>
    </RecordEditDialog>
  )
}
