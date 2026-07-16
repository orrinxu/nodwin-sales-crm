"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import {
  createProduct,
  productCreateSchema,
  updateProduct,
  productUpdateSchema,
  deactivateProduct,
} from "@/lib/data/products"

export async function createProductAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = productCreateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const product = await createProduct(ctx, parsed)
  revalidatePath("/admin/products")
  return product
}

export async function updateProductAction(id: string, input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = productUpdateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const product = await updateProduct(ctx, id, parsed)
  revalidatePath("/admin/products")
  return product
}

export async function deactivateProductAction(id: string) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await deactivateProduct(ctx, id)
  revalidatePath("/admin/products")
}
