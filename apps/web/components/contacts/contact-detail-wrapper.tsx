"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Pencil, Mail, Phone } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { OwnerLink } from "@/components/people/owner-link"
import { ContactForm } from "@/components/contacts/contact-form"
import type { ContactRecord, ContactCreateInput, AccountOption } from "@/lib/data/contacts"
import type { FieldDefinition } from "@/lib/data/field-definitions.types"
import type { ActivityRecord } from "@/lib/data/activities"
import { CustomFieldsDisplay } from "@/components/contacts/custom-fields-display"
import { ActivityComposer } from "@/components/opportunities/activity-composer"
import { ActivityTimeline } from "@/components/opportunities/activity-timeline"

interface ContactDetailWrapperProps {
  contact: ContactRecord
  accounts: AccountOption[]
  linkedAccountIds: string[]
  ownerName?: string | null
  fieldDefinitions: FieldDefinition[]
  activities: ActivityRecord[]
  updateAction: (id: string, input: Partial<ContactCreateInput>) => Promise<ContactRecord>
  createActivityAction: (contactId: string, input: unknown) => Promise<ActivityRecord>
}

const SOCIAL_LABELS: Record<string, string> = {
  wechat: "WeChat",
  linkedin: "LinkedIn",
  twitter: "Twitter",
  x: "X",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  )
}

export function ContactDetailWrapper({
  contact,
  accounts,
  linkedAccountIds,
  ownerName,
  fieldDefinitions,
  activities,
  updateAction,
  createActivityAction,
}: ContactDetailWrapperProps) {
  const router = useRouter()

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? id
  const primaryAccount = contact.primaryAccountId
    ? accounts.find((a) => a.id === contact.primaryAccountId) ?? null
    : null
  // Additional account links, excluding the primary (shown separately).
  const otherLinkedAccountIds = linkedAccountIds.filter(
    (id) => id !== contact.primaryAccountId,
  )
  const socialEntries = Object.entries(contact.socials).filter(([, v]) => v)

  return (
    <div>
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">
              {contact.fullName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {contact.title ?? "Contact"}
            </p>
          </div>
          <div className="shrink-0">
            <ContactForm
              contact={contact}
              accounts={accounts}
              linkedAccountIds={linkedAccountIds}
              fieldDefinitions={fieldDefinitions}
              createAction={async () => { throw new Error("Not available") }}
              updateAction={updateAction}
              onSuccess={() => {
                router.refresh()
              }}
              trigger={
                <Button variant="outline" size="sm">
                  <Pencil className="size-4" />
                  Edit
                </Button>
              }
            />
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-4">
              <Field
                label="Email"
                value={
                  contact.email ? (
                    <a
                      href={`mailto:${contact.email}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Mail className="size-3" />
                      {contact.email}
                    </a>
                  ) : (
                    "—"
                  )
                }
              />
              <Field
                label="Phone"
                value={
                  contact.phone ? (
                    <a
                      href={`tel:${contact.phone}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Phone className="size-3" />
                      {contact.phone}
                    </a>
                  ) : (
                    "—"
                  )
                }
              />
              <Field label="Title" value={contact.title ?? "—"} />
              <Field
                label="Primary Account"
                value={
                  primaryAccount ? (
                    <Link
                      href={`/accounts/${primaryAccount.id}`}
                      className="text-primary hover:underline"
                    >
                      {primaryAccount.name}
                    </Link>
                  ) : (
                    "—"
                  )
                }
              />
              <Field
                label="Owner"
                value={<OwnerLink userId={contact.ownerUserId} name={ownerName} />}
              />
            </dl>

            {otherLinkedAccountIds.length > 0 && (
              <div className="grid gap-1">
                <dt className="text-xs text-muted-foreground">Also linked to</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {otherLinkedAccountIds.map((id) => (
                    <Link key={id} href={`/accounts/${id}`}>
                      <Badge variant="outline" className="hover:bg-accent">
                        {accountName(id)}
                      </Badge>
                    </Link>
                  ))}
                </dd>
              </div>
            )}

            {socialEntries.length > 0 && (
              <div className="grid gap-1">
                <dt className="text-xs text-muted-foreground">Social</dt>
                <dd className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {socialEntries.map(([key, value]) => (
                    <span key={key}>
                      <span className="text-muted-foreground">
                        {/* eslint-disable-next-line security/detect-object-injection -- static label map, key falls back to itself */}
                        {SOCIAL_LABELS[key.toLowerCase()] ?? key}:
                      </span>{" "}
                      {value}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </CardContent>
        </Card>

        <CustomFieldsDisplay
          fieldDefinitions={fieldDefinitions}
          customData={contact.customData}
        />
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ActivityComposer
              revalidateId={contact.id}
              scope={{ contactId: contact.id, accountId: contact.primaryAccountId }}
              createAction={createActivityAction}
              onCreated={() => router.refresh()}
              notesOnly
            />
            <ActivityTimeline activities={activities} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
