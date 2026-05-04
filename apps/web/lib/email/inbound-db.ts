import "server-only"
import { createServerClient } from "@supabase/ssr"
import type {
  InboundEmailDb,
  InboundEmailUser,
  InboundEmailAccount,
  InboundEmailOpportunity,
  NewActivity,
  NewDeadLetterEntry,
  DeadLetterReason,
  PostmarkInboundPayload,
} from "./inbound"

// ---------------------------------------------------------------------------
// Supabase adapter for the inbound email pipeline.
//
// NOTE: Tables referenced here are created in Phase 2 (Schema and RLS):
//   - users              → T-020
//   - accounts           → T-021
//   - activities         → T-026
//   - inbound_email_deadletter → T-026
//
// This adapter will fail at runtime until those migrations are applied.
// ---------------------------------------------------------------------------

function createServiceClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
  }
  return createServerClient(url, key, {
    cookies: { getAll: () => [], setAll: () => {} },
  })
}

export function createSupabaseInboundDb(): InboundEmailDb {
  return {
    async getUserByInboundToken(token: string): Promise<InboundEmailUser | null> {
      const db = createServiceClient()
      const { data, error } = await db
        .from("users")
        .select("id, email, email_aliases")
        .eq("crm_inbound_email", token)
        .single()

      if (error || !data) return null
      return {
        id: data.id as string,
        email: data.email as string,
        email_aliases: (data.email_aliases as string[] | null) ?? [],
      }
    },

    async getAccountsByEmailDomain(domain: string): Promise<InboundEmailAccount[]> {
      const db = createServiceClient()
      const { data, error } = await db
        .from("accounts")
        .select("id, name")
        .contains("email_domains", [domain])

      if (error || !data) return []
      return data.map((row) => ({ id: row.id as string, name: row.name as string }))
    },

    async getOpportunityForUser(
      opportunityId: string,
      userId: string,
    ): Promise<InboundEmailOpportunity | null> {
      const db = createServiceClient()
      // Use opportunity_visibility materialised view (T-023) to enforce access control.
      const { data, error } = await db
        .from("opportunity_visibility")
        .select("opportunity_id, account_id")
        .eq("opportunity_id", opportunityId)
        .eq("user_id", userId)
        .single()

      if (error || !data) return null
      return {
        id: data.opportunity_id as string,
        account_id: (data.account_id as string | null) ?? null,
      }
    },

    async isMessageIdSeen(messageId: string): Promise<boolean> {
      const db = createServiceClient()
      // Check both the activities table and dead-letter table to cover all paths
      const [actResult, dlResult] = await Promise.all([
        db
          .from("activities")
          .select("id")
          .eq("message_id", messageId)
          .limit(1)
          .maybeSingle(),
        db
          .from("inbound_email_deadletter")
          .select("id")
          .eq("message_id", messageId)
          .limit(1)
          .maybeSingle(),
      ])
      return actResult.data !== null || dlResult.data !== null
    },

    async insertActivity(activity: NewActivity): Promise<{ id: string }> {
      const db = createServiceClient()
      const { data, error } = await db
        .from("activities")
        .insert({
          user_id: activity.user_id,
          account_id: activity.account_id,
          opportunity_id: activity.opportunity_id,
          subject: activity.subject,
          text_body: activity.text_body,
          html_body: activity.html_body,
          from_email: activity.from_email,
          message_id: activity.message_id,
          in_reply_to: activity.in_reply_to,
          attachment_metadata: activity.attachment_metadata,
          is_assigned: activity.is_assigned,
          source: "inbound_email",
        })
        .select("id")
        .single()

      if (error || !data) {
        throw new Error(`Failed to insert activity: ${error?.message}`)
      }
      return { id: data.id as string }
    },

    async insertDeadLetter(entry: NewDeadLetterEntry): Promise<void> {
      const db = createServiceClient()
      const { error } = await db.from("inbound_email_deadletter").insert({
        raw_payload: entry.raw_payload,
        reason: entry.reason,
        message_id: entry.message_id,
        from_email: entry.from_email,
        inbound_token: entry.inbound_token,
      })

      if (error) {
        // Log but do not throw — dead-lettering must not crash the webhook handler
        console.error("[inbound-email] Failed to write dead-letter entry:", error.message)
      }
    },

    async alertAdmin(
      reason: DeadLetterReason,
      payload: PostmarkInboundPayload,
    ): Promise<void> {
      // TODO (T-083): wire up admin alert notification (Slack DM / email to admin)
      console.error(
        "[inbound-email] SECURITY ALERT — dead-lettered email",
        JSON.stringify({ reason, messageId: payload.MessageID, from: payload.From }),
      )
    },
  }
}
