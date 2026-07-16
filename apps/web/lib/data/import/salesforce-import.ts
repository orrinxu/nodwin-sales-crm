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
  const { data, error } = await supabase
    .from(table)
    .select("id, legacy_salesforce_id")
    .not("legacy_salesforce_id", "is", null)
  if (error) throw new Error(`Failed to read existing ${table}: ${error.message}`)
  const index = new Map<string, string>()
  for (const r of (data ?? []) as { id: string; legacy_salesforce_id: string }[]) {
    index.set(r.legacy_salesforce_id, r.id)
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
        const created = await createAccount(ctx, {
          ...mapped.values,
          legacySalesforceId: mapped.legacyId || undefined,
        } as unknown as AccountCreateInput)
        if (mapped.legacyId) existing.set(mapped.legacyId, created.id)
        result.created++
      } else if (entity === "contacts") {
        await createContact(ctx, {
          ...mapped.values,
          // Link to the account if we imported it; otherwise leave unlinked.
          primaryAccountId: accountUuid,
          legacySalesforceId: mapped.legacyId || undefined,
        } as unknown as ContactCreateInput)
        if (mapped.legacyId) existing.set(mapped.legacyId, "1")
        result.created++
      } else {
        // opportunities — account_id is required.
        if (!accountUuid) {
          throw new Error(
            mapped.accountLegacyId
              ? `parent account ${mapped.accountLegacyId} not found (import Accounts first)`
              : "no account id in row (opportunities require an account)",
          )
        }
        await createOpportunity(ctx, {
          ...mapped.values,
          accountId: accountUuid,
          salesUnitId: params.salesUnitId,
          legacySalesforceId: mapped.legacyId || undefined,
        } as unknown as OpportunityCreateInput)
        if (mapped.legacyId) existing.set(mapped.legacyId, "1")
        result.created++
      }
    } catch (err) {
      result.failed++
      if (result.errors.length < MAX_REPORTED_ERRORS) {
        result.errors.push({ row: rowNum, message: zodMessage(err) })
      }
    }
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
