"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Pencil, Mail, Phone } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { OwnerLink } from "@/components/people/owner-link"
import { ContactForm } from "@/components/contacts/contact-form"
import { CustomFieldsDisplay } from "@/components/contacts/custom-fields-display"
import { ActivityComposer } from "@/components/opportunities/activity-composer"
import { ActivityTimeline } from "@/components/opportunities/activity-timeline"
import { FacetTabs, FacetTabsList, FacetTabsTab, FacetTabsPanel } from "@/components/primitives/facet-tabs"
import { RecordHeader } from "@/components/primitives/record-header"
import { DefinitionField, DefinitionFieldGrid } from "@/components/primitives/definition-grid"
import type { ContactRecord, ContactCreateInput, AccountOption } from "@/lib/data/contacts"
import type { FieldDefinition } from "@/lib/data/field-definitions.types"
import type { ActivityRecord } from "@/lib/data/activities"

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

const CARD_HEADING = "text-[13.5px] font-semibold tracking-[-0.01em]"

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
  const [tab, setTab] = useState("details")

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? id
  const primaryAccount = contact.primaryAccountId
    ? accounts.find((a) => a.id === contact.primaryAccountId) ?? null
    : null
  const otherLinkedAccountIds = linkedAccountIds.filter((id) => id !== contact.primaryAccountId)
  const socialEntries = Object.entries(contact.socials).filter(([, v]) => v)

  const emailEl = contact.email ? (
    <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1 text-primary hover:underline">
      <Mail className="size-3" />
      {contact.email}
    </a>
  ) : undefined

  const phoneEl = contact.phone ? (
    <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1 text-primary hover:underline">
      <Phone className="size-3" />
      {contact.phone}
    </a>
  ) : undefined

  const primaryAccountEl = primaryAccount ? (
    <Link href={`/accounts/${primaryAccount.id}`} className="text-primary hover:underline">
      {primaryAccount.name}
    </Link>
  ) : undefined

  const ownerEl = <OwnerLink userId={contact.ownerUserId} name={ownerName} />

  const dash = <span className="text-muted-foreground">—</span>

  const editButton = (
    <ContactForm
      contact={contact}
      accounts={accounts}
      linkedAccountIds={linkedAccountIds}
      fieldDefinitions={fieldDefinitions}
      createAction={async () => {
        throw new Error("Not available")
      }}
      updateAction={updateAction}
      onSuccess={() => router.refresh()}
      trigger={
        <Button variant="outline" size="sm">
          <Pencil className="size-4" />
          Edit
        </Button>
      }
    />
  )

  return (
    <div className="relative flex flex-col gap-4 p-6">
      <RecordHeader
        title={contact.fullName}
        subtitle={contact.title ?? "Contact"}
        actions={editButton}
        stats={[
          { label: "Email", value: emailEl ?? dash },
          { label: "Phone", value: phoneEl ?? dash },
          { label: "Primary account", value: primaryAccountEl ?? dash },
          { label: "Owner", value: ownerEl },
        ]}
      />

      <FacetTabs value={tab} onValueChange={(v) => setTab(v as string)}>
        <FacetTabsList>
          <FacetTabsTab value="details">Details</FacetTabsTab>
          <FacetTabsTab value="activity">Activity</FacetTabsTab>
        </FacetTabsList>

        {/* DETAILS */}
        <FacetTabsPanel value="details" className="space-y-4">
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className={CARD_HEADING}>Contact details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <DefinitionFieldGrid>
                <DefinitionField label="Email" emptyMode="dash">{emailEl}</DefinitionField>
                <DefinitionField label="Phone" emptyMode="dash">{phoneEl}</DefinitionField>
                <DefinitionField label="Title" value={contact.title} emptyMode="dash" />
                <DefinitionField label="Primary account" emptyMode="dash">{primaryAccountEl}</DefinitionField>
                <DefinitionField label="Owner">{ownerEl}</DefinitionField>
              </DefinitionFieldGrid>

              {otherLinkedAccountIds.length > 0 && (
                <div className="grid gap-1">
                  <dt className="text-[11.5px] font-medium text-muted-foreground">Also linked to</dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {otherLinkedAccountIds.map((id) => (
                      <Link key={id} href={`/accounts/${id}`}>
                        <Badge variant="outline" className="hover:bg-accent">{accountName(id)}</Badge>
                      </Link>
                    ))}
                  </dd>
                </div>
              )}

              {socialEntries.length > 0 && (
                <div className="grid gap-1">
                  <dt className="text-[11.5px] font-medium text-muted-foreground">Social</dt>
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

          <CustomFieldsDisplay fieldDefinitions={fieldDefinitions} customData={contact.customData} />
        </FacetTabsPanel>

        {/* ACTIVITY */}
        <FacetTabsPanel value="activity">
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className={CARD_HEADING}>Notes</CardTitle>
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
        </FacetTabsPanel>
      </FacetTabs>
    </div>
  )
}
