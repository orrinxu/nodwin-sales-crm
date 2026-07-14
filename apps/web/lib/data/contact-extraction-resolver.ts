import "server-only"
import { normalizeToken } from "@/lib/opportunity/extraction-normalize"
import { searchAccountOptions, searchContactOptions } from "./contacts"
import type {
  FieldResolution,
  ResolutionStatus,
  ResolutionCandidate,
  ExtractionResolverContext,
} from "./opportunity-extraction-resolver"
import type { ExtractedContactFields } from "@/lib/ai/contact-extraction"

// Contact extraction resolver (ORR-734). Resolves the ACCOUNT first (so the
// contact can be scoped to it and dedup'd within it), then the contact. Deterministic
// (exact normalized match). Never writes; owner is never inferred (gate G5).
//
// Account-first / deferred-creation: when the extracted account has no existing
// match, primaryAccountId is left unset and a note flags that the account is new —
// the UI (T-148) resolves that by creating the account inline before the contact.

export interface ContactPrefill {
  fullName?: string
  email?: string
  phone?: string
  title?: string
  notes?: string
  /** Set only when the extracted account matched an existing one. */
  primaryAccountId?: string
}

export interface ResolvedContactExtraction {
  prefill: ContactPrefill
  resolution: Record<string, FieldResolution>
  notes: string[]
}

export interface ContactResolverDeps {
  searchAccounts: (query: string) => Promise<{ id: string; name: string }[]>
  searchContacts: (query: string, accountId?: string) => Promise<{ id: string; name: string }[]>
}

function defaultDeps(ctx: ExtractionResolverContext): ContactResolverDeps {
  const cc = ctx as never
  return {
    searchAccounts: (q) => searchAccountOptions(cc, q).then((rows) => rows.map((r) => ({ id: r.id, name: r.name }))),
    searchContacts: (q, accountId) =>
      searchContactOptions(cc, { query: q, accountId }).then((rows) => rows.map((r) => ({ id: r.id, name: r.name }))),
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

/** exact (normalized) match → matched; a single option → matched; many → ambiguous; none → unmatched. */
function pickRecord(
  raw: string,
  options: { id: string; name: string }[],
): { status: ResolutionStatus; id?: string; display?: string; candidates?: ResolutionCandidate[] } {
  const token = normalizeToken(raw)
  const exact = options.filter((o) => normalizeToken(o.name) === token)
  const toCandidates = (recs: { id: string; name: string }[]): ResolutionCandidate[] =>
    recs.slice(0, 5).map((r) => ({ id: r.id, label: r.name }))
  if (exact.length === 1) return { status: "matched", id: exact[0].id, display: exact[0].name }
  if (exact.length > 1) return { status: "ambiguous", candidates: toCandidates(exact) }
  if (options.length === 1) return { status: "matched", id: options[0].id, display: options[0].name }
  if (options.length > 1) return { status: "ambiguous", candidates: toCandidates(options) }
  return { status: "unmatched" }
}

export async function resolveExtractedContact(
  ctx: ExtractionResolverContext,
  fields: ExtractedContactFields,
  deps: ContactResolverDeps = defaultDeps(ctx),
): Promise<ResolvedContactExtraction> {
  const prefill: ContactPrefill = {}
  const resolution: Record<string, FieldResolution> = {}
  const notes: string[] = []

  // ── Account first — resolve so the contact can be scoped/dedup'd to it ──
  let matchedAccountId: string | undefined
  if (fields.account) {
    const options = await deps.searchAccounts(fields.account.value)
    const pick = pickRecord(fields.account.value, options)
    matchedAccountId = pick.id
    if (pick.id) prefill.primaryAccountId = pick.id
    resolution.account = {
      status: pick.status,
      display: pick.display ?? fields.account.value,
      candidates: pick.candidates,
      ...meta(fields.account),
    }
    if (pick.status === "unmatched") {
      notes.push(`No existing account matches "${fields.account.value}" — it can be created for this contact.`)
    }
  }

  // ── Full name — dedup within the matched account ──
  if (fields.fullName) {
    prefill.fullName = fields.fullName.value
    const existing = await deps.searchContacts(fields.fullName.value, matchedAccountId)
    const token = normalizeToken(fields.fullName.value)
    const dupes = existing.filter((c) => normalizeToken(c.name) === token)
    if (dupes.length > 0) {
      const candidates: ResolutionCandidate[] = dupes.slice(0, 5).map((c) => ({ id: c.id, label: c.name }))
      resolution.fullName = { status: "ambiguous", display: fields.fullName.value, candidates, ...meta(fields.fullName) }
      notes.push(`A contact named "${fields.fullName.value}" may already exist${matchedAccountId ? " on this account" : ""} — check before creating a duplicate.`)
    } else {
      resolution.fullName = { status: "ok", display: fields.fullName.value, ...meta(fields.fullName) }
    }
  }

  // ── Plain passthroughs ──
  const passthrough: [keyof ContactPrefill, ExtractedField<string>][] = [
    ["email", fields.email],
    ["phone", fields.phone],
    ["title", fields.title],
    ["notes", fields.notes],
  ]
  for (const [key, f] of passthrough) {
    if (!f) continue
    // eslint-disable-next-line security/detect-object-injection -- key is a fixed ContactPrefill literal
    prefill[key] = f.value
    // eslint-disable-next-line security/detect-object-injection -- key is a fixed ContactPrefill literal
    resolution[key] = { status: "ok", display: f.value, ...meta(f) }
  }

  return { prefill, resolution, notes }
}
