import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"
import { createAccount, type AccountCreateInput } from "@/lib/data/accounts"
import { createImportJob } from "@/lib/data/data-management"
import { parseCsv } from "./csv-parse"
import { runWithConcurrency } from "./concurrency"

/**
 * Generic native CSV importer (ORR-731).
 *
 * Unlike the Salesforce importer (ORR-699), this takes an arbitrary CSV the user
 * exported from anywhere. Columns are matched to CRM fields by header name
 * (case-insensitive, against a small alias table), so no per-import mapping UI is
 * needed for the common cases. This first cut supports **Accounts only** — the
 * simplest entity (only `name` is required, no foreign-key resolution). Contacts
 * (account linking) and Opportunities (name→id resolution) are follow-ups.
 */

export const NATIVE_IMPORT_ENTITIES = ["accounts"] as const
export type NativeImportEntity = (typeof NATIVE_IMPORT_ENTITIES)[number]

export interface ImportContext {
  user: AuthenticatedUser
  source: "web"
}

export interface ImportRowError {
  /** 1-based row number in the data (excludes the header row). */
  row: number
  message: string
}

export interface RecordsImportResult {
  entity: NativeImportEntity
  total: number
  created: number
  skipped: number
  failed: number
  /** Capped list of row errors for display; `failed` is the true count. */
  errors: ImportRowError[]
  jobId: string | null
}

/** Guardrails: keep a single upload bounded so one import can't run unbounded. */
const MAX_ROWS = 10_000
const MAX_REPORTED_ERRORS = 50
/** Concurrent creates per wave (ORR-761) — bounded so a big import can't exhaust
 *  the DB connection pool. */
const CREATE_CONCURRENCY = 20
/** PostgREST caps a single select; page the existing-name scan to avoid silent truncation. */
const NAME_SCAN_PAGE = 1000

// ── Header → account-field mapping ───────────────────────────────────────────

type AccountTextField =
  | "name"
  | "legalName"
  | "website"
  | "country"
  | "industry"
  | "description"

/** Accepted header aliases per field (compared case-insensitively, trimmed). */
const ACCOUNT_FIELD_ALIASES: Record<AccountTextField, string[]> = {
  name: [
    "name",
    "account name",
    "account",
    "company",
    "company name",
    "organisation",
    "organization",
  ],
  legalName: ["legal name", "legalname", "legal", "registered name"],
  website: ["website", "web site", "web", "url", "site", "domain"],
  country: ["country", "country/region"],
  industry: ["industry", "sector", "vertical"],
  description: ["description", "notes", "about", "summary"],
}

const ACCOUNT_FIELDS = Object.keys(ACCOUNT_FIELD_ALIASES) as AccountTextField[]

export type AccountFieldMap = Partial<Record<AccountTextField, string>>

/**
 * Resolve each account field to the first CSV header that matches one of its
 * aliases. Pure — the UI and tests can call it to preview the mapping.
 */
export function buildAccountFieldMap(headers: string[]): AccountFieldMap {
  const normalized = headers.map((h) => ({ header: h, key: h.trim().toLowerCase() }))
  const map: AccountFieldMap = {}
  for (const field of ACCOUNT_FIELDS) {
    // eslint-disable-next-line security/detect-object-injection -- field is a fixed enum key
    const aliases = ACCOUNT_FIELD_ALIASES[field]
    const hit = normalized.find((h) => aliases.includes(h.key))
    // eslint-disable-next-line security/detect-object-injection -- field is a fixed enum key
    if (hit) map[field] = hit.header
  }
  return map
}

/**
 * Coerce a website cell into the URL shape `accountCreateSchema` requires. Bare
 * domains ("acme.com") get an `https://` scheme; already-qualified URLs pass
 * through. Empty stays empty (the field is optional).
 */
export function normalizeWebsite(raw: string): string {
  const v = raw.trim()
  if (!v) return ""
  return /^https?:\/\//i.test(v) ? v : `https://${v}`
}

/**
 * Build an `AccountCreateInput` from one CSV row using a resolved field map.
 * Only non-empty optional fields are set; `name` is always included so an empty
 * value surfaces the schema's "name is required" error. Pure.
 */
export function mapAccountRow(
  record: Record<string, string>,
  fieldMap: AccountFieldMap,
): AccountCreateInput {
  const cell = (field: AccountTextField): string => {
    // eslint-disable-next-line security/detect-object-injection -- field is a fixed enum key
    const header = fieldMap[field]
    if (!header) return ""
    // eslint-disable-next-line security/detect-object-injection -- header came from CSV headers, read-only lookup
    return (record[header] ?? "").trim()
  }

  const input: AccountCreateInput = { name: cell("name") }
  const legalName = cell("legalName")
  if (legalName) input.legalName = legalName
  const website = normalizeWebsite(cell("website"))
  if (website) input.website = website
  const country = cell("country")
  if (country) input.country = country
  const industry = cell("industry")
  if (industry) input.industry = industry
  const description = cell("description")
  if (description) input.description = description
  return input
}

