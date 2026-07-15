"use client"

import { AccountForm } from "@/components/accounts/account-form"
import {
  RecordGenerator,
  type ImagePayload,
  type ExtractFileResult,
  type TranscribeAudioResult,
} from "@/components/generators/record-generator"
import type { GenerateAccountResult } from "@/app/(crm)/accounts/generate-actions"
import type { AccountPrefill } from "@/lib/data/account-extraction-resolver"

// Account Generator (ORR-735). Thin wrapper: the shared RecordGenerator drives the
// chooser → note → analyse → review flow, then renders the existing AccountForm
// pre-filled + banner. Commit runs the form's normal createAction — no file or
// provenance side effects (accounts store neither).

type FormProps = React.ComponentProps<typeof AccountForm>

type Props = Omit<FormProps, "open" | "onOpenChange" | "prefill" | "banner" | "trigger"> & {
  generateAction: (input: { text?: string; images?: ImagePayload[] }) => Promise<GenerateAccountResult>
  extractFileAction?: (formData: FormData) => Promise<ExtractFileResult>
  transcribeAction?: (formData: FormData) => Promise<TranscribeAudioResult>
}

const ACCOUNT_FIELD_LABELS: Record<string, string> = {
  name: "Name",
  legalName: "Legal name",
  website: "Website",
  country: "Country",
  industry: "Industry",
  description: "Description",
}

export function AccountGenerator({ generateAction, extractFileAction, transcribeAction, ...formProps }: Props) {
  return (
    <RecordGenerator<AccountPrefill, GenerateAccountResult>
      entityLabel="account"
      createLabel="Create Account"
      generateAction={generateAction}
      extractFileAction={extractFileAction}
      transcribeAction={transcribeAction}
      fieldLabels={ACCOUNT_FIELD_LABELS}
      renderForm={({ formKey, open, onOpenChange, result, banner }) => (
        <AccountForm
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
