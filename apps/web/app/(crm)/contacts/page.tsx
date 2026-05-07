import { getAccountOptions } from "@/lib/data/contacts"
import { createContactAction, bulkImportContactsAction } from "./actions"
import { ContactsList } from "@/components/contacts/contacts-list"

export default async function ContactsPage() {
  const accounts = await getAccountOptions()

  return (
    <ContactsList
      accounts={accounts}
      createAction={createContactAction}
      bulkImportAction={bulkImportContactsAction}
    />
  )
}
