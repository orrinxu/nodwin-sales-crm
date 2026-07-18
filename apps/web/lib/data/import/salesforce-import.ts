import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"
import { createAccount, type AccountCreateInput } from "@/lib/data/accounts"
import { createContact, type ContactCreateInput } from "@/lib/data/contacts"
import { createOpportunity, type OpportunityCreateInput } from "@/lib/data/opportunities"
import { createImportJob } from "@/lib/data/data-management"
import {
  ROW_MAPPERS,
  SUPPORTED_IMPORT_ENTITIES,
  type ImportEntity,
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
})
export type ImportParams = z.infer<typeof importParamsSchema>

function zodMessage(err: unknown): string {
  if (err instanceof z.ZodError) {
    const first = err.issues[0]
    return first ? `${first.path.join(".") || "row"}: ${first.message}` : "invalid row"
  }
  return err instanceof Error ? err.message : String(err)
}

/** Map legacy_salesforce_id → CRM uuid for a table (for skip + FK resolution). */
async function loadLegacyIndex(
  table: "accounts" | "contacts" | "opportunities",
): Promise<Map<string, string>> {
  const supabase = await createServerClient()
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

  const { rows } = parseCsv(params.csvText)
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
    jobId: null,
  }

  // Phase 1 — map + resolve + dedupe every row (no create yet). Marking a
  // Salesforce Id seen HERE (not after the insert) dedupes within-file duplicates
  // before the parallel creates. A row that can't be mapped/resolved (e.g. an
  // opportunity with no parent account) fails here, exactly as before.
  const toCreate: { rowNum: number; run: () => Promise<unknown> }[] = []
  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 1
    try {
      // eslint-disable-next-line security/detect-object-injection -- numeric loop index
      const mapped = mapper(rows[i])

      // Idempotency: skip rows already imported under this Salesforce Id.
      if (mapped.legacyId && existing.has(mapped.legacyId)) {
        result.skipped++
        continue
      }

      const accountUuid = mapped.accountLegacyId
        ? accountIndex.get(mapped.accountLegacyId)
        : undefined

      // The create fns validate their inputs with zod internally, so the CSV-
      // derived values are checked at runtime; the cast only satisfies the
      // compile-time signature.
      if (entity === "accounts") {
        const input = {
          ...mapped.values,
          legacySalesforceId: mapped.legacyId || undefined,
        } as unknown as AccountCreateInput
        toCreate.push({ rowNum, run: () => createAccount(ctx, input) })
      } else if (entity === "contacts") {
        const input = {
          ...mapped.values,
          // Link to the account if we imported it; otherwise leave unlinked.
          primaryAccountId: accountUuid,
          legacySalesforceId: mapped.legacyId || undefined,
        } as unknown as ContactCreateInput
        toCreate.push({ rowNum, run: () => createContact(ctx, input) })
      } else {
        // opportunities — account_id is required.
        if (!accountUuid) {
          throw new Error(
            mapped.accountLegacyId
              ? `parent account ${mapped.accountLegacyId} not found (import Accounts first)`
              : "no account id in row (opportunities require an account)",
          )
        }
        const input = {
          ...mapped.values,
          accountId: accountUuid,
          salesUnitId: params.salesUnitId,
          legacySalesforceId: mapped.legacyId || undefined,
        } as unknown as OpportunityCreateInput
        toCreate.push({ rowNum, run: () => createOpportunity(ctx, input) })
      }
      // The returned id is only used for within-run idempotency (this run imports
      // one entity type; cross-entity links resolve via the DB-loaded index), so a
      // placeholder is enough here.
      if (mapped.legacyId) existing.set(mapped.legacyId, "1")
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

  // Keep the first MAX_REPORTED_ERRORS by row number (matches the old cap).
  result.errors.sort((a, b) => a.row - b.row)
  if (result.errors.length > MAX_REPORTED_ERRORS) {
    result.errors = result.errors.slice(0, MAX_REPORTED_ERRORS)
  }

  // Record the run in import_jobs (audit + visible in the jobs list).
  try {
    const job = await createImportJob(ctx, {
      kind: "import",
      targetEntityType: entity,
      status: result.failed > 0 && result.created === 0 ? "failed" : "completed",
    })
    result.jobId = job.id
  } catch {
    // Non-fatal: the import itself succeeded even if the audit row didn't write.
  }

  return result
}
