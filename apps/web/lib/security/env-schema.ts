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
  RESEND_API_KEY: z.string().optional(),
  RESEND_DOMAIN: z.string().optional(),
  SLACK_BOT_TOKEN: z.string().optional(),
  // ORR-620 document ingestion. All optional so the app boots with the seam
  // unwired — point EMBEDDINGS_* at a llama.cpp (OpenAI-compatible) server to
  // enable embedding. INGESTION_CRON_SECRET gates the worker drain route.
  EMBEDDINGS_BASE_URL: z.string().url().optional(),
  EMBEDDINGS_MODEL: z.string().optional(),
  EMBEDDINGS_API_KEY: z.string().optional(),
  INGESTION_CRON_SECRET: z.string().optional(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("Nodwin CRM"),
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_DEBUG: booleanFromString.default(false),
  NEXT_PUBLIC_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  NEXT_PUBLIC_ENV: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>
