import { notFound } from "next/navigation"
import { requireUser } from "@/lib/security/auth"
import { getContactById, getContactAccountLinks, getAccountOptions, getAccountOptionsByIds } from "@/lib/data/contacts"
import { getOwnerOptions } from "@/lib/data/accounts"
import { getFieldDefinitions } from "@/lib/data/field-definitions"
import { getActivitiesForContact } from "@/lib/data/activities"
import { updateContactAction, createContactActivityAction, searchAccountsAction } from "../actions"
import { ContactDetailWrapper } from "@/components/contacts/contact-detail-wrapper"

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireUser()
  const { id } = await params

  const ctx = { user, source: "web" as const }
  const [contact, accounts, links, fieldDefinitions, activities, owners] = await Promise.all([
    getContactById(ctx, id),
    getAccountOptions(ctx),
    getContactAccountLinks(ctx, id).catch(() => []),
    getFieldDefinitions(ctx, "contact"),
    getActivitiesForContact(ctx, id),
    getOwnerOptions(ctx),
  ])

  if (!contact) {
    notFound()
  }

  const linkedAccountIds = links.map((l) => l.accountId)
  const ownerName = owners.find((o) => o.id === contact.ownerUserId)?.name ?? null

  // ORR-767: resolve names for exactly this contact's primary + linked accounts
  // (a small set) rather than relying on the bounded `getAccountOptions` list,
  // so display/edit still names accounts that fall outside the bound.
  const referencedIds = [...linkedAccountIds]
  if (contact.primaryAccountId) referencedIds.push(contact.primaryAccountId)
  const referencedAccounts = await getAccountOptionsByIds(ctx, referencedIds)
  const accountNames: Record<string, string> = Object.fromEntries(
    referencedAccounts.map((a) => [a.id, a.name]),
  )

  return (
    <ContactDetailWrapper
      contact={contact}
      accounts={accounts}
      linkedAccountIds={linkedAccountIds}
      accountNames={accountNames}
      searchAccountsAction={searchAccountsAction}
      ownerName={ownerName}
      fieldDefinitions={fieldDefinitions}
      activities={activities}
      updateAction={updateContactAction}
      createActivityAction={createContactActivityAction}
    />
  )
}
