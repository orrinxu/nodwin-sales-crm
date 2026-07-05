import "server-only"
import { z } from "zod"
import { createServerClient as createSsrClient } from "@supabase/ssr"
import { createServerClient } from "@/lib/supabase/server"
import { env } from "@/lib/security/env"
import type { Database } from "@/lib/database.types"
import type { AuthenticatedUser } from "@/lib/security/auth"
import { NON_TERMINAL_STAGES } from "@/lib/opportunity/stage"
import { getStageLabel } from "@/lib/data/opportunities.types"

// ORR-103: admin-configurable per-open-stage staleness thresholds for the Stuck
// Deals widget. Org-wide; admin-only writes; the widget resolves via service role.

export interface StuckDealSettingsContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

// The five open pipeline stages (NON_TERMINAL_STAGES is typed as DealStage[] in
// stage.ts, so it doesn't narrow — pin the open-stage union explicitly here).
export type OpenStage =
  | "qualify" | "meet_and_present" | "propose" | "negotiate" | "verbal_agreement"

export type StuckThresholds = Record<OpenStage, number>

/** Fallback used when the DB has no row for a stage (or is unreachable). Also the
 *  values seeded by the migration — keep the two in sync. */
export const STUCK_DEAL_DEFAULT_THRESHOLDS: StuckThresholds = {
  qualify: 21,
  meet_and_present: 14,
  propose: 10,
  negotiate: 7,
  verbal_agreement: 5,
}

type Db = ReturnType<typeof createSsrClient<Database>>

function serviceRoleClient(): Db {
  return createSsrClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    cookies: { getAll: () => [], setAll: () => {} },
  })
}

function isOpenStage(s: string): s is OpenStage {
  return (NON_TERMINAL_STAGES as string[]).includes(s)
}

/**
 * The resolved per-open-stage thresholds, DB-first with a constant fallback per
 * stage. Read via the service-role client so the widget (which runs as the
 * viewer) still gets the org-wide config without needing admin rights. This is
 * config, not user data — it carries no per-viewer entitlement.
 */
export async function resolveStuckThresholds(): Promise<StuckThresholds> {
  const resolved: StuckThresholds = { ...STUCK_DEAL_DEFAULT_THRESHOLDS }
  const supabase = serviceRoleClient()
  const { data } = await supabase.from("stuck_deal_settings").select("stage, threshold_days")
  for (const row of data ?? []) {
    if (isOpenStage(row.stage) && typeof row.threshold_days === "number") {
      resolved[row.stage] = row.threshold_days
    }
  }
  return resolved
}

// ── Admin UI ────────────────────────────────────────────────────────────────

export interface StuckThresholdRow {
  stage: OpenStage
  label: string
  thresholdDays: number
}

/** Admin view: one row per open stage, ordered by pipeline order, with the
 *  effective (DB-or-default) value. */
export async function getStuckDealSettings(
  ctx: StuckDealSettingsContext,
): Promise<StuckThresholdRow[]> {
  void ctx
  const supabase = (await createServerClient()) as unknown as Db
  const { data, error } = await supabase.from("stuck_deal_settings").select("stage, threshold_days")
  if (error) throw new Error(`Failed to load stuck-deal settings: ${error.message}`)

  const byStage = new Map<string, number>()
  for (const row of data ?? []) byStage.set(row.stage, row.threshold_days)

  return NON_TERMINAL_STAGES.map((s) => {
    const stage = s as OpenStage
    return {
      stage,
      label: getStageLabel(stage),
      // eslint-disable-next-line security/detect-object-injection -- stage is a constrained OpenStage from NON_TERMINAL_STAGES, not user input
      thresholdDays: byStage.get(stage) ?? STUCK_DEAL_DEFAULT_THRESHOLDS[stage],
    }
  })
}

const openStageEnum = z.enum([
  "qualify", "meet_and_present", "propose", "negotiate", "verbal_agreement",
])

export const stuckDealSettingsUpdateSchema = z.object({
  thresholds: z.array(
    z.object({
      stage: openStageEnum,
      thresholdDays: z.number().int().min(1).max(365),
    }),
  ),
})
export type StuckDealSettingsUpdateInput = z.input<typeof stuckDealSettingsUpdateSchema>

export async function updateStuckDealSettings(
  ctx: StuckDealSettingsContext,
  input: StuckDealSettingsUpdateInput,
): Promise<void> {
  const parsed = stuckDealSettingsUpdateSchema.parse(input)
  const supabase = (await createServerClient()) as unknown as Db

  for (const t of parsed.thresholds) {
    // Upsert (not update) so a stage whose row was ever deleted is recreated
    // rather than silently no-op'ing to a false "Saved" (CTO review M4).
    const { error } = await supabase
      .from("stuck_deal_settings")
      .upsert(
        { stage: t.stage, threshold_days: t.thresholdDays, updated_by: ctx.user.id },
        { onConflict: "stage" },
      )
    if (error) throw new Error(`Failed to update threshold for ${t.stage}: ${error.message}`)
  }
}
