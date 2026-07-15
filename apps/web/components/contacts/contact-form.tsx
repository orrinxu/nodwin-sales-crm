"use client"

import { useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Save, Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RecordEditDialog } from "@/components/forms/record-edit-dialog"
import { FormSection } from "@/components/forms/form-section"
import { EntityCombobox, type EntityOption } from "@/components/entity-combobox"

import type { ContactRecord, ContactCreateInput, AccountOption } from "@/lib/data/contacts"
import type { ContactPrefill } from "@/lib/data/contact-extraction-resolver"
import type { FieldDefinition } from "@/lib/data/field-definitions.types"
import { CustomFieldsForm } from "@/components/contacts/custom-fields-form"

const SOCIAL_PLATFORMS = ["linkedin", "twitter", "facebook", "instagram", "github", "other"]

const formSchema = z.object({
  fullName: z.string().min(1, "Full name is required").max(200),
  title: z.string().max(100).optional().or(z.literal("")),
  email: z.string().email("Must be a valid email").max(320).optional().or(z.literal("")),
  phone: z.string().max(50).optional().or(z.literal("")),
  primaryAccountId: z.string().optional().or(z.literal("")),
  notes: z.string().max(5000).optional().or(z.literal("")),
  // Rows may be left blank (the form seeds one empty row and onSubmit strips
  // incomplete ones); only require both fields when either is filled, so a
  // name-only contact isn't silently blocked by the default empty row.
  socials: z.array(
    z
      .object({
        platform: z.string(),
        url: z.string(),
      })
      .refine((s) => (s.platform.trim() === "") === (s.url.trim() === ""), {
        message: "Enter both a platform and a URL",
        path: ["url"],
      }),
  ),
  accountLinkIds: z.array(z.string()),
})

type FormData = z.infer<typeof formSchema>

interface ContactFormProps {
  contact?: ContactRecord
  accounts: AccountOption[]
  linkedAccountIds?: string[]
  fieldDefinitions?: FieldDefinition[]
  createAction: (input: ContactCreateInput) => Promise<ContactRecord>
  updateAction?: (id: string, input: Partial<ContactCreateInput>) => Promise<ContactRecord>
  onSuccess: () => void
  trigger?: React.ReactNode
  // ── Contact Generator (ORR-736) — all optional, additive ──
  /** AI-extracted values used to pre-fill a NEW contact. Ignored when editing. */
  prefill?: ContactPrefill
  /** Controlled open state (the generator drives the dialog after "analysing"). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Rendered at the top of the dialog body — the "AI-generated, review" banner. */
  banner?: React.ReactNode
  /**
   * Inline quick-create for the Primary Account picker (ORR-738). When present on
   * a NEW contact, the account field becomes a creatable combobox so a rep can
   * create an extracted-but-new account inline. Absent (or editing) → the plain
   * account picker.
   */
  createAccountQuickAction?: (input: { name: string }) => Promise<EntityOption>
}

