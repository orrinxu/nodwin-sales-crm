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
  // Self-host Supabase JWT secret (GoTrue's JWT_SECRET). Used to mint a
  // short-lived per-user JWT for REST-API-token callers so Postgres RLS applies.
  // Optional so the app boots without it — the token API 503s until it is set.
  // MUST be rotated off the quick-start default before production.
  SUPABASE_JWT_SECRET: z.string().optional(),
  POSTMARK_WEBHOOK_SECRET: z.string().min(1),
  // ORR-690 incident kill switch for the inbound-email webhook route. When true,
  // POST /api/webhooks/postmark short-circuits with 503 so responders can stop
  // inbound-mail DB writes without a redeploy. See docs/runbook-incident.md.
  INBOUND_EMAIL_DISABLED: booleanFromString.default(false),
  RESEND_API_KEY: z.string().optional(),
  RESEND_DOMAIN: z.string().optional(),
  SLACK_BOT_TOKEN: z.string().optional(),
  // ORR-698 server-side Google Drive (folder auto-create + permission sync). All
  // optional so the app boots with the seam unwired. GOOGLE_SERVICE_ACCOUNT_KEY is
  // the JSON key of a service account with domain-wide delegation;
  // GOOGLE_WORKSPACE_ADMIN_SUBJECT is the Workspace user it impersonates;
  // GOOGLE_DRIVE_SHARED_DRIVE_ID targets a shared drive; DRIVE_SYNC_CRON_SECRET
  // gates the drain route.
  GOOGLE_SERVICE_ACCOUNT_KEY: z.string().optional(),
  GOOGLE_WORKSPACE_ADMIN_SUBJECT: z.string().optional(),
  GOOGLE_DRIVE_SHARED_DRIVE_ID: z.string().optional(),
  DRIVE_SYNC_CRON_SECRET: z.string().optional(),
  // ORR-817 (foundation for ORR-773): at-rest key for per-user Google OAuth
  // tokens. 32 raw bytes, base64-encoded (generate: `openssl rand -base64 32`).
  // Optional so the app boots when Google isn't configured — token-crypto.ts
  // throws a TokenCryptoError only when encryption is actually exercised.
  GOOGLE_TOKEN_ENC_KEY: z.string().optional(),
  // ORR-620 document ingestion. All optional so the app boots with the seam
  // unwired — point EMBEDDINGS_* at a llama.cpp (OpenAI-compatible) server to
  // enable embedding. INGESTION_CRON_SECRET gates the worker drain route.
  EMBEDDINGS_BASE_URL: z.string().url().optional(),
  EMBEDDINGS_MODEL: z.string().optional(),
  EMBEDDINGS_API_KEY: z.string().optional(),
  INGESTION_CRON_SECRET: z.string().optional(),
  // ORR-634 self-hosted RAG generation fallback (DB ai_settings wins over these).
  GENERATION_BASE_URL: z.string().url().optional(),
  GENERATION_MODEL: z.string().optional(),
  GENERATION_API_KEY: z.string().optional(),
  // ORR-737 speech-to-text (Whisper) endpoint fallback (DB ai_settings wins).
  // Point at an OpenAI-compatible /audio/transcriptions server (local or cloud).
  TRANSCRIPTION_BASE_URL: z.string().url().optional(),
  TRANSCRIPTION_MODEL: z.string().optional(),
  TRANSCRIPTION_API_KEY: z.string().optional(),
  // ORR-635 AI provider config fallback (DB ai_providers wins over these).
  // Previously read as raw process.env in the provider adapters (audit ARCH-1).
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_MODEL: z.string().optional(),
  MOONSHOT_API_KEY: z.string().optional(),
  MOONSHOT_MODEL: z.string().optional(),
  OPENAI_COMPATIBLE_BASE_URL: z.string().url().optional(),
  OPENAI_COMPATIBLE_MODEL: z.string().optional(),
  OPENAI_COMPATIBLE_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.string().url().optional(),
  OLLAMA_MODEL: z.string().optional(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("Nodwin CRM"),
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_DEBUG: booleanFromString.default(false),
  NEXT_PUBLIC_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  NEXT_PUBLIC_ENV: z.string().optional(),
  // Google Drive import (Picker). Both are public browser values baked at build
  // time (see Dockerfile ARGs). The OAuth client id drives the per-user consent
  // popup (drive.file scope); the API key authorises the Picker API. Optional so
  // the app boots without them — the "Import from Drive" button just hides.
  NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  NEXT_PUBLIC_GOOGLE_PICKER_API_KEY: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>
