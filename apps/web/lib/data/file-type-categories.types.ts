import "server-only"
import { z } from "zod"
import type { AuthenticatedUser } from "@/lib/security/auth"

export interface FileTypeCategory {
  code: string
  label: string
  description: string | null
  active: boolean
  displayOrder: number
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

export interface FileTypeCategoryCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export const createFileTypeCategorySchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(
      /^[a-z][a-z0-9_]*$/,
      "Code must start with a letter and contain only lowercase letters, numbers, and underscores",
    ),
  label: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullish(),
  displayOrder: z.number().int().nonnegative().default(0),
})

export type CreateFileTypeCategoryInput = z.infer<
  typeof createFileTypeCategorySchema
>

export const updateFileTypeCategorySchema = z.object({
  code: z.string().trim().min(1).max(50),
  label: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).nullish(),
  active: z.boolean().optional(),
  displayOrder: z.number().int().nonnegative().optional(),
})

export type UpdateFileTypeCategoryInput = z.infer<
  typeof updateFileTypeCategorySchema
>

export const reorderFileTypeCategoriesSchema = z.object({
  codes: z.array(z.string().trim().min(1).max(50)),
})

export type ReorderFileTypeCategoriesInput = z.infer<
  typeof reorderFileTypeCategoriesSchema
>
