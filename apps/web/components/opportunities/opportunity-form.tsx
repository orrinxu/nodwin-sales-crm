"use client"

import { useState, useCallback, useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Save, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RecordEditDialog } from "@/components/forms/record-edit-dialog"
import { FormSection, FieldGrid } from "@/components/forms/form-section"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { EntityCombobox, type EntityOption } from "@/components/entity-combobox"
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select"

import type { OpportunityRecord, OpportunityCreateInput, BusinessUnitOption } from "@/lib/data/opportunities.types"
import type { AccountOption } from "@/lib/data/contacts"
import type { FieldDefinition } from "@/lib/data/field-definitions.types"
import { CustomFieldsForm } from "@/components/contacts/custom-fields-form"
import {
  DEAL_STAGES,
  type DealStage,
} from "@/lib/opportunity"
import { getStageLabel } from "@/lib/data/opportunities.types"
import {
  PROJECT_TYPES,
  REVENUE_CATEGORIES,
  RECURRING_SPLIT_KINDS,
  VISIBILITY_TIERS,
  SERVICE_TYPES,
  PROPERTY_TYPES,
  SERVICE_TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
  type ProjectType,
  type RevenueCategory,
  type RecurringSplitKind,
  type VisibilityTier,
  type PropertyType,
  type ServiceType,
} from "@/lib/data/opportunities.types"

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  accountId: z.string().min(1, "Account is required"),
  primaryContactId: z.string().optional().or(z.literal("")),
  salesUnitId: z.string().min(1, "Sales unit is required"),
  ownerUserId: z.string().optional().or(z.literal("")),
  stage: z.enum(DEAL_STAGES),
  amount: z.string().optional(),
  currency: z.string().max(10).optional().or(z.literal("")),
  closeDate: z.string().optional().or(z.literal("")),
  probabilityPct: z.coerce.number().min(0).max(100).optional(),
  description: z.string().max(2000).optional().or(z.literal("")),
  servicePeriodStart: z.string().optional().or(z.literal("")),
  servicePeriodEnd: z.string().optional().or(z.literal("")),
  executionDate: z.string().optional().or(z.literal("")),
  estimatedGrossMarginPct: z.coerce.number().optional(),
  countryExecution: z.string().max(100).optional().or(z.literal("")),
  projectType: z.enum(PROJECT_TYPES).optional().or(z.literal("")),
  revenueCategory: z.enum(REVENUE_CATEGORIES).optional().or(z.literal("")),
  recurring: z.coerce.boolean().optional(),
  recurringSplitKind: z.enum(RECURRING_SPLIT_KINDS).optional().or(z.literal("")),
  visibilityTier: z.enum(VISIBILITY_TIERS).optional(),
  billingEntityId: z.string().optional().or(z.literal("")),
  entitySalesId: z.string().optional().or(z.literal("")),
  barterValue: z.string().optional().or(z.literal("")),
  serviceType: z.string().optional().or(z.literal("")),
  propertyType: z.enum(PROPERTY_TYPES).optional().or(z.literal("")),
  lossReason: z.string().max(2000).optional().or(z.literal("")),
}).superRefine((data, ctx) => {
  if (data.recurring && !data.recurringSplitKind) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Recurring split kind is required when recurring is enabled",
      path: ["recurringSplitKind"],
    })
  }
  if (data.stage === "closed_lost" && !data.lossReason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Loss reason is required when stage is Closed Lost",
      path: ["lossReason"],
    })
  }
})

type FormData = z.infer<typeof formSchema>

function getDefaultStageProbability(stage: DealStage): number {
  switch (stage) {
    case "qualify": return 10
    case "meet_and_present": return 25
    case "propose": return 50
    case "negotiate": return 75
    case "verbal_agreement": return 90
    case "closed_won": return 100
    case "closed_lost": return 0
    default: return 0
  }
}

// Commercial/legal fields (margin, barter, execution date, service period,
// billing entity, entity sales, recurring) surface once a deal reaches Propose.
const COMMERCIAL_STAGES = new Set<DealStage>([
  "propose",
  "negotiate",
  "verbal_agreement",
  "closed_won",
  "closed_lost",
])

