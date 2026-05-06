"use server"

import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/security/auth"
import { updateProfile, profileUpdateSchema } from "@/lib/data/users"

export async function updateProfileName(formData: FormData) {
  const user = await requireUser()

  const raw = formData.get("fullName")
  const parsed = profileUpdateSchema.shape.fullName.safeParse(raw || null)

  if (!parsed.success) {
    throw new Error(parsed.error.errors[0].message)
  }

  await updateProfile({ user, source: "web" }, { fullName: parsed.data })
  revalidatePath("/settings/profile")
}

export async function updateNotificationPreferences(formData: FormData) {
  const user = await requireUser()

  const emailNotifications = formData.get("emailNotifications") === "on"
  const weeklyDigest = formData.get("weeklyDigest") === "on"

  const parsed = profileUpdateSchema.shape.notificationPreferences.safeParse({
    emailNotifications,
    weeklyDigest,
  })

  if (!parsed.success) {
    throw new Error(parsed.error.errors[0].message)
  }

  await updateProfile(
    { user, source: "web" },
    { notificationPreferences: parsed.data },
  )

  revalidatePath("/settings/profile")
}
