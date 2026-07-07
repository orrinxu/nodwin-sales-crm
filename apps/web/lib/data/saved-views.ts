import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

/**
 * Per-user saved views for the opportunity/pipeline list. A view is a named,
 * reusable bundle of the list's filter/sort state, scoped to a list surface
 * (`mine` = /pipeline, `all` = /opportunities). Owner-only — every read/write is
 * bound to `ctx.user.id` and the `saved_views` RLS enforces it in the database.
 * Mirrors the user-preferences data layer.
 */

export interface SavedViewCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export type SavedViewScope = "mine" | "all"

/**
 * The serialized list filter state a view restores. Matches the client filter
 * state in OpportunityListTable; every field is optional so a partial view (e.g.
 * just a stage) is valid. Re-validated on read AND write — never trusted raw.
 */
export interface SavedViewFilters {
  searchQuery?: string
  stageFilter?: string
  ownerFilter?: string
  sorting?: { id: string; desc: boolean }[]
}

export interface SavedViewRecord {
  id: string
  name: string
  scope: SavedViewScope
  filters: SavedViewFilters
}

export const savedViewFiltersSchema = z
  .object({
    searchQuery: z.string().max(200).optional(),
    stageFilter: z.string().max(40).optional(),
    ownerFilter: z.string().max(64).optional(),
    sorting: z
      .array(z.object({ id: z.string().max(40), desc: z.boolean() }))
      .max(5)
      .optional(),
  })
  .strict()

export const saveViewInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  scope: z.enum(["mine", "all"]),
  filters: savedViewFiltersSchema,
})
export type SaveViewInput = z.infer<typeof saveViewInputSchema>

/** Coerce a stored jsonb blob into a valid {@link SavedViewFilters} — an
 *  unexpected shape degrades to "no filters" rather than throwing at render. */
function parseFilters(raw: unknown): SavedViewFilters {
  const parsed = savedViewFiltersSchema.safeParse(raw ?? {})
  return parsed.success ? parsed.data : {}
}

/** All of the caller's saved views for a list surface, ordered by name. */
export async function listSavedViews(
  ctx: SavedViewCallContext,
  scope: SavedViewScope,
): Promise<SavedViewRecord[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("saved_views")
    .select("id, name, scope, filters")
    .eq("user_id", ctx.user.id)
    .eq("scope", scope)
    .order("name", { ascending: true })

  if (error) throw new Error(`Failed to load saved views: ${error.message}`)

  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    scope: r.scope as SavedViewScope,
    filters: parseFilters(r.filters),
  }))
}

/**
 * Create or replace a saved view. Upserts on (user_id, scope, name) so saving
 * under an existing name overwrites that view's filters. `user_id` is forced from
 * the context (never client-supplied); RLS enforces the same.
 */
export async function saveView(
  ctx: SavedViewCallContext,
  input: SaveViewInput,
): Promise<SavedViewRecord> {
  const parsed = saveViewInputSchema.parse(input)
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("saved_views")
    .upsert(
      {
        user_id: ctx.user.id,
        updated_by: ctx.user.id,
        name: parsed.name,
        scope: parsed.scope,
        filters: parsed.filters,
      },
      { onConflict: "user_id,scope,name" },
    )
    .select("id, name, scope, filters")
    .single()

  if (error) throw new Error(`Failed to save view: ${error.message}`)

  return {
    id: data.id,
    name: data.name,
    scope: data.scope as SavedViewScope,
    filters: parseFilters(data.filters),
  }
}

/** Delete one of the caller's saved views. The `user_id` filter is belt-and-braces
 *  over RLS (which already blocks deleting another user's view). */
export async function deleteSavedView(
  ctx: SavedViewCallContext,
  id: string,
): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase
    .from("saved_views")
    .delete()
    .eq("id", id)
    .eq("user_id", ctx.user.id)

  if (error) throw new Error(`Failed to delete view: ${error.message}`)
}
