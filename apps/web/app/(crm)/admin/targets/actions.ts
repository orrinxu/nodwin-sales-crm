"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import { setTargetsForQuarter, setTargetsSchema } from "@/lib/data/sales-targets"

export async function saveTargetsAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = setTargetsSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await setTargetsForQuarter(ctx, parsed)
  revalidatePath("/admin/targets")
}
