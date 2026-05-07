"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import {
  createFieldDefinition,
  createFieldDefinitionSchema,
} from "@/lib/data/field-definitions"

export async function createFieldDefinitionAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = createFieldDefinitionSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await createFieldDefinition(ctx, parsed)
  revalidatePath("/admin/field-definitions")
}
