"use client"

import { useRouter } from "next/navigation"
import { Pencil } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ContactForm } from "@/components/contacts/contact-form"
import type { ContactRecord, ContactCreateInput, AccountOption } from "@/lib/data/contacts"
import type { FieldDefinition } from "@/lib/data/field-definitions.types"
import { CustomFieldsDisplay } from "@/components/contacts/custom-fields-display"

interface ContactDetailWrapperProps {
  contact: ContactRecord
  accounts: AccountOption[]
  linkedAccountIds: string[]
  fieldDefinitions: FieldDefinition[]
  updateAction: (id: string, input: Partial<ContactCreateInput>) => Promise<ContactRecord>
}

export function ContactDetailWrapper({
  contact,
  accounts,
  linkedAccountIds,
  fieldDefinitions,
  updateAction,
}: ContactDetailWrapperProps) {
  const router = useRouter()

  return (
    <div className="relative">
      <div className="absolute top-6 right-6 z-10">
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
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {contact.fullName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {contact.title ?? "Contact"}
            </p>
          </div>
        </div>
        <CustomFieldsDisplay
          fieldDefinitions={fieldDefinitions}
          customData={contact.customData}
        />
      </div>
    </div>
  )
}
