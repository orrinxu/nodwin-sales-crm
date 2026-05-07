"use client"

import { Users } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { ContactForm } from "@/components/contacts/contact-form"
import { BulkImportSheet } from "@/components/contacts/bulk-import-sheet"
import type { AccountOption } from "@/lib/data/contacts"
import type { ContactCreateInput, ContactRecord, BulkImportResult } from "@/lib/data/contacts"

interface ContactsListProps {
  accounts: AccountOption[]
  createAction: (input: ContactCreateInput) => Promise<ContactRecord>
  bulkImportAction: (rows: ContactCreateInput[]) => Promise<BulkImportResult>
}

export function ContactsList({ accounts, createAction, bulkImportAction }: ContactsListProps) {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your contacts and address book.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <BulkImportSheet onImport={bulkImportAction} />
          <ContactForm
            accounts={accounts}
            createAction={createAction}
            onSuccess={() => {}}
          />
        </div>
      </div>

      <Card className="flex flex-1 items-center justify-center">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Users className="size-10 text-muted-foreground" />
          <div>
            <h2 className="text-base font-medium">No contacts yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Contacts will appear here once they are created.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