const COUNTRY_OPTIONS: MultiSelectOption[] = [
  { id: "AE", label: "United Arab Emirates" },
  { id: "AR", label: "Argentina" },
  { id: "AU", label: "Australia" },
  { id: "BD", label: "Bangladesh" },
  { id: "BR", label: "Brazil" },
  { id: "CA", label: "Canada" },
  { id: "CN", label: "China" },
  { id: "DE", label: "Germany" },
  { id: "EG", label: "Egypt" },
  { id: "ES", label: "Spain" },
  { id: "FR", label: "France" },
  { id: "GB", label: "United Kingdom" },
  { id: "ID", label: "Indonesia" },
  { id: "IN", label: "India" },
  { id: "IT", label: "Italy" },
  { id: "JP", label: "Japan" },
  { id: "KR", label: "South Korea" },
  { id: "MX", label: "Mexico" },
  { id: "MY", label: "Malaysia" },
  { id: "NG", label: "Nigeria" },
  { id: "NL", label: "Netherlands" },
  { id: "PH", label: "Philippines" },
  { id: "PK", label: "Pakistan" },
  { id: "PL", label: "Poland" },
  { id: "QA", label: "Qatar" },
  { id: "RU", label: "Russia" },
  { id: "SA", label: "Saudi Arabia" },
  { id: "SG", label: "Singapore" },
  { id: "TH", label: "Thailand" },
  { id: "TR", label: "Turkey" },
  { id: "US", label: "United States" },
  { id: "VN", label: "Vietnam" },
  { id: "ZA", label: "South Africa" },
]

interface OpportunityFormProps {
  opportunity?: OpportunityRecord
  accounts?: AccountOption[]
  businessUnits: BusinessUnitOption[]
  users?: EntityOption[]
  fieldDefinitions?: FieldDefinition[]
  createAction: (input: OpportunityCreateInput) => Promise<OpportunityRecord>
  updateAction?: (id: string, input: unknown) => Promise<OpportunityRecord>
  onSuccess: () => void
  trigger?: React.ReactNode
  searchAccountsAction?: (query: string) => Promise<EntityOption[]>
  searchContactsAction?: (query: string, accountId?: string) => Promise<EntityOption[]>
  searchUsersAction?: (query: string) => Promise<EntityOption[]>
  createContactQuickAction?: (input: { fullName: string; email?: string; accountId?: string }) => Promise<EntityOption>
  currentUserId?: string
  // Pre-fills the currency on a NEW deal (from the user's entry_currency_default
  // preference). Ignored when editing — a saved deal keeps its own currency.
  defaultCurrency?: string
}

