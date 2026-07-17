import { requireUser } from "@/lib/security/auth"
import { getAccountOptions, getContacts } from "@/lib/data/contacts"
import { getOwnerOptions } from "@/lib/data/accounts"
import { isTranscriptionAvailable } from "@/lib/data/ai-settings"
import { DEFAULT_PAGE_SIZE, clampPage } from "@/lib/list/pagination"
import { createContactAction, bulkDeleteContactsAction, createAccountQuickAction } from "./actions"
import { generateContactAction } from "./generate-actions"
import { extractDocumentTextAction, transcribeAudioAction } from "@/app/(crm)/opportunities/generate-actions"
import { ContactsList } from "@/components/contacts/contacts-list"

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    account?: string
    owner?: string
    page?: string
  }>
}) {
  const sp = await searchParams
  const user = await requireUser()
  const ctx = { user, source: "web" as const }

  // Owner options are fetched server-side (all users), not derived from the
  // loaded page — under pagination a page-derived list would only show the
  // owners on the current page.
  const [accounts, listResult, owners, voiceEnabled] = await Promise.all([
    getAccountOptions(ctx),
    getContacts(ctx, {
      query: sp.q,
      accountId: sp.account,
      ownerId: sp.owner,
      page: clampPage(sp.page ? Number(sp.page) : 1),
      pageSize: DEFAULT_PAGE_SIZE,
    }),
    getOwnerOptions(ctx),
    isTranscriptionAvailable(),
  ])

  return (
    <ContactsList
      accounts={accounts}
      contacts={listResult.contacts}
      totalCount={listResult.totalCount}
      page={listResult.page}
      pageSize={listResult.pageSize}
      ownerOptions={owners.map((o) => ({ id: o.id, name: o.name }))}
      createAction={createContactAction}
      bulkDeleteAction={bulkDeleteContactsAction}
      generateAction={generateContactAction}
      extractFileAction={extractDocumentTextAction}
      transcribeAction={voiceEnabled ? transcribeAudioAction : undefined}
      createAccountQuickAction={createAccountQuickAction}
    />
  )
}
