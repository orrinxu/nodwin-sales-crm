import "server-only"
import { normalizeToken } from "@/lib/opportunity/extraction-normalize"
import { searchAccountOptions } from "./contacts"
import type {
  FieldResolution,
  ResolutionCandidate,
  ExtractionResolverContext,
} from "./opportunity-extraction-resolver"
import type { ExtractedAccountFields } from "@/lib/ai/account-extraction"

// Account extraction resolver (ORR-733). Accounts have no FK/enum fields to
// resolve (owner is never inferred — gate G5), so this is mostly a passthrough
// that builds the create-form prefill. The one real resolution is a DEDUP check on
// the name: if an account with the same name already exists, flag it so the rep
// doesn't create a duplicate. Deterministic (exact normalized match), like the
// opportunity resolver. Never writes.

/** Form-ready account values — mirrors the account create form (minus owner). */
export interface AccountPrefill {
  name?: string
  legalName?: string
  website?: string
  country?: string
  industry?: string
  description?: string
}

export interface ResolvedAccountExtraction {
  prefill: AccountPrefill
  resolution: Record<string, FieldResolution>
  notes: string[]
}

export interface AccountResolverDeps {
  /** Existing accounts matching a name query (RLS-scoped) — for the dedup check. */
  searchAccounts: (query: string) => Promise<{ id: string; name: string }[]>
}

function defaultDeps(ctx: ExtractionResolverContext): AccountResolverDeps {
  const cc = ctx as never
  return {
    searchAccounts: (q) => searchAccountOptions(cc, q).then((rows) => rows.map((r) => ({ id: r.id, name: r.name }))),
  }
}

type ExtractedField<T> = { value: T; confidence: number; source: string } | undefined

function meta<T>(f: ExtractedField<T>): Pick<FieldResolution, "source" | "confidence" | "raw"> {
  return {
    source: f?.source ?? null,
    confidence: f?.confidence ?? null,
    raw: f == null ? null : String(f.value),
  }
}

export async function resolveExtractedAccount(
  ctx: ExtractionResolverContext,
  fields: ExtractedAccountFields,
  deps: AccountResolverDeps = defaultDeps(ctx),
): Promise<ResolvedAccountExtraction> {
  const prefill: AccountPrefill = {}
  const resolution: Record<string, FieldResolution> = {}
  const notes: string[] = []

  // ── Name — dedup check against existing accounts ──
  if (fields.name) {
    prefill.name = fields.name.value
    const existing = await deps.searchAccounts(fields.name.value)
    const token = normalizeToken(fields.name.value)
    const dupes = existing.filter((a) => normalizeToken(a.name) === token)
    if (dupes.length > 0) {
      const candidates: ResolutionCandidate[] = dupes.slice(0, 5).map((a) => ({ id: a.id, label: a.name }))
      resolution.name = { status: "ambiguous", display: fields.name.value, candidates, ...meta(fields.name) }
      notes.push(`An account named "${fields.name.value}" may already exist — check before creating a duplicate.`)
    } else {
      resolution.name = { status: "ok", display: fields.name.value, ...meta(fields.name) }
    }
  }

  // ── Plain passthroughs (no FK/enum on accounts) ──
  const passthrough: [keyof AccountPrefill, ExtractedField<string>][] = [
    ["legalName", fields.legalName],
    ["website", fields.website],
    ["country", fields.country],
    ["industry", fields.industry],
    ["description", fields.description],
  ]
  for (const [key, f] of passthrough) {
    if (!f) continue
    // eslint-disable-next-line security/detect-object-injection -- key is a fixed AccountPrefill literal
    prefill[key] = f.value
    // eslint-disable-next-line security/detect-object-injection -- key is a fixed AccountPrefill literal
    resolution[key] = { status: "ok", display: f.value, ...meta(f) }
  }

  return { prefill, resolution, notes }
}
