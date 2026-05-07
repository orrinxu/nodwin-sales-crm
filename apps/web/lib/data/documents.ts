import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"
import type { DocumentRecord, DocumentCategory } from "./documents.types"
import { DOCUMENT_CATEGORIES } from "./documents.types"

export type { DocumentRecord, DocumentCategory } from "./documents.types"
export { DOCUMENT_CATEGORIES, getCategoryLabel } from "./documents.types"

export interface DocumentCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export const documentCreateSchema = z.object({
  opportunityId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  name: z.string().min(1, "Name is required").max(300),
  category: z.enum(DOCUMENT_CATEGORIES),
  linkUrl: z
    .string()
    .url("Must be a valid URL")
    .refine(
      (val) => val.startsWith("http://") || val.startsWith("https://"),
      { message: "Only http/https URLs are allowed" },
    )
    .nullable()
    .optional(),
})

export type DocumentCreateInput = z.infer<typeof documentCreateSchema>

function toDomainDocument(data: Record<string, unknown>): DocumentRecord {
  const uploader = data.uploader as { full_name: string } | null
  return {
    id: data.id as string,
    opportunityId: (data.opportunity_id as string) ?? null,
    accountId: (data.account_id as string) ?? null,
    driveFileId: data.drive_file_id as string,
    driveFolderId: data.drive_folder_id as string,
    name: data.name as string,
    mimeType: data.mime_type as string,
    category: data.category as DocumentCategory,
    uploadedBy: data.uploaded_by as string,
    uploadedByName: uploader?.full_name ?? null,
    uploadedAt: data.uploaded_at as string,
    linkUrl: (data.link_url as string) ?? null,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

export async function getDocumentsForOpportunity(
  ctx: DocumentCallContext,
  opportunityId: string,
): Promise<DocumentRecord[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("documents")
    .select(
      `
      id,
      opportunity_id,
      account_id,
      drive_file_id,
      drive_folder_id,
      name,
      mime_type,
      category,
      uploaded_by,
      uploaded_at,
      link_url,
      created_at,
      updated_at,
      uploader:uploaded_by ( full_name )
    `,
    )
    .eq("opportunity_id", opportunityId)
    .order("uploaded_at", { ascending: false })

  if (error) {
    throw new Error(`Failed to load documents: ${error.message}`)
  }

  return (data ?? []).map((r) => toDomainDocument(r as Record<string, unknown>))
}

export async function createDocument(
  ctx: DocumentCallContext,
  input: DocumentCreateInput,
): Promise<DocumentRecord> {
  const parsed = documentCreateSchema.parse(input)
  const supabase = await createServerClient()

  const dbData: Record<string, unknown> = {
    opportunity_id: parsed.opportunityId ?? null,
    account_id: parsed.accountId ?? null,
    name: parsed.name,
    mime_type: "application/octet-stream",
    category: parsed.category,
    uploaded_by: ctx.user.id,
    link_url: parsed.linkUrl ?? null,
    drive_file_id: parsed.linkUrl ?? `placeholder-${crypto.randomUUID()}`,
    drive_folder_id: `placeholder-${parsed.opportunityId ?? "account"}`,
  }

  const { data, error } = await supabase
    .from("documents")
    .insert(dbData)
    .select(
      `
      id,
      opportunity_id,
      account_id,
      drive_file_id,
      drive_folder_id,
      name,
      mime_type,
      category,
      uploaded_by,
      uploaded_at,
      link_url,
      created_at,
      updated_at,
      uploader:uploaded_by ( full_name )
    `,
    )
    .single()

  if (error) {
    throw new Error(`Failed to create document: ${error.message}`)
  }

  return toDomainDocument(data as Record<string, unknown>)
}
