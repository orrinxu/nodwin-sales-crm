"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import { getEmailTransport, upsertEmailTransport } from "@/lib/data/email-transport"
import { sendTestEmail } from "@/lib/notifications/delivery"
import { z } from "zod"

export async function getEmailTransportAction() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  return getEmailTransport(ctx)
}

export async function saveEmailTransportAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await upsertEmailTransport(ctx, input as never)
  revalidatePath("/admin/email")
}

export async function sendTestEmailAction(toEmail: string) {
  const user = await requireUser()
  requireRole(user, "admin")
  const email = z.string().email().parse(toEmail)
  await sendTestEmail(email)
}
