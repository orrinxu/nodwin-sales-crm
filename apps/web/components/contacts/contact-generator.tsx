"use client"

import { ContactForm } from "@/components/contacts/contact-form"
import {
  RecordGenerator,
  type ImagePayload,
  type ExtractFileResult,
  type TranscribeAudioResult,
} from "@/components/generators/record-generator"
import { useAutoOpenCreate } from "@/components/generators/use-auto-open-create"
import type { GenerateContactResult } from "@/app/(crm)/contacts/generate-actions"
import type { ContactPrefill } from "@/lib/data/contact-extraction-resolver"

// Contact Generator (ORR-736, Track A of ORR-732). Thin wrapper: the shared
// RecordGenerator drives the chooser → note → analyse → review flow, then renders
// the existing ContactForm pre-filled + banner. Commit runs the form's normal
// createAction — no parallel write path. The account is resolved account-first: when
// the extracted account matched an existing one, primaryAccountId is pre-selected;
// otherwise it's left blank (the review note flags a new account) and the user
// picks one — or creates it inline via the creatable account combobox (ORR-738).

type FormProps = React.ComponentProps<typeof ContactForm>

type Props = Omit<FormProps, "open" | "onOpenChange" | "prefill" | "banner" | "trigger"> & {
  generateAction: (input: { text?: string; images?: ImagePayload[] }) => Promise<GenerateContactResult>
  extractFileAction?: (formData: FormData) => Promise<ExtractFileResult>
  transcribeAction?: (formData: FormData) => Promise<TranscribeAudioResult>
}

// Keyed by resolver field keys (note: the account field is `account`, not
// `primaryAccountId`, because the resolver reports the extracted account name).
const CONTACT_FIELD_LABELS: Record<string, string> = {
  fullName: "Full name",
  account: "Account",
  email: "Email",
  phone: "Phone",
  title: "Title",
  notes: "Notes",
}

export function ContactGenerator({ generateAction, extractFileAction, transcribeAction, ...formProps }: Props) {
  const autoOpen = useAutoOpenCreate()
  return (
    <RecordGenerator<ContactPrefill, GenerateContactResult>
      entityLabel="contact"
      createLabel="Create Contact"
      generateAction={generateAction}
      extractFileAction={extractFileAction}
      transcribeAction={transcribeAction}
      autoOpen={autoOpen}
      fieldLabels={CONTACT_FIELD_LABELS}
      renderForm={({ formKey, open, onOpenChange, result, banner }) => (
        <ContactForm
          key={formKey}
          {...formProps}
          open={open}
          onOpenChange={onOpenChange}
          prefill={result?.prefill}
          banner={banner}
        />
      )}
    />
  )
}
