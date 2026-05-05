import { z } from "zod"

const booleanFromString = z
  .union([z.boolean(), z.string()])
  .transform((val: boolean | string) => {
    if (typeof val === "boolean") return val
    return val === "true" || val === "1"
  })

export const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  POSTMARK_WEBHOOK_SECRET: z.string().min(1),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("Nodwin CRM"),
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_DEBUG: booleanFromString.default(false),
  NEXT_PUBLIC_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
})

export type Env = z.infer<typeof envSchema>