export function ContactForm({
  contact,
  accounts,
  linkedAccountIds = [],
  fieldDefinitions = [],
  createAction,
  updateAction,
  onSuccess,
  trigger,
  prefill,
  open: controlledOpen,
  onOpenChange: onOpenChangeProp,
  banner,
  createAccountQuickAction,
}: ContactFormProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlledOpen = controlledOpen !== undefined
  const open = isControlledOpen ? controlledOpen : internalOpen
  const setOpen = (next: boolean) => {
    if (onOpenChangeProp) onOpenChangeProp(next)
    if (!isControlledOpen) setInternalOpen(next)
  }
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>(
    () => contact?.customData ?? {},
  )

  const isEditing = !!contact

  const initialSocials = contact?.socials
    ? Object.entries(contact.socials).map(([platform, url]) => ({ platform, url }))
    : []

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    // ORR-736: on a NEW contact, `prefill` (AI-extracted) seeds the fields. Owner
    // is never inferred (gate G5); primaryAccountId is set only when the extracted
    // account matched an existing one (account-first resolution).
    defaultValues: {
      fullName: contact?.fullName ?? prefill?.fullName ?? "",
      title: contact?.title ?? prefill?.title ?? "",
      email: contact?.email ?? prefill?.email ?? "",
      phone: contact?.phone ?? prefill?.phone ?? "",
      primaryAccountId: contact?.primaryAccountId ?? prefill?.primaryAccountId ?? "",
      notes: contact?.notes ?? prefill?.notes ?? "",
      socials: initialSocials.length > 0 ? initialSocials : [{ platform: "", url: "" }],
      accountLinkIds: linkedAccountIds,
    },
  })

  const watchedSocials = useWatch({ control: form.control, name: "socials" })
  const watchedAccountLinkIds = useWatch({ control: form.control, name: "accountLinkIds" })
  const watchedPrimaryAccountId = useWatch({ control: form.control, name: "primaryAccountId" })

  // ORR-738: on a NEW contact, offer inline account-create via a creatable
  // combobox (needs the quick-create action). Editing keeps the plain picker.
  const canCreateAccount = !isEditing && !!createAccountQuickAction
  const accountItems: EntityOption[] = accounts.map((a) => ({ id: a.id, name: a.name }))

  function addSocial() {
    form.setValue("socials", [...watchedSocials, { platform: "", url: "" }])
  }

  function removeSocial(index: number) {
    const updated = watchedSocials.filter((_, i) => i !== index)
    form.setValue("socials", updated.length > 0 ? updated : [{ platform: "", url: "" }])
  }

  function updateSocialField(index: number, field: "platform" | "url", value: string) {
    const updated = watchedSocials.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    form.setValue("socials", updated)
  }

  function addAccountLink(accountId: string) {
    if (accountId && !watchedAccountLinkIds.includes(accountId)) {
      form.setValue("accountLinkIds", [...watchedAccountLinkIds, accountId])
    }
  }

  function removeAccountLink(accountId: string) {
    form.setValue(
      "accountLinkIds",
      watchedAccountLinkIds.filter((id) => id !== accountId),
    )
  }

  async function onSubmit(data: FormData) {
    setPending(true)
    setError(null)
    try {
      const socialsMap: Record<string, string> = {}
      for (const s of data.socials) {
        if (s.platform && s.url) {
          socialsMap[s.platform] = s.url
        }
      }

      const input: ContactCreateInput = {
        fullName: data.fullName,
        title: data.title || null,
        email: data.email || null,
        phone: data.phone || null,
        primaryAccountId: data.primaryAccountId || null,
        notes: data.notes || null,
        accountLinkIds: data.accountLinkIds,
        customData: Object.keys(customFieldValues).length > 0 ? customFieldValues : undefined,
      }

      if (isEditing) {
        input.socials = socialsMap
      } else if (Object.keys(socialsMap).length > 0) {
        input.socials = socialsMap
      }

      if (isEditing && contact && updateAction) {
        await updateAction(contact.id, input)
      } else if (!isEditing) {
        await createAction(input)
      }

      setOpen(false)
      form.reset()
      setCustomFieldValues(contact?.customData ?? {})
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
      setCustomFieldValues(contact?.customData ?? {})
    }
  }

  return (
    <RecordEditDialog
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        // When the dialog is controlled (e.g. the AI generator owns the launcher
        // button), render no trigger of our own — otherwise the page shows two
        // "Create Contact" buttons.
        isControlledOpen
          ? undefined
          : ((trigger ?? (
              <Button>
                <Plus className="size-4" />
                Create Contact
              </Button>
            )) as React.ReactElement)
      }
      title={isEditing ? "Edit Contact" : "Create Contact"}
      description={
        isEditing
          ? "Update the contact details below."
          : "Fill in the details to create a new contact."
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
            {pending ? "Saving..." : isEditing ? "Save Changes" : "Create Contact"}
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

      {/* ── Contact details ──────────────────────────────────────────── */}
      <FormSection title="Contact details" collapsible={false}>
        <div className="col-span-full grid gap-1.5">
          <Label htmlFor="fullName">
            Full Name <span className="text-destructive">*</span>
          </Label>
          <Input id="fullName" {...form.register("fullName")} placeholder="Full name" />
          {form.formState.errors.fullName && (
            <p className="text-xs text-destructive">{form.formState.errors.fullName.message}</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="title">Title</Label>
          <Input id="title" {...form.register("title")} placeholder="Job title" />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...form.register("email")} placeholder="email@example.com" />
          {form.formState.errors.email && (
            <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" type="tel" {...form.register("phone")} placeholder="+1 (555) 000-0000" />
        </div>
      </FormSection>

      {/* ── Accounts ─────────────────────────────────────────────────── */}
      <FormSection title="Accounts" defaultOpen>
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="primaryAccountId">Primary Account</Label>
            {/* ORR-738: the creatable combobox has no "none" option; offer an
                explicit clear so a primary account can still be removed. */}
            {canCreateAccount && watchedPrimaryAccountId && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() =>
                  form.setValue("primaryAccountId", "", { shouldValidate: true })
                }
              >
                Clear
              </button>
            )}
          </div>
          {canCreateAccount ? (
            // ORR-738: inline account-create — a rep can create an
            // extracted-but-new account without leaving the contact form.
            <EntityCombobox
              items={accountItems}
              value={watchedPrimaryAccountId || null}
              onChange={(v) =>
                form.setValue("primaryAccountId", v ?? "", { shouldValidate: true })
              }
              onCreate={(name) => createAccountQuickAction!({ name })}
              placeholder="No primary account"
              searchPlaceholder="Search or create an account..."
            />
          ) : (
            <select
              id="primaryAccountId"
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              {...form.register("primaryAccountId")}
            >
              <option value="">No primary account</option>
              {accounts.map((acct) => (
                <option key={acct.id} value={acct.id}>{acct.name}</option>
              ))}
            </select>
          )}
        </div>

        <div className="col-span-full grid gap-1.5">
          <Label>Additional Account Links</Label>
          <div className="flex flex-wrap gap-2">
            {watchedAccountLinkIds.map((accountId) => {
              const acct = accounts.find((a) => a.id === accountId)
              return (
                <span
                  key={accountId}
                  className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-1 text-xs"
                >
                  {acct?.name ?? accountId}
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => removeAccountLink(accountId)}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )
            })}
          </div>
          <select
            className="mt-1 h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:max-w-xs"
            value=""
            onChange={(e) => addAccountLink(e.target.value)}
          >
            <option value="">Add account link...</option>
            {accounts
              .filter((a) => !watchedAccountLinkIds.includes(a.id) && a.id !== watchedPrimaryAccountId)
              .map((acct) => (
                <option key={acct.id} value={acct.id}>{acct.name}</option>
              ))}
          </select>
        </div>
      </FormSection>

      {/* ── Social profiles ──────────────────────────────────────────── */}
      <FormSection title="Social profiles" defaultOpen={false}>
        <div className="col-span-full grid gap-1.5">
          <div className="flex items-center justify-between">
            <Label>Profiles</Label>
            <button
              type="button"
              onClick={addSocial}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Plus className="size-3" />
              Add
            </button>
          </div>
          <div className="space-y-2">
            {watchedSocials.map((_, index) => (
              <div key={index} className="flex items-center gap-2">
                <select
                  className="h-8 w-28 rounded-lg border border-input bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  // eslint-disable-next-line security/detect-object-injection -- numeric index
                  value={watchedSocials[index].platform}
                  onChange={(e) => updateSocialField(index, "platform", e.target.value)}
                >
                  <option value="">Select</option>
                  {SOCIAL_PLATFORMS.map((p) => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
                <Input
                  placeholder="Profile URL"
                  className="flex-1"
                  // eslint-disable-next-line security/detect-object-injection -- numeric index
                  value={watchedSocials[index].url}
                  onChange={(e) => updateSocialField(index, "url", e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => removeSocial(index)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </FormSection>

      {/* ── Notes ────────────────────────────────────────────────────── */}
      <FormSection title="Notes & custom fields" defaultOpen={false}>
        {fieldDefinitions.length > 0 && (
          <div className="col-span-full">
            <CustomFieldsForm
              fieldDefinitions={fieldDefinitions}
              values={customFieldValues}
              onChange={(key, value) => setCustomFieldValues((prev) => ({ ...prev, [key]: value }))}
              errors={{}}
            />
          </div>
        )}

        <div className="col-span-full grid gap-1.5">
          <Label htmlFor="notes">Notes</Label>
          <textarea
            id="notes"
            className="min-h-[100px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-y placeholder:text-muted-foreground"
            placeholder="Notes about this contact"
            {...form.register("notes")}
          />
        </div>
      </FormSection>
    </RecordEditDialog>
  )
}
