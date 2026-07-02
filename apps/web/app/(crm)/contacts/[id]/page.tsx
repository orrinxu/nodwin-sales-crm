import { notFound } from "next/navigation"
import { requireUser } from "@/lib/security/auth"
import { getContactById, getContactAccountLinks, getAccountOptions } from "@/lib/data/contacts"
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
  const [contact, accounts, links, fieldDefinitions, activities] = await Promise.all([
    getContactById(ctx, id),
    getAccountOptions(ctx),
    getContactAccountLinks(ctx, id).catch(() => []),
    getFieldDefinitions(ctx, "contact"),
    getActivitiesForContact(ctx, id),
  ])

  if (!contact) {
    notFound()
  }

  const linkedAccountIds = links.map((l) => l.accountId)

  return (
    <ContactDetailWrapper
      contact={contact}
      accounts={accounts}
      linkedAccountIds={linkedAccountIds}
      fieldDefinitions={fieldDefinitions}
      activities={activities}
      canManage={user.role === "admin"}
      updateAction={updateContactAction}
      createActivityAction={createContactActivityAction}
    />
  )
}
