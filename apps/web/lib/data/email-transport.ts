import "server-only"
import { z } from "zod"
import { createServerClient as createSsrClient } from "@supabase/ssr"
import { createServerClient } from "@/lib/supabase/server"
import { env } from "@/lib/security/env"
import type { AuthenticatedUser } from "@/lib/security/auth"

export interface EmailTransportCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export type EmailProvider = "smtp" | "resend"

// Safe view for the admin UI — NO secrets, only whether each is set.
export interface EmailTransportConfig {
  provider: EmailProvider
  fromName: string | null
  fromAddress: string | null
  smtpHost: string | null
  smtpPort: number | null
  smtpSecure: boolean
  smtpUsername: string | null
  hasSmtpPassword: boolean
  resendDomain: string | null
  hasResendApiKey: boolean
  active: boolean
}

// Full config incl. secrets — service-role only, for actually sending.
export interface EmailTransportSecrets extends EmailTransportConfig {
  smtpPassword: string | null
  resendApiKey: string | null
}

function serviceRoleClient() {
  return createSsrClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    cookies: { getAll: () => [], setAll: () => {} },
  })
}

function mapRow(r: Record<string, unknown>): EmailTransportSecrets {
  return {
    provider: ((r.provider as string) ?? "resend") as EmailProvider,
    fromName: (r.from_name as string) ?? null,
    fromAddress: (r.from_address as string) ?? null,
    smtpHost: (r.smtp_host as string) ?? null,
    smtpPort: (r.smtp_port as number) ?? null,
    smtpSecure: (r.smtp_secure as boolean) ?? true,
    smtpUsername: (r.smtp_username as string) ?? null,
    smtpPassword: (r.smtp_password as string) ?? null,
    hasSmtpPassword: !!r.smtp_password,
    resendDomain: (r.resend_domain as string) ?? null,
    resendApiKey: (r.resend_api_key as string) ?? null,
    hasResendApiKey: !!r.resend_api_key,
    active: (r.active as boolean) ?? true,
  }
}

// The active transport WITH secrets, for the server to send. Service-role read
// (bypasses RLS). Never expose the result to the client.
export async function getEmailTransportForSending(): Promise<EmailTransportSecrets | null> {
  const supabase = serviceRoleClient()
  const { data } = await supabase
    .from("email_transport")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ? mapRow(data as Record<string, unknown>) : null
}

// Safe config for the admin UI — secrets stripped. RLS restricts read to admins.
export async function getEmailTransport(
  ctx: EmailTransportCallContext,
): Promise<EmailTransportConfig | null> {
  void ctx
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("email_transport")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Failed to load email transport: ${error.message}`)
  if (!data) return null
  const { smtpPassword: _pw, resendApiKey: _key, ...safe } = mapRow(data as Record<string, unknown>)
  void _pw
  void _key
  return safe
}

export const emailTransportSchema = z.object({
  provider: z.enum(["smtp", "resend"]),
  fromName: z.string().max(200).nullable().optional(),
  fromAddress: z.string().email("Must be a valid email").max(320).nullable().optional().or(z.literal("")),
  smtpHost: z.string().max(255).nullable().optional().or(z.literal("")),
  smtpPort: z.number().int().min(1).max(65535).nullable().optional(),
  smtpSecure: z.boolean().optional(),
  smtpUsername: z.string().max(255).nullable().optional().or(z.literal("")),
  smtpPassword: z.string().max(500).optional(), // write-only; blank/undefined = keep existing
  resendApiKey: z.string().max(500).optional(), // write-only
  resendDomain: z.string().max(255).nullable().optional().or(z.literal("")),
  active: z.boolean().optional(),
})
export type EmailTransportInput = z.input<typeof emailTransportSchema>

// Admin upsert (single-row config). Secrets are write-only: a blank/omitted
// password or API key leaves the stored one untouched.
export async function upsertEmailTransport(
  ctx: EmailTransportCallContext,
  input: EmailTransportInput,
): Promise<void> {
  void ctx
  const parsed = emailTransportSchema.parse(input)
  const supabase = await createServerClient()

  const { data: existing } = await supabase
    .from("email_transport")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const patch: Record<string, unknown> = {
    provider: parsed.provider,
    from_name: parsed.fromName || null,
    from_address: parsed.fromAddress || null,
    smtp_host: parsed.smtpHost || null,
    smtp_port: parsed.smtpPort ?? null,
    smtp_secure: parsed.smtpSecure ?? true,
    smtp_username: parsed.smtpUsername || null,
    resend_domain: parsed.resendDomain || null,
    active: parsed.active ?? true,
  }
  if (parsed.smtpPassword && parsed.smtpPassword.length > 0) patch.smtp_password = parsed.smtpPassword
  if (parsed.resendApiKey && parsed.resendApiKey.length > 0) patch.resend_api_key = parsed.resendApiKey

  if (existing) {
    const { error } = await supabase
      .from("email_transport")
      .update(patch as never)
      .eq("id", (existing as { id: string }).id)
    if (error) throw new Error(`Failed to save email transport: ${error.message}`)
  } else {
    const { error } = await supabase.from("email_transport").insert(patch as never)
    if (error) throw new Error(`Failed to save email transport: ${error.message}`)
  }
}
