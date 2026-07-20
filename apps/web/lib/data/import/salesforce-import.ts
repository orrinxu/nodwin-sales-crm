import "server-only"
import { z } from "zod"
import { createServiceRoleClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"
import { createAccount, type AccountCreateInput } from "@/lib/data/accounts"
import { createContact, type ContactCreateInput } from "@/lib/data/contacts"
import { createOpportunity, type OpportunityCreateInput } from "@/lib/data/opportunities"
import { createImportJob } from "@/lib/data/data-management"
import {
  ROW_MAPPERS,
  SUPPORTED_IMPORT_ENTITIES,
  detectIdColumn,
  hasCurrencyColumn,
  type ImportEntity,
  type MappedRow,
} from "./salesforce-map"
import { parseCsv } from "./csv-parse"
import { runWithConcurrency } from "./concurrency"

export interface ImportContext {
  user: AuthenticatedUser
  source: "web"
}

export interface ImportRowError {
  /** 1-based row number in the data (excludes the header row). */
  row: number
  message: string
}

export interface ImportResult {
  entity: ImportEntity
  total: number
  created: number
  skipped: number
  failed: number
  /** Capped list of row errors for display; `failed` is the true count. */
  errors: ImportRowError[]
  /** Aggregate non-fatal advisories (unmapped stages, unmatched owners, no Id
   *  column, applied default currency, ambiguous dates) — shown in the UI. */
  warnings: string[]
  jobId: string | null
}

/** Guardrails: keep a single upload bounded so one import can't run unbounded. */
const MAX_ROWS = 10_000
const MAX_REPORTED_ERRORS = 50
/** Page size for the existing-row index scan. PostgREST caps a single response
 *  at max_rows (1000), so the scan MUST page or it silently truncates and the
 *  "idempotent by Salesforce Id" contract breaks past 1000 existing rows. */
const LEGACY_SCAN_PAGE = 1000
/** Concurrent creates per wave (ORR-761) — bounded so a big import can't exhaust
 *  the DB connection pool. */
const CREATE_CONCURRENCY = 20

export const importParamsSchema = z.object({
  entity: z.enum(SUPPORTED_IMPORT_ENTITIES),
  csvText: z.string().min(1, "CSV file is empty"),
  // Required for opportunities (opportunities.sales_unit_id is NOT NULL); the UI
  // supplies the target business unit since Salesforce has no equivalent.
  salesUnitId: z.string().uuid().optional(),
  // Required for opportunities: the currency to apply to rows without a Currency
  // column, so a single-currency SF org doesn't silently import as USD (f).
  defaultCurrency: z.string().trim().min(1).max(10).optional(),
})
export type ImportParams = z.infer<typeof importParamsSchema>

function zodMessage(err: unknown): string {
  if (err instanceof z.ZodError) {
    const first = err.issues[0]
    return first ? `${first.path.join(".") || "row"}: ${first.message}` : "invalid row"
  }
  return err instanceof Error ? err.message : String(err)
}

/**
 * Map legacy_salesforce_id → CRM uuid for a table (for skip + FK resolution).
 *
 * Runs on the SERVICE-ROLE client (bypasses RLS): dedupe is a "does this record
 * already exist" question, not a "can this admin see it" question. Under the
 * importing admin's RLS-scoped client, Confidential-fenced deals are absent from
 * the index, so a re-import re-creates them → a spurious UNIQUE-violation failure
 * (the partial unique index blocks the insert) with no idempotent skip (g).
 */
async function loadLegacyIndex(
  table: "accounts" | "contacts" | "opportunities",
): Promise<Map<string, string>> {
  const supabase = createServiceRoleClient()
  const index = new Map<string, string>()
  // Page the scan with a stable order so no existing row is missed: an
  // unpaged .select() truncates at max_rows (1000), and paging without a
  // deterministic order can overlap/skip rows across pages.
  for (let from = 0; ; from += LEGACY_SCAN_PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select("id, legacy_salesforce_id")
      .not("legacy_salesforce_id", "is", null)
      .order("id", { ascending: true })
      .range(from, from + LEGACY_SCAN_PAGE - 1)
    if (error) throw new Error(`Failed to read existing ${table}: ${error.message}`)
    const batch = (data ?? []) as { id: string; legacy_salesforce_id: string }[]
    for (const r of batch) {
      index.set(r.legacy_salesforce_id, r.id)
    }
    if (batch.length < LEGACY_SCAN_PAGE) break
  }
  return index
}

/** email (lowercased) → CRM user id, for Owner-Email→user matching (b). Loaded
 *  on the service-role client so the whole roster resolves regardless of the
 *  importing admin's row visibility. */
async function loadUserEmailIndex(): Promise<Map<string, string>> {
  const supabase = createServiceRoleClient()
  const index = new Map<string, string>()
  for (let from = 0; ; from += LEGACY_SCAN_PAGE) {
    const { data, error } = await supabase
      .from("users")
      .select("id, email")
      .not("email", "is", null)
      .order("id", { ascending: true })
      .range(from, from + LEGACY_SCAN_PAGE - 1)
    if (error) throw new Error(`Failed to read users: ${error.message}`)
    const batch = (data ?? []) as { id: string; email: string | null }[]
    for (const r of batch) {
      if (r.email) index.set(r.email.trim().toLowerCase(), r.id)
    }
    if (batch.length < LEGACY_SCAN_PAGE) break
  }
  return index
}

/** Summarise a value→count map as "a (3), b (1)", capped, with an overflow hint. */
function summariseCounts(counts: Map<string, number>, cap = 8): string {
  const entries = [...counts.entries()]
  const shown = entries.slice(0, cap).map(([v, n]) => `"${v}" (${n})`)
  const extra = entries.length - cap
  return shown.join(", ") + (extra > 0 ? `, and ${extra} more` : "")
}

/**
 * Import a Salesforce CSV export for one entity. Idempotent by Salesforce Id:
 * rows whose Id already exists are skipped, so re-running the same file is safe.
 * Accounts must be imported before contacts/opportunities so their parent-Account
 * foreign keys resolve.
 */
export async function importSalesforceCsv(
  ctx: ImportContext,
  rawParams: ImportParams,
): Promise<ImportResult> {
  const params = importParamsSchema.parse(rawParams)
  const { entity } = params

  if (entity === "opportunities" && !params.salesUnitId) {
    throw new Error("A target business unit is required to import opportunities.")
  }
  if (entity === "opportunities" && !params.defaultCurrency) {
    throw new Error(
      "A currency is required to import opportunities: Salesforce single-currency orgs don't export one, and defaulting to USD silently corrupts reporting. Confirm the currency and try again.",
    )
  }

  const { headers, rows } = parseCsv(params.csvText)
  if (rows.length > MAX_ROWS) {
    throw new Error(
      `File has ${rows.length} rows; the per-import limit is ${MAX_ROWS}. Split the export and try again.`,
    )
  }

  // eslint-disable-next-line security/detect-object-injection -- entity is a validated enum
  const mapper = ROW_MAPPERS[entity]
  const existing = await loadLegacyIndex(entity)
  // Contacts/opportunities resolve their parent Account by Salesforce Id.
  const accountIndex = entity === "accounts" ? existing : await loadLegacyIndex("accounts")

  const result: ImportResult = {
    entity,
    total: rows.length,
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    warnings: [],
    jobId: null,
  }

  // (c) No idempotency key in the file — re-runs can't be de-duplicated.
  const hasIdColumn = detectIdColumn(headers, entity)
  if (!hasIdColumn) {
    result.warnings.push(
      "This file has no Salesforce record-Id column, so re-running it CANNOT skip already-imported rows — a repeat upload will create duplicates. Add the record Id column to the export for safe re-imports.",
    )
  }

  // (f) Opportunities with no Currency column get the confirmed default.
  const currencyColumn = entity === "opportunities" ? hasCurrencyColumn(headers) : true

  // Phase 0 — map every row up front so we can resolve owners in one batch.
  const mapped: MappedRow[] = rows.map((r) => mapper(r))
  const needOwnerLookup = mapped.some((m) => m.ownerEmail)
  const userIndex = needOwnerLookup ? await loadUserEmailIndex() : new Map<string, string>()

  const unmappedStages = new Map<string, number>()
  const unmatchedOwners = new Map<string, number>()
  const dateWarnings: string[] = []
  let defaultedCurrencyRows = 0

  // Phase 1 — resolve + dedupe every row (no create yet). Marking a Salesforce Id
  // seen HERE (not after the insert) dedupes within-file duplicates before the
  // parallel creates. A row that can't be mapped/resolved fails here.
  const toCreate: { rowNum: number; run: () => Promise<unknown> }[] = []
  for (let i = 0; i < mapped.length; i++) {
    const rowNum = i + 1
    // eslint-disable-next-line security/detect-object-injection -- numeric loop index
    const m = mapped[i]
    try {
      // (a) Unknown stage: never guess `qualify` — skip and report the value.
      if (m.unmappedStage) {
        unmappedStages.set(m.unmappedStage, (unmappedStages.get(m.unmappedStage) ?? 0) + 1)
        throw new Error(
          `unmapped Salesforce stage "${m.unmappedStage}" — map it before importing (row not created to avoid mis-filing revenue)`,
        )
      }

      // (e) Surface any per-row date advisories.
      for (const w of m.warnings) dateWarnings.push(`row ${rowNum}: ${w}`)

      // Idempotency: skip rows already imported under this Salesforce Id.
      if (m.legacyId && existing.has(m.legacyId)) {
        result.skipped++
        continue
      }

      // (b) Owner Email → CRM user. Matched → assign; present-but-unmatched →
      // fall back to the current default and report the address.
      let ownerUserId: string | undefined
      if (m.ownerEmail) {
        const uid = userIndex.get(m.ownerEmail.toLowerCase())
        if (uid) ownerUserId = uid
        else unmatchedOwners.set(m.ownerEmail, (unmatchedOwners.get(m.ownerEmail) ?? 0) + 1)
      }

      const accountUuid = m.accountLegacyId ? accountIndex.get(m.accountLegacyId) : undefined

      // The create fns validate their inputs with zod internally, so the CSV-
      // derived values are checked at runtime; the cast only satisfies the
      // compile-time signature.
      if (entity === "accounts") {
        const input = {
          ...m.values,
          accountOwnerUserId: ownerUserId,
          legacySalesforceId: m.legacyId || undefined,
        } as unknown as AccountCreateInput
        toCreate.push({ rowNum, run: () => createAccount(ctx, input) })
      } else if (entity === "contacts") {
        const input = {
          ...m.values,
          // Link to the account if we imported it; otherwise leave unlinked.
          primaryAccountId: accountUuid,
          ownerUserId,
          legacySalesforceId: m.legacyId || undefined,
        } as unknown as ContactCreateInput
        toCreate.push({ rowNum, run: () => createContact(ctx, input) })
      } else {
        // opportunities — account_id is required.
        if (!accountUuid) {
          throw new Error(
            m.accountLegacyId
              ? `parent account ${m.accountLegacyId} not found (import Accounts first)`
              : "no account id in row (opportunities require an account)",
          )
        }
        // (f) row currency wins; otherwise the confirmed default (never silent USD).
        let currency = m.values.currency as string | undefined
        if (!currency) {
          currency = params.defaultCurrency
          if (!currencyColumn) defaultedCurrencyRows++
        }
        const input = {
          ...m.values,
          currency,
          ownerUserId,
          accountId: accountUuid,
          salesUnitId: params.salesUnitId,
          legacySalesforceId: m.legacyId || undefined,
        } as unknown as OpportunityCreateInput
        toCreate.push({ rowNum, run: () => createOpportunity(ctx, input) })
      }
      // Mark this Id seen so a within-file duplicate is skipped (placeholder value;
      // cross-entity links resolve via the DB-loaded index, not this map).
      if (m.legacyId) existing.set(m.legacyId, "1")
    } catch (err) {
      result.failed++
      result.errors.push({ row: rowNum, message: zodMessage(err) })
    }
  }

  // Phase 2 — create with bounded concurrency (ORR-761): N sequential round-trips
  // become ceil(N / CREATE_CONCURRENCY) waves; each row is still its own create.
  const settled = await runWithConcurrency(toCreate, CREATE_CONCURRENCY, (c) => c.run())
  settled.forEach((r, j) => {
    if (r.status === "fulfilled") {
      result.created++
    } else {
      result.failed++
      // eslint-disable-next-line security/detect-object-injection -- numeric index over our own array
      result.errors.push({ row: toCreate[j].rowNum, message: zodMessage(r.reason) })
    }
  })

  // ── Aggregate advisories ───────────────────────────────────────────────────
  if (unmappedStages.size > 0) {
    result.warnings.push(
      `Unmapped stages (rows not imported): ${summariseCounts(unmappedStages)}. Add these to the stage map or fix the export, then re-import.`,
    )
  }
  if (unmatchedOwners.size > 0) {
    result.warnings.push(
      `Owner emails with no matching CRM user (records assigned to you instead): ${summariseCounts(
        unmatchedOwners,
      )}. Create these users or fix the addresses, then re-import to reassign.`,
    )
  }
  if (defaultedCurrencyRows > 0) {
    result.warnings.push(
      `No Currency column in the export — ${defaultedCurrencyRows} opportunit${
        defaultedCurrencyRows === 1 ? "y was" : "ies were"
      } set to ${params.defaultCurrency}.`,
    )
  }
  if (dateWarnings.length > 0) {
    const sample = dateWarnings.slice(0, 3).join("; ")
    result.warnings.push(
      `${dateWarnings.length} row(s) had date issues — ${sample}${dateWarnings.length > 3 ? "; …" : ""}.`,
    )
  }

  // Keep the first MAX_REPORTED_ERRORS by row number (matches the old cap).
  result.errors.sort((a, b) => a.row - b.row)
  if (result.errors.length > MAX_REPORTED_ERRORS) {
    result.errors = result.errors.slice(0, MAX_REPORTED_ERRORS)
  }

  // (h) Record the run in import_jobs with counts + errors, and a `partial`
  // status when some rows failed but others succeeded (previously logged as a
  // plain "completed" with no record of what failed).
  try {
    const status =
      result.failed > 0 ? (result.created > 0 ? "partial" : "failed") : "completed"
    const job = await createImportJob(ctx, {
      kind: "import",
      targetEntityType: entity,
      status,
      recordCount: result.created,
      errorLog:
        result.errors.length > 0 || result.warnings.length > 0
          ? { errors: result.errors, warnings: result.warnings, failed: result.failed }
          : null,
    })
    result.jobId = job.id
  } catch {
    // Non-fatal: the import itself succeeded even if the audit row didn't write.
  }

  return result
}
