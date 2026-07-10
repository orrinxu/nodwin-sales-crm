"use client"

import { FileText } from "lucide-react"

import { getDocumentDownloadUrlAction } from "@/app/(crm)/documents/actions"
import { type DocumentCategory, type DocumentSummary } from "@/lib/data/documents.types"
import { cn } from "@/lib/utils"

const PINNED_LABELS = new Map<DocumentCategory, string>([
  ["rfp", "RFP"],
  ["proposal", "Proposal"],
  ["contract", "Contract"],
  ["budget", "Budget"],
  ["po", "Purchase Order"],
  ["invoice", "Invoice"],
  ["presentation", "Presentation"],
  ["brand_guidelines", "Brand Guidelines"],
  ["logo_assets", "Logo & Assets"],
  ["rate_card", "Rate Card"],
  ["other", "Other"],
])

function formatBytes(n: number | null): string {
  if (n == null) return ""
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

/** Display-only visibility-tier chip. Never gates access — RLS does that. */
function VisibilityTierBadge({ tier }: { tier: string }) {
  const label = tier.charAt(0).toUpperCase() + tier.slice(1)
  const tone =
    tier === "confidential"
      ? "bg-destructive/10 text-destructive"
      : tier === "restricted"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
        : "bg-muted text-muted-foreground"
  return (
    <span className={cn("inline-flex w-fit items-center rounded px-1.5 py-0.5 text-[10.5px] font-medium", tone)}>
      {label}
    </span>
  )
}

/**
 * The pinned document row (e.g. RFP / Proposal / Contract). Each slot shows the
 * most-recent document in that category — filename, size, date, and (when given)
 * the record's visibility tier — or a quiet "None yet". Display + download only;
 * the full list and upload live in the FilesModule alongside it. Shared by the
 * opportunity and account detail pages.
 */
export function PinnedDocumentSlots({
  documents,
  categories,
  visibilityTier,
}: {
  documents: DocumentSummary[]
  categories: DocumentCategory[]
  /** Optional — omitted (no badge) for records without a tier concept. */
  visibilityTier?: string
}) {
  async function download(id: string) {
    try {
      const { url } = await getDocumentDownloadUrlAction(id)
      window.open(url, "_blank", "noopener,noreferrer")
    } catch {
      // Non-fatal: the row still lists in the FilesModule below.
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {categories.map((cat) => {
        const doc = documents
          .filter((d) => d.category === cat)
          .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0]
        const canDownload = doc && (doc.hasFile || Boolean(doc.driveLinkUrl))
        return (
          <div key={cat} className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
              {PINNED_LABELS.get(cat) ?? cat}
            </span>
            {doc ? (
              <>
                <div className="flex items-start gap-2">
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <button
                    type="button"
                    onClick={() => download(doc.id)}
                    disabled={!canDownload}
                    title={canDownload ? `Download ${doc.name}` : doc.name}
                    className="min-w-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    <span
                      className={cn(
                        "block truncate text-[13.5px] font-medium leading-[1.6]",
                        canDownload && "hover:text-primary",
                      )}
                    >
                      {doc.name}
                    </span>
                  </button>
                </div>
                <span className="text-[11.5px] text-muted-foreground">
                  {doc.sizeBytes != null && `${formatBytes(doc.sizeBytes)} · `}
                  {formatDate(doc.uploadedAt)}
                </span>
                {visibilityTier ? <VisibilityTierBadge tier={visibilityTier} /> : null}
              </>
            ) : (
              <span className="text-[12px] text-muted-foreground">None yet</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
