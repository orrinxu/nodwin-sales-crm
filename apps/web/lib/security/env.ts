import { z } from "zod"

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  POSTMARK_WEBHOOK_SECRET: z.string().min(1),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("Nodwin CRM"),
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_DEBUG: z.coerce.boolean().default(false),
  NEXT_PUBLIC_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
})

export const env = schema.parse(process.env)
