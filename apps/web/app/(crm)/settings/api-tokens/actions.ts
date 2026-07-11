"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireUser } from "@/lib/security/auth"
import { createApiToken, revokeApiToken, type ApiTokenRecord } from "@/lib/data/api-tokens"

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  expiresInDays: z.number().int().positive().max(3650).nullish(),
})

/** Generate a token for the caller. Returns the plaintext ONCE (never stored). */
export async function createApiTokenAction(
  input: unknown,
): Promise<{ token: string; record: ApiTokenRecord }> {
  const user = await requireUser()
  const parsed = createSchema.parse(input)
  const result = await createApiToken(
    { user, source: "web" },
    { name: parsed.name, expiresInDays: parsed.expiresInDays ?? null },
  )
  revalidatePath("/settings/api-tokens")
  return result
}

export async function revokeApiTokenAction(id: string): Promise<void> {
  const user = await requireUser()
  await revokeApiToken({ user, source: "web" }, z.string().uuid().parse(id))
  revalidatePath("/settings/api-tokens")
}
