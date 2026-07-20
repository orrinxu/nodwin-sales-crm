import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

// ORR-703 — synchronous CSV export of CRM records. Replaces the old no-op that
// just inserted an import_jobs row. Rows are fetched under the caller's RLS (so
// only visible records are exported, Confidential fence included), paginated so a
// full export isn't silently truncated at Supabase's default row cap.

export interface CsvExportCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export type ExportEntity = "accounts" | "contacts" | "opportunities"
export const EXPORT_ENTITIES: ExportEntity[] = ["accounts", "contacts", "opportunities"]

type Cell = string | number | boolean | null | undefined

interface ExportSpec {
  table: string
  select: string
  headers: string[]
  row: (r: Record<string, unknown>) => Cell[]
  /** When true, exclude soft-deleted rows (`deleted_at IS NULL`). Only accounts
   *  carry a `deleted_at` column today. ORR-804. */
  softDelete?: boolean
}

const ACCOUNTS_SPEC: ExportSpec = {
  table: "accounts",
  select: "name, legal_name, website, country, industry, description, created_at",
  headers: ["Name", "Legal name", "Website", "Country", "Industry", "Description", "Created at"],
  row: (r) => [r.name as Cell, r.legal_name as Cell, r.website as Cell, r.country as Cell, r.industry as Cell, r.description as Cell, r.created_at as Cell],
  softDelete: true,
}

const CONTACTS_SPEC: ExportSpec = {
  table: "contacts",
  select: "full_name, email, phone, title, notes, created_at",
  headers: ["Name", "Email", "Phone", "Title", "Notes", "Created at"],
  row: (r) => [r.full_name as Cell, r.email as Cell, r.phone as Cell, r.title as Cell, r.notes as Cell, r.created_at as Cell],
}

const OPPS_SPEC: ExportSpec = {
  table: "opportunities",
  select: "name, stage, amount, currency, close_date, probability_pct, created_at, account:accounts(name)",
  headers: ["Name", "Account", "Stage", "Amount", "Currency", "Close date", "Probability %", "Created at"],
  row: (r) => [
    r.name as Cell,
    (r.account as { name?: string } | null)?.name ?? null,
    r.stage as Cell, r.amount as Cell, r.currency as Cell,
    r.close_date as Cell, r.probability_pct as Cell, r.created_at as Cell,
  ],
}

function specFor(entity: ExportEntity): ExportSpec {
  switch (entity) {
    case "accounts": return ACCOUNTS_SPEC
    case "contacts": return CONTACTS_SPEC
    case "opportunities": return OPPS_SPEC
  }
}

const PAGE = 1000
const MAX_ROWS = 100_000

/** RFC-4180-ish CSV field quoting: wrap in quotes and double embedded quotes when
 *  the value contains a comma, quote or newline. */
export function csvField(value: Cell): string {
  if (value == null) return ""
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  const lines = [headers.map(csvField).join(",")]
  for (const row of rows) lines.push(row.map(csvField).join(","))
  return lines.join("\r\n")
}

export interface CsvExport {
  filename: string
  csv: string
  recordCount: number
}

export async function exportRecordsCsv(
  _ctx: CsvExportCallContext,
  entity: ExportEntity,
  today = new Date(),
): Promise<CsvExport> {
  const spec = specFor(entity)
  const supabase = await createServerClient()

  // The generated client types .from() to known table literals; this reads a
  // dynamic table, so use a loose query shape. RLS still applies (same client).
  type LooseQuery = {
    select: (s: string) => LooseQuery
    order: (c: string, o: { ascending: boolean }) => LooseQuery
    is: (c: string, v: null) => LooseQuery
    range: (a: number, b: number) => Promise<{ data: unknown[] | null; error: { message: string } | null }>
  }
  const from = (supabase as unknown as { from: (t: string) => LooseQuery }).from.bind(supabase)

  const rows: Cell[][] = []
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    let query = from(spec.table)
      .select(spec.select)
      .order("created_at", { ascending: false })
    // ORR-804: keep soft-deleted accounts out of exports so they don't reappear
    // in the file or inflate record_count.
    if (spec.softDelete) query = query.is("deleted_at", null)
    const { data, error } = await query.range(offset, offset + PAGE - 1)
    if (error) throw new Error(`Failed to export ${entity}: ${error.message}`)
    const batch = (data ?? []) as Record<string, unknown>[]
    for (const r of batch) rows.push(spec.row(r))
    if (batch.length < PAGE) break
  }

  return {
    filename: `${entity}-${today.toISOString().slice(0, 10)}.csv`,
    csv: toCsv(spec.headers, rows),
    recordCount: rows.length,
  }
}

/** Best-effort audit row for the data-management jobs table. */
export async function recordExportJob(
  ctx: CsvExportCallContext,
  entity: ExportEntity,
  recordCount: number,
): Promise<void> {
  const supabase = await createServerClient()
  await supabase.from("import_jobs").insert({
    kind: "export",
    target_entity_type: entity,
    status: "completed",
    record_count: recordCount,
    created_by: ctx.user.id,
  } as never)
}
