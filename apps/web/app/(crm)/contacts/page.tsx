import { requireUser } from "@/lib/security/auth"
import { getAccountOptions } from "@/lib/data/contacts"
import { createContactAction, bulkImportContactsAction } from "./actions"
import { ContactsList } from "@/components/contacts/contacts-list"

export default async function ContactsPage() {
  const user = await requireUser()

  const ctx = { user, source: "web" as const }
  const accounts = await getAccountOptions(ctx)

  return (
    <ContactsList
      accounts={accounts}
      createAction={createContactAction}
      bulkImportAction={bulkImportContactsAction}
    />
  )
}