function zodMessage(err: unknown): string {
  if (err instanceof z.ZodError) {
    const first = err.issues[0]
    return first ? `${first.path.join(".") || "row"}: ${first.message}` : "invalid row"
  }
  return err instanceof Error ? err.message : String(err)
}

/** Load existing account names (lowercased) for de-duplication, paged to avoid truncation. */
async function loadExistingAccountNames(): Promise<Set<string>> {
  const supabase = await createServerClient()
  const names = new Set<string>()
  for (let from = 0; ; from += NAME_SCAN_PAGE) {
    const { data, error } = await supabase
      .from("accounts")
      .select("name")
      // Stable order so pages can't overlap/skip rows (Postgres gives no
      // ordering guarantee for successive .range() queries without an ORDER BY).
      .order("id", { ascending: true })
      .range(from, from + NAME_SCAN_PAGE - 1)
    if (error) throw new Error(`Failed to read existing accounts: ${error.message}`)
    const batch = (data ?? []) as { name: string | null }[]
    for (const r of batch) {
      if (r.name) names.add(r.name.trim().toLowerCase())
    }
    if (batch.length < NAME_SCAN_PAGE) break
  }
  return names
}

export const importRecordsParamsSchema = z.object({
  entity: z.enum(NATIVE_IMPORT_ENTITIES),
  csvText: z.string().min(1, "CSV file is empty"),
})
export type ImportRecordsParams = z.infer<typeof importRecordsParamsSchema>

/**
 * Import a plain CSV of Accounts. Columns are matched to fields by header name.
 * Rows whose name already exists (case-insensitive) are skipped, so a re-run — or
 * an accidental double-upload — won't create duplicates.
 */
export async function importRecordsCsv(
  ctx: ImportContext,
  rawParams: ImportRecordsParams,
): Promise<RecordsImportResult> {
  const params = importRecordsParamsSchema.parse(rawParams)
  const { entity } = params

  const { headers, rows } = parseCsv(params.csvText)
  if (rows.length > MAX_ROWS) {
    throw new Error(
      `File has ${rows.length} rows; the per-import limit is ${MAX_ROWS}. Split the file and try again.`,
    )
  }

  const fieldMap = buildAccountFieldMap(headers)
  if (!fieldMap.name) {
    throw new Error(
      `Couldn't find a Name column. Headers found: ${
        headers.join(", ") || "(none)"
      }. Include a column named one of: ${ACCOUNT_FIELD_ALIASES.name.join(", ")}.`,
    )
  }

  const existingNames = await loadExistingAccountNames()

  const result: RecordsImportResult = {
    entity,
    total: rows.length,
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    jobId: null,
  }

  // Phase 1 — map + dedupe every row (no DB): decide skip vs create. Marking the
  // name seen HERE (not after the insert) also dedupes within-file duplicates
  // before the parallel creates below.
  const toCreate: { rowNum: number; input: AccountCreateInput }[] = []
  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 1
    try {
      // eslint-disable-next-line security/detect-object-injection -- numeric loop index
      const input = mapAccountRow(rows[i], fieldMap)
      const key = input.name.trim().toLowerCase()

      // Skip blanks and already-present names (covers re-import + within-file dupes).
      if (key && existingNames.has(key)) {
        result.skipped++
        continue
      }

      if (key) existingNames.add(key)
      toCreate.push({ rowNum, input })
    } catch (err) {
      result.failed++
      result.errors.push({ row: rowNum, message: zodMessage(err) })
    }
  }

  // Phase 2 — create with bounded concurrency (ORR-761): N sequential round-trips
  // become ceil(N / CREATE_CONCURRENCY) waves. Each row is still its own create,
  // so validation + per-row error attribution are preserved.
  const settled = await runWithConcurrency(toCreate, CREATE_CONCURRENCY, (c) =>
    createAccount(ctx, c.input),
  )
  settled.forEach((r, j) => {
    if (r.status === "fulfilled") {
      result.created++
    } else {
      result.failed++
      // eslint-disable-next-line security/detect-object-injection -- numeric index over our own array
      result.errors.push({ row: toCreate[j].rowNum, message: zodMessage(r.reason) })
    }
  })

  // Keep the first MAX_REPORTED_ERRORS by row number (matches the old cap, which
  // collected them in row order).
  result.errors.sort((a, b) => a.row - b.row)
  if (result.errors.length > MAX_REPORTED_ERRORS) {
    result.errors = result.errors.slice(0, MAX_REPORTED_ERRORS)
  }

  // Record the run in import_jobs (audit + visible in the jobs list).
  try {
    const status =
      result.failed > 0 ? (result.created > 0 ? "partial" : "failed") : "completed"
    const job = await createImportJob(ctx, {
      kind: "import",
      targetEntityType: entity,
      status,
      recordCount: result.created,
      errorLog: result.errors.length > 0 ? result.errors : null,
    })
    result.jobId = job.id
  } catch {
    // Non-fatal: the import itself succeeded even if the audit row didn't write.
  }

  return result
}
