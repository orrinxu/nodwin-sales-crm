"use client"

import { useCallback, useState } from "react"
import { ChevronDown, ChevronRight, Loader2, ScrollText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import type { AuditLogEntry, AuditLogPage, AuditLogQuery, AuditOperation } from "@/lib/data/audit-log"

interface Props {
  initialPage: AuditLogPage
  tables: string[]
  loadAction: (query: AuditLogQuery) => Promise<AuditLogPage>
}

const PAGE_SIZE = 50
const ANY = "__any__"
const OPERATIONS: AuditOperation[] = ["INSERT", "UPDATE", "DELETE"]

const OP_CLASS: Record<AuditOperation, string> = {
  INSERT: "border-primary/30 bg-primary/10 text-primary",
  UPDATE: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  DELETE: "border-destructive/30 bg-destructive/10 text-destructive",
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

export function AuditLogList({ initialPage, tables, loadAction }: Props) {
  const [page, setPage] = useState<AuditLogPage>(initialPage)
  const [tableName, setTableName] = useState<string>(ANY)
  const [operation, setOperation] = useState<string>(ANY)
  const [offset, setOffset] = useState(0)
  const [pending, setPending] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(
    async (next: { tableName: string; operation: string; offset: number }) => {
      setPending(true)
      try {
        const result = await loadAction({
          tableName: next.tableName === ANY ? undefined : next.tableName,
          operation: next.operation === ANY ? undefined : (next.operation as AuditOperation),
          limit: PAGE_SIZE,
          offset: next.offset,
        })
        setPage(result)
        setOffset(next.offset)
      } finally {
        setPending(false)
      }
    },
    [loadAction],
  )

  function onFilter(nextTable: string, nextOp: string) {
    setTableName(nextTable)
    setOperation(nextOp)
    setExpanded(null)
    void load({ tableName: nextTable, operation: nextOp, offset: 0 })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ScrollText className="size-5 text-muted-foreground" /> Audit log
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Every insert, update and delete across the CRM, newest first. Credential values are
          redacted. Admin-only.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={tableName} onValueChange={(v) => onFilter(v ?? ANY, operation)}>
            <SelectTrigger className="w-56"><SelectValue placeholder="All tables" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All tables</SelectItem>
              {tables.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={operation} onValueChange={(v) => onFilter(tableName, v ?? ANY)}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All operations" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All operations</SelectItem>
              {OPERATIONS.map((op) => <SelectItem key={op} value={op}>{op}</SelectItem>)}
            </SelectContent>
          </Select>
          {(tableName !== ANY || operation !== ANY) && (
            <Button variant="ghost" size="sm" onClick={() => onFilter(ANY, ANY)}>Clear</Button>
          )}
          {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-8 p-2" />
                <th className="p-2 font-medium">When</th>
                <th className="p-2 font-medium">Table</th>
                <th className="p-2 font-medium">Op</th>
                <th className="p-2 font-medium">Actor</th>
                <th className="p-2 font-medium">Row</th>
              </tr>
            </thead>
            <tbody>
              {page.entries.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No audit entries match these filters.</td></tr>
              ) : (
                page.entries.map((e) => <AuditRow key={e.id} entry={e} open={expanded === e.id} onToggle={() => setExpanded(expanded === e.id ? null : e.id)} />)
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Showing {page.entries.length} entr{page.entries.length === 1 ? "y" : "ies"}{offset > 0 ? ` (from #${offset + 1})` : ""}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={offset === 0 || pending}
              onClick={() => load({ tableName, operation, offset: Math.max(offset - PAGE_SIZE, 0) })}>Previous</Button>
            <Button variant="outline" size="sm" disabled={!page.hasMore || pending}
              onClick={() => load({ tableName, operation, offset: offset + PAGE_SIZE })}>Next</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function AuditRow({ entry, open, onToggle }: { entry: AuditLogEntry; open: boolean; onToggle: () => void }) {
  const details = entry.changedFields ?? entry.newData ?? entry.oldData
  return (
    <>
      <tr className="cursor-pointer border-b last:border-0 hover:bg-accent/40" onClick={onToggle}>
        <td className="p-2 text-muted-foreground">{open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</td>
        <td className="whitespace-nowrap p-2">{formatWhen(entry.occurredAt)}</td>
        <td className="p-2 font-medium">{entry.tableName}</td>
        <td className="p-2">
          <Badge variant="outline" className={`px-1.5 py-0 text-[10px] ${OP_CLASS[entry.operation]}`}>{entry.operation}</Badge>
        </td>
        <td className="p-2">{entry.actorName ?? (entry.actorUserId ? <span className="font-mono text-xs">{entry.actorUserId.slice(0, 8)}…</span> : <span className="text-muted-foreground">{entry.actorSource}</span>)}</td>
        <td className="p-2 font-mono text-xs text-muted-foreground">{entry.rowId ? `${entry.rowId.slice(0, 8)}…` : "—"}</td>
      </tr>
      {open && (
        <tr className="border-b bg-muted/20 last:border-0">
          <td />
          <td colSpan={5} className="p-2">
            <pre className="max-h-80 overflow-auto rounded bg-background p-3 text-xs">
              {JSON.stringify(details ?? {}, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  )
}
