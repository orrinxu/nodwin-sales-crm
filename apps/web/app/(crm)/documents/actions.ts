"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireUser } from "@/lib/security/auth"
import type { AuthenticatedUser } from "@/lib/security/auth"
import {
  createStoredDocument,
  createDocumentDownloadUrl,
  deleteStoredDocument,
  updateDocumentCategory,
  documentUploadSchema,
  documentCategorySchema,
} from "@/lib/data/documents"

// The data layer only reads ctx.user.id; coerce the optional email/role to
// strings so the DocumentCallContext shape is satisfied.
function webCtx(user: AuthenticatedUser) {
  return {
    user: { id: user.id, email: user.email ?? "", role: user.role ?? "" },
    source: "web" as const,
  }
}

const entityRef = z.object({
  opportunityId: z.string().uuid().nullish(),
  accountId: z.string().uuid().nullish(),
})

function revalidateEntity(ref: z.infer<typeof entityRef>) {
  if (ref.opportunityId) revalidatePath(`/opportunities/${ref.opportunityId}`)
  if (ref.accountId) revalidatePath(`/accounts/${ref.accountId}`)
}

/** Step 1 of upload: create the row + return a signed upload URL for the bytes. */
export async function createDocumentUploadAction(input: unknown) {
  const user = await requireUser()
  const parsed = documentUploadSchema.parse(input)
  const handle = await createStoredDocument(webCtx(user), parsed)
  return {
    documentId: handle.id,
    bucket: handle.bucket,
    path: handle.storagePath,
    token: handle.uploadToken,
    signedUrl: handle.signedUrl,
  }
}

/** Step 2 of upload: refresh the entity page once the bytes have landed. */
export async function finalizeDocumentUploadAction(input: unknown) {
  await requireUser()
  const ref = entityRef.parse(input)
  revalidateEntity(ref)
}

/** Mint a short-lived signed download URL (RLS-checked). */
export async function getDocumentDownloadUrlAction(documentId: string) {
  const user = await requireUser()
  const id = z.string().uuid().parse(documentId)
  const res = await createDocumentDownloadUrl(webCtx(user), id)
  if (!res) throw new Error("Document not found or not accessible.")
  return res
}

export async function deleteDocumentAction(input: unknown) {
  const user = await requireUser()
  const parsed = entityRef.extend({ documentId: z.string().uuid() }).parse(input)
  await deleteStoredDocument(webCtx(user), parsed.documentId)
  revalidateEntity(parsed)
}

export async function updateDocumentCategoryAction(input: unknown) {
  const user = await requireUser()
  const parsed = entityRef
    .extend({ documentId: z.string().uuid(), category: documentCategorySchema })
    .parse(input)
  await updateDocumentCategory(webCtx(user), parsed.documentId, parsed.category)
  revalidateEntity(parsed)
}
