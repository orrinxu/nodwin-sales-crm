import { requireUser } from "@/lib/security/auth"
import { getAccountOptions, getContacts } from "@/lib/data/contacts"
import { createContactAction, bulkDeleteContactsAction, createAccountQuickAction } from "./actions"
import { generateContactAction } from "./generate-actions"
import { extractDocumentTextAction } from "@/app/(crm)/opportunities/generate-actions"
import { ContactsList } from "@/components/contacts/contacts-list"

export default async function ContactsPage() {
  const user = await requireUser()

  const ctx = { user, source: "web" as const }
  const [accounts, { contacts }] = await Promise.all([
    getAccountOptions(ctx),
    getContacts(ctx),
  ])

  return (
    <ContactsList
      accounts={accounts}
      contacts={contacts}
      createAction={createContactAction}
      bulkDeleteAction={bulkDeleteContactsAction}
      generateAction={generateContactAction}
      extractFileAction={extractDocumentTextAction}
      createAccountQuickAction={createAccountQuickAction}
    />
  )
}
