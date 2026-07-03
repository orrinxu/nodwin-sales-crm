import { notFound } from "next/navigation"
import { requireUser } from "@/lib/security/auth"
import { getContactById, getContactAccountLinks, getAccountOptions } from "@/lib/data/contacts"
import { getOwnerOptions } from "@/lib/data/accounts"
import { getFieldDefinitions } from "@/lib/data/field-definitions"
import { getActivitiesForContact } from "@/lib/data/activities"
import { updateContactAction, createContactActivityAction } from "../actions"
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

  return (
    <ContactDetailWrapper
      contact={contact}
      accounts={accounts}
      linkedAccountIds={linkedAccountIds}
      ownerName={ownerName}
      fieldDefinitions={fieldDefinitions}
      activities={activities}
      updateAction={updateContactAction}
      createActivityAction={createContactActivityAction}
    />
  )
}