export function OpportunityForm({
  opportunity,
  accounts: accountsProp = [],
  businessUnits,
  users: usersProp = [],
  fieldDefinitions = [],
  createAction,
  updateAction,
  onSuccess,
  trigger,
  searchAccountsAction,
  searchContactsAction,
  searchUsersAction,
  createContactQuickAction,
  currentUserId,
  defaultCurrency,
}: OpportunityFormProps) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAllFields, setShowAllFields] = useState(false)
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>(
    () => opportunity?.customData ?? {},
  )
  const [countryExecutionValue, setCountryExecutionValue] = useState<string[]>(
    () => opportunity?.countryExecution
      ? opportunity.countryExecution.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
  )
  const [serviceTypeValue, setServiceTypeValue] = useState<string[]>(
    () => opportunity?.serviceType ?? [],
  )

  const serviceTypeOptions: MultiSelectOption[] = useMemo(
    // eslint-disable-next-line security/detect-object-injection
    () => SERVICE_TYPES.map((t) => ({ id: t, label: SERVICE_TYPE_LABELS[t] ?? t })),
    [],
  )

  const isEditing = !!opportunity

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: opportunity?.name ?? "",
      accountId: opportunity?.accountId ?? "",
      primaryContactId: opportunity?.primaryContactId ?? "",
      salesUnitId: opportunity?.salesUnitId ?? "",
      ownerUserId: opportunity?.ownerUserId ?? currentUserId ?? "",
      stage: opportunity?.stage ?? "qualify",
      amount: opportunity ? String(opportunity.amount) : undefined,
      currency: opportunity?.currency ?? defaultCurrency ?? "USD",
      closeDate: opportunity?.closeDate ?? "",
      probabilityPct: opportunity?.probabilityPct ?? getDefaultStageProbability(opportunity?.stage ?? "qualify"),
      description: opportunity?.description ?? "",
      servicePeriodStart: opportunity?.servicePeriodStart ?? "",
      servicePeriodEnd: opportunity?.servicePeriodEnd ?? "",
      executionDate: opportunity?.executionDate ?? "",
      estimatedGrossMarginPct: opportunity?.estimatedGrossMarginPct ?? undefined,
      countryExecution: opportunity?.countryExecution ?? "",
      projectType: (opportunity?.projectType as ProjectType) ?? undefined,
      revenueCategory: (opportunity?.revenueCategory as RevenueCategory) ?? undefined,
      recurring: opportunity?.recurring ?? false,
      recurringSplitKind: (opportunity?.recurringSplitKind as RecurringSplitKind) ?? undefined,
      visibilityTier: (opportunity?.visibilityTier as VisibilityTier) ?? "standard",
      billingEntityId: opportunity?.billingEntityId ?? "",
      entitySalesId: opportunity?.entitySalesId ?? "",
      barterValue: opportunity?.barterValue ?? "",
      serviceType: opportunity?.serviceType?.join(", ") ?? "",
      propertyType: (opportunity?.propertyType ?? "") as "" | PropertyType,
      lossReason: opportunity?.lossReason ?? "",
    },
  })

  const watchRecurring = form.watch("recurring")
  const watchStage = form.watch("stage")
  const watchAccountId = form.watch("accountId")
  const isClosedLost = watchStage === "closed_lost"

  // Reveal commercial/legal fields at Propose+, when editing a deal that already
  // has such data, or when the user explicitly opts to show everything — so no
  // field is ever unreachable.
  const hasCommercialValues =
    !!opportunity &&
    (opportunity.estimatedGrossMarginPct != null ||
      !!opportunity.barterValue ||
      !!opportunity.executionDate ||
      !!opportunity.servicePeriodStart ||
      !!opportunity.servicePeriodEnd ||
      !!opportunity.billingEntityId ||
      !!opportunity.entitySalesId ||
      !!opportunity.recurring)
  const showCommercial =
    COMMERCIAL_STAGES.has(watchStage) || showAllFields || hasCommercialValues

  const handleStageChange = useCallback((stage: DealStage) => {
    form.setValue("stage", stage)
    form.setValue("probabilityPct", getDefaultStageProbability(stage))
  }, [form])

  async function onSubmit(data: FormData) {
    setPending(true)
    setError(null)
    try {
      const input: OpportunityCreateInput = {
        name: data.name,
        accountId: data.accountId,
        primaryContactId: data.primaryContactId || undefined,
        stage: data.stage,
        salesUnitId: data.salesUnitId,
        ownerUserId: data.ownerUserId || undefined,
        amount: data.amount || undefined,
        currency: data.currency || "USD",
        closeDate: data.closeDate || undefined,
        probabilityPct: data.probabilityPct ?? 0,
        description: data.description || undefined,
        servicePeriodStart: data.servicePeriodStart || undefined,
        servicePeriodEnd: data.servicePeriodEnd || undefined,
        executionDate: data.executionDate || undefined,
        estimatedGrossMarginPct: data.estimatedGrossMarginPct ?? undefined,
        projectType: (data.projectType as ProjectType) || undefined,
        revenueCategory: (data.revenueCategory as RevenueCategory) || undefined,
        recurring: data.recurring ?? false,
        recurringSplitKind: (data.recurringSplitKind as RecurringSplitKind) || undefined,
        visibilityTier: (data.visibilityTier as VisibilityTier) || undefined,
        billingEntityId: data.billingEntityId || undefined,
        entitySalesId: data.entitySalesId || undefined,
        barterValue: data.barterValue || undefined,
        serviceType: serviceTypeValue.length > 0 ? serviceTypeValue as ServiceType[] : undefined,
        propertyType: (data.propertyType || undefined) as PropertyType | undefined,
        lossReason: data.stage === "closed_lost" ? data.lossReason || undefined : undefined,
        countryExecution: countryExecutionValue.length > 0
          ? countryExecutionValue.join(", ")
          : undefined,
        customData: Object.keys(customFieldValues).length > 0 ? customFieldValues : undefined,
      }

      if (isEditing && opportunity && updateAction) {
        await updateAction(opportunity.id, input)
      } else {
        await createAction(input)
      }

      setOpen(false)
      form.reset()
      setCustomFieldValues(opportunity?.customData ?? {})
      setShowAllFields(false)
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : "An unexpected error occurred")
    } finally {
      setPending(false)
    }
  }

  function handleOpenChange(newOpen: boolean) {
    setOpen(newOpen)
    setShowAllFields(false)
    if (newOpen && opportunity) {
      form.reset({
        name: opportunity.name,
        accountId: opportunity.accountId,
        primaryContactId: opportunity.primaryContactId ?? "",
        salesUnitId: opportunity.salesUnitId,
        ownerUserId: opportunity.ownerUserId ?? currentUserId ?? "",
        stage: opportunity.stage,
        amount: String(opportunity.amount),
        currency: opportunity.currency,
        closeDate: opportunity.closeDate ?? "",
        probabilityPct: opportunity.probabilityPct,
        description: opportunity.description ?? "",
        servicePeriodStart: opportunity.servicePeriodStart ?? "",
        servicePeriodEnd: opportunity.servicePeriodEnd ?? "",
        executionDate: opportunity.executionDate ?? "",
        estimatedGrossMarginPct: opportunity.estimatedGrossMarginPct ?? undefined,
        countryExecution: opportunity.countryExecution ?? "",
        projectType: (opportunity.projectType as ProjectType) ?? undefined,
        revenueCategory: (opportunity.revenueCategory as RevenueCategory) ?? undefined,
        recurring: opportunity.recurring ?? false,
        recurringSplitKind: (opportunity.recurringSplitKind as RecurringSplitKind) ?? undefined,
        visibilityTier: (opportunity.visibilityTier as VisibilityTier) ?? "standard",
        billingEntityId: opportunity.billingEntityId ?? "",
        entitySalesId: opportunity.entitySalesId ?? "",
        barterValue: opportunity.barterValue ?? "",
        serviceType: opportunity.serviceType?.join(", ") ?? "",
        propertyType: (opportunity.propertyType ?? "") as "" | PropertyType,
        lossReason: opportunity.lossReason ?? "",
      })
      setCustomFieldValues(opportunity.customData ?? {})
      setCountryExecutionValue(
        opportunity.countryExecution
          ? opportunity.countryExecution.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
      )
      setServiceTypeValue(opportunity.serviceType ?? [])
    } else if (newOpen) {
      form.reset({
        name: "",
        accountId: "",
        primaryContactId: "",
        salesUnitId: "",
        ownerUserId: currentUserId ?? "",
        stage: "qualify",
        amount: undefined,
        currency: defaultCurrency ?? "USD",
        closeDate: "",
        probabilityPct: 10,
        description: "",
        servicePeriodStart: "",
        servicePeriodEnd: "",
        executionDate: "",
        estimatedGrossMarginPct: undefined,
        countryExecution: "",
        projectType: undefined,
        revenueCategory: undefined,
        recurring: false,
        recurringSplitKind: undefined,
        visibilityTier: "standard",
        billingEntityId: "",
        entitySalesId: "",
        barterValue: "",
        serviceType: "",
        propertyType: "" as "" | PropertyType,
        lossReason: "",
      })
      setCustomFieldValues({})
      setCountryExecutionValue([])
      setServiceTypeValue([])
    }
  }

  const accountsForCombobox: EntityOption[] = accountsProp.map((a) => ({
    id: a.id,
    name: a.name,
  }))

  const handleCreateContact = createContactQuickAction
    ? async (name: string): Promise<EntityOption> => {
        const accountId = form.getValues("accountId") || undefined
        return createContactQuickAction({ fullName: name, accountId })
      }
    : undefined

  return (
    <RecordEditDialog
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        (trigger ?? (
          <Button>
            <Plus className="size-4" />
            Create Opportunity
          </Button>
        )) as React.ReactElement
      }
      title={isEditing ? "Edit Opportunity" : "Create Opportunity"}
      description={
        isEditing
          ? "Update the opportunity details below."
          : "Fill in the details to create a new opportunity."
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
            {pending ? "Saving..." : isEditing ? "Save Changes" : "Create Opportunity"}
          </Button>
        </>
      }
    >
      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Deal details ─────────────────────────────────────────────── */}
      <FormSection title="Deal details" collapsible={false}>
        <div className="grid gap-1.5">
          <Label htmlFor="name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input id="name" {...form.register("name")} placeholder="Deal name" />
          {form.formState.errors.name && (
            <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label>
            Account <span className="text-destructive">*</span>
          </Label>
          <EntityCombobox
            items={accountsForCombobox}
            value={form.getValues("accountId")}
            valueLabel={opportunity?.accountName ?? undefined}
            onChange={(v) => {
              form.setValue("accountId", v ?? "", { shouldValidate: true })
              form.setValue("primaryContactId", "")
            }}
            searchAction={searchAccountsAction}
            placeholder="Select account"
            searchPlaceholder="Search accounts..."
            emptyMessage="No accounts found."
          />
          {form.formState.errors.accountId && (
            <p className="text-xs text-destructive">{form.formState.errors.accountId.message}</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label>Primary Contact</Label>
          <EntityCombobox
            items={[]}
            value={form.getValues("primaryContactId") || null}
            onChange={(v) => form.setValue("primaryContactId", v ?? "", { shouldValidate: true })}
            searchAction={
              searchContactsAction
                ? (query) => searchContactsAction(query, form.getValues("accountId") || undefined)
                : undefined
            }
            placeholder="Select contact"
            searchPlaceholder="Search contacts..."
            emptyMessage="No contacts found."
            disabled={!watchAccountId}
            onCreate={handleCreateContact}
            createLabel={(q) => `Create contact "${q}"`}
          />
          {!watchAccountId && (
            <p className="text-xs text-muted-foreground">
              Select an account first to browse its contacts
            </p>
          )}
        </div>

        <FieldGrid>
          <div className="grid gap-1.5">
            <Label>
              Sales Unit <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.getValues("salesUnitId")}
              onValueChange={(v) => form.setValue("salesUnitId", String(v ?? ""), { shouldValidate: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select unit" />
              </SelectTrigger>
              <SelectContent>
                {businessUnits.map((bu) => (
                  <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.salesUnitId && (
              <p className="text-xs text-destructive">{form.formState.errors.salesUnitId.message}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label>Owner</Label>
            <EntityCombobox
              items={usersProp}
              value={form.getValues("ownerUserId") || null}
              valueLabel={opportunity?.ownerName ?? undefined}
              onChange={(v) => form.setValue("ownerUserId", v ?? "", { shouldValidate: true })}
              searchAction={searchUsersAction}
              placeholder="Select owner"
              searchPlaceholder="Search users..."
              emptyMessage="No users found."
            />
          </div>
        </FieldGrid>

        <FieldGrid>
          <div className="grid gap-1.5">
            <Label>Stage</Label>
            <Select value={watchStage} onValueChange={(v) => handleStageChange(String(v ?? "") as DealStage)}>
              <SelectTrigger>
                <SelectValue placeholder="Select stage" />
              </SelectTrigger>
              <SelectContent>
                {DEAL_STAGES.map((s) => (
                  <SelectItem key={s} value={s}>{getStageLabel(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="probabilityPct">Probability (%)</Label>
            <Input id="probabilityPct" type="number" min="0" max="100" {...form.register("probabilityPct")} placeholder="0" />
          </div>
        </FieldGrid>

        <FieldGrid>
          <div className="grid gap-1.5">
            <Label htmlFor="amount">Amount</Label>
            <Input id="amount" type="number" step="0.01" min="0" {...form.register("amount")} placeholder="0.00" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="currency">Currency</Label>
            <Input id="currency" {...form.register("currency")} placeholder="USD" />
          </div>
        </FieldGrid>

        <div className="grid gap-1.5">
          <Label htmlFor="closeDate">Close Date</Label>
          <Input id="closeDate" type="date" {...form.register("closeDate")} />
        </div>

        {isClosedLost && (
          <div className="grid gap-1.5">
            <Label htmlFor="lossReason">
              Loss Reason <span className="text-destructive">*</span>
            </Label>
            <Input id="lossReason" {...form.register("lossReason")} placeholder="Why was this opportunity lost?" />
            {form.formState.errors.lossReason && (
              <p className="text-xs text-destructive">{form.formState.errors.lossReason.message}</p>
            )}
          </div>
        )}
      </FormSection>

      {/* ── Classification ───────────────────────────────────────────── */}
      <FormSection title="Classification" defaultOpen={false}>
        <div className="grid gap-1.5">
          <Label>Service Type</Label>
          <MultiSelect
            options={serviceTypeOptions}
            value={serviceTypeValue}
            onChange={setServiceTypeValue}
            placeholder="Add service types..."
            emptyMessage="No matching service types."
          />
        </div>

        <FieldGrid>
          <div className="grid gap-1.5">
            <Label>Property Type</Label>
            <Select
              value={form.getValues("propertyType") || ""}
              onValueChange={(v) => form.setValue("propertyType", (v ? String(v) : "") as "" | PropertyType, { shouldValidate: true })}
            >
              <SelectTrigger><SelectValue placeholder="Select property type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {PROPERTY_TYPES.map((t) => (
                  // eslint-disable-next-line security/detect-object-injection
                  <SelectItem key={t} value={t}>{PROPERTY_TYPE_LABELS[t] ?? t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Project Type</Label>
            <Select
              value={form.getValues("projectType") || ""}
              onValueChange={(v) => form.setValue("projectType", (v ? String(v) : "") as ProjectType, { shouldValidate: true })}
            >
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {PROJECT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </FieldGrid>

        <FieldGrid>
          <div className="grid gap-1.5">
            <Label>Revenue Category</Label>
            <Select
              value={form.getValues("revenueCategory") || ""}
              onValueChange={(v) => form.setValue("revenueCategory", (v ? String(v) : "") as RevenueCategory, { shouldValidate: true })}
            >
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {REVENUE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Visibility Tier</Label>
            <Select
              value={form.getValues("visibilityTier") ?? "standard"}
              onValueChange={(v) => form.setValue("visibilityTier", (v ? String(v) : "standard") as VisibilityTier, { shouldValidate: true })}
            >
              <SelectTrigger><SelectValue placeholder="Standard" /></SelectTrigger>
              <SelectContent>
                {VISIBILITY_TIERS.map((t) => (
                  <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </FieldGrid>

        <div className="grid gap-1.5">
          <Label>Country of Execution</Label>
          <MultiSelect
            options={COUNTRY_OPTIONS}
            value={countryExecutionValue}
            onChange={setCountryExecutionValue}
            placeholder="Add countries..."
            emptyMessage="No matching countries."
          />
        </div>
      </FormSection>

      {/* ── Commercials & legal (stage-gated: Propose onward) ────────── */}
      {showCommercial ? (
        <FormSection title="Commercials & legal" defaultOpen>
          <FieldGrid>
            <div className="grid gap-1.5">
              <Label htmlFor="estimatedGrossMarginPct">Estimated Gross Margin (%)</Label>
              <Input id="estimatedGrossMarginPct" type="number" step="0.1" min="0" max="100" {...form.register("estimatedGrossMarginPct")} placeholder="0" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="barterValue">Barter Value</Label>
              <Input id="barterValue" {...form.register("barterValue")} placeholder="0.00" />
            </div>
          </FieldGrid>

          <FieldGrid>
            <div className="grid gap-1.5">
              <Label htmlFor="servicePeriodStart">Service Start</Label>
              <Input id="servicePeriodStart" type="date" {...form.register("servicePeriodStart")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="servicePeriodEnd">Service End</Label>
              <Input id="servicePeriodEnd" type="date" {...form.register("servicePeriodEnd")} />
            </div>
          </FieldGrid>

          <div className="grid gap-1.5">
            <Label htmlFor="executionDate">Execution Date</Label>
            <Input id="executionDate" type="date" {...form.register("executionDate")} />
          </div>

          <FieldGrid>
            <div className="grid gap-1.5">
              <Label>Billing Entity</Label>
              <Select
                value={form.getValues("billingEntityId") || ""}
                onValueChange={(v) => form.setValue("billingEntityId", String(v ?? ""), { shouldValidate: true })}
              >
                <SelectTrigger><SelectValue placeholder="Select billing entity" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {businessUnits.map((bu) => (<SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Entity Sales</Label>
              <Select
                value={form.getValues("entitySalesId") || ""}
                onValueChange={(v) => form.setValue("entitySalesId", String(v ?? ""), { shouldValidate: true })}
              >
                <SelectTrigger><SelectValue placeholder="Select entity sales" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {businessUnits.map((bu) => (<SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </FieldGrid>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="grid gap-0.5">
              <Label className="text-sm font-medium">Recurring</Label>
              <p className="text-xs text-muted-foreground">Is this a recurring engagement?</p>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                aria-label="Recurring"
                className="size-4 rounded border-input accent-primary"
                checked={watchRecurring ?? false}
                onChange={(e) => {
                  form.setValue("recurring", e.target.checked)
                  if (!e.target.checked) form.setValue("recurringSplitKind", "" as RecurringSplitKind)
                }}
              />
              <span className="text-sm">Enabled</span>
            </label>
          </div>

          {watchRecurring && (
            <div className="grid gap-1.5">
              <Label>Recurring Split Kind <span className="text-destructive">*</span></Label>
              <Select
                value={form.getValues("recurringSplitKind") || ""}
                onValueChange={(v) => form.setValue("recurringSplitKind", (v ? String(v) : "") as RecurringSplitKind, { shouldValidate: true })}
              >
                <SelectTrigger><SelectValue placeholder="Select split kind" /></SelectTrigger>
                <SelectContent>
                  {RECURRING_SPLIT_KINDS.map((k) => (<SelectItem key={k} value={k}>{k.charAt(0).toUpperCase() + k.slice(1)}</SelectItem>))}
                </SelectContent>
              </Select>
              {form.formState.errors.recurringSplitKind && (
                <p className="text-xs text-destructive">{form.formState.errors.recurringSplitKind.message}</p>
              )}
            </div>
          )}
        </FormSection>
      ) : (
        <button
          type="button"
          onClick={() => setShowAllFields(true)}
          className="text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          + Show commercial &amp; legal fields
        </button>
      )}

      {/* ── Description & notes ──────────────────────────────────────── */}
      <FormSection title="Description & notes" defaultOpen={false}>
        <div className="grid gap-1.5">
          <Label htmlFor="description">Description</Label>
          <textarea
            id="description"
            className="min-h-[100px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-y placeholder:text-muted-foreground"
            placeholder="Notes about this opportunity"
            {...form.register("description")}
          />
        </div>

        {fieldDefinitions.length > 0 && (
          <CustomFieldsForm
            fieldDefinitions={fieldDefinitions}
            values={customFieldValues}
            onChange={(key, value) => setCustomFieldValues((prev) => ({ ...prev, [key]: value }))}
            errors={{}}
          />
        )}
      </FormSection>
    </RecordEditDialog>
  )
}
