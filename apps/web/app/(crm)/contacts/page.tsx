import { requireUser } from "@/lib/security/auth"
import { getAccountOptions, getContactList, CONTACT_STATUSES } from "@/lib/data/contacts"
import type { ContactListFilters } from "@/lib/data/contacts"
import { createContactAction } from "./actions"
import { ContactsList } from "@/components/contacts/contacts-list"

export default async function ContactsPage(props: {
  searchParams?: Promise<{ status?: string }>
}) {
  const user = await requireUser()

  const ctx = { user, source: "web" as const }
  const accounts = await getAccountOptions(ctx)

  const searchParams = await props.searchParams
  const filters: ContactListFilters = {}
  if (searchParams?.status && (CONTACT_STATUSES as readonly string[]).includes(searchParams.status)) {
    filters.status = searchParams.status as ContactListFilters["status"]
  }

  const contacts = await getContactList(ctx, filters)

  return (
    <ContactsList
      accounts={accounts}
      contacts={contacts}
      createAction={createContactAction}
    />
  )
}
