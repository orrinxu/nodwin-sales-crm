import { requireUser } from "@/lib/security/auth"
import { getAccountOptions, getContacts } from "@/lib/data/contacts"
import { isTranscriptionAvailable } from "@/lib/data/ai-settings"
import { createContactAction, bulkDeleteContactsAction, createAccountQuickAction } from "./actions"
import { generateContactAction } from "./generate-actions"
import { extractDocumentTextAction, transcribeAudioAction } from "@/app/(crm)/opportunities/generate-actions"
import { ContactsList } from "@/components/contacts/contacts-list"

export default async function ContactsPage() {
  const user = await requireUser()

  const ctx = { user, source: "web" as const }
  const [accounts, { contacts }, voiceEnabled] = await Promise.all([
    getAccountOptions(ctx),
    getContacts(ctx),
    isTranscriptionAvailable(),
  ])

  return (
    <ContactsList
      accounts={accounts}
      contacts={contacts}
      createAction={createContactAction}
      bulkDeleteAction={bulkDeleteContactsAction}
      generateAction={generateContactAction}
      extractFileAction={extractDocumentTextAction}
      transcribeAction={voiceEnabled ? transcribeAudioAction : undefined}
      createAccountQuickAction={createAccountQuickAction}
    />
  )
}
