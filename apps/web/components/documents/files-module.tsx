"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Upload, FileText, Download, Trash2, Loader2, RotateCcw, AlertTriangle } from "lucide-react"

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  DOCUMENT_CATEGORIES,
  type DocumentCategory,
  type DocumentSummary,
} from "@/lib/data/documents.types"
import {
  getDocumentDownloadUrlAction,
  deleteDocumentAction,
  updateDocumentCategoryAction,
} from "@/app/(crm)/documents/actions"
import { uploadBlobToDocuments, finalizeUpload, replaceDocumentSource } from "@/lib/documents/client-upload"
import { DriveImportButton } from "@/components/documents/drive-import-button"
import { usePreferences } from "@/components/providers/preferences-provider"

/** Human labels for each category value. A Map (not a Record) so the dynamic
 *  lookups below aren't flagged as object-injection sinks. */
const CATEGORY_LABELS = new Map<DocumentCategory, string>([
  ["rfp", "RFP"],
  ["proposal", "Proposal"],
  ["budget", "Budget"],
  ["contract", "Contract"],
  ["po", "Purchase Order"],
  ["invoice", "Invoice"],
  ["presentation", "Presentation"],
  ["brand_guidelines", "Brand Guidelines"],
  ["logo_assets", "Logo & Assets"],
  ["rate_card", "Rate Card"],
  ["other", "Other"],
])
const labelFor = (c: DocumentCategory) => CATEGORY_LABELS.get(c) ?? c

function formatBytes(n: number | null): string {
  if (n == null) return ""
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

interface FilesModuleProps {
  /** Exactly one of these identifies the parent record. */
  opportunityId?: string
  accountId?: string
  initialDocuments: DocumentSummary[]
}

/**
 * Prominent, interactive file manager shown at the bottom of an opportunity or
 * account detail page (replaces the old read-only "Files" tab). Drag-drop or
 * pick files — bytes upload straight to a signed Storage URL, never through the
 * Next.js server — list grouped by category, re-tag or delete inline.
 */
export function FilesModule({ opportunityId, accountId, initialDocuments }: FilesModuleProps) {
  const router = useRouter()
  const { formatDate } = usePreferences()
  const [docs, setDocs] = useState(initialDocuments)
  const [syncedFrom, setSyncedFrom] = useState(initialDocuments)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [replacing, setReplacing] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<DocumentSummary | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const replaceTargetRef = useRef<string | null>(null)

  // Reconcile with the server list when it changes (after router.refresh()).
  // Render-time reset instead of an effect — the React-recommended pattern for
  // deriving state from a changed prop.
  if (syncedFrom !== initialDocuments) {
    setSyncedFrom(initialDocuments)
    setDocs(initialDocuments)
  }

  const entityRef = opportunityId ? { opportunityId } : { accountId }

  async function handleFiles(fileList: FileList | File[]) {
    setError(null)
    for (const file of Array.from(fileList)) {
      setUploading((u) => [...u, file.name])
      try {
        await uploadBlobToDocuments(entityRef, file, {
          name: file.name,
          mimeType: file.type,
          category: "other",
        })
        await finalizeUpload(entityRef)
      } catch (e) {
        setError(`Couldn't upload ${file.name}: ${(e as Error).message}`)
      } finally {
        setUploading((u) => u.filter((n) => n !== file.name))
      }
    }
    startTransition(() => router.refresh())
  }

  async function handleDownload(id: string) {
    setError(null)
    try {
      const { url } = await getDocumentDownloadUrlAction(id)
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    setDocs((d) => d.filter((x) => x.id !== id))
    try {
      await deleteDocumentAction({ ...entityRef, documentId: id })
    } catch (e) {
      setError((e as Error).message)
    }
    startTransition(() => router.refresh())
  }

  // Re-upload the source bytes for a doc whose Storage object was lost (shows as
  // 'skipped'). Repoints the row + pushes new bytes, then it re-indexes.
  function pickReplacement(id: string) {
    replaceTargetRef.current = id
    replaceInputRef.current?.click()
  }

  async function handleReplaceFile(file: File) {
    const id = replaceTargetRef.current
    if (!id) return
    setError(null)
    setReplacing(id)
    try {
      await replaceDocumentSource(entityRef, id, file)
      setDocs((d) => d.map((x) => (x.id === id ? { ...x, indexStatus: "pending", hasFile: true } : x)))
    } catch (e) {
      setError(`Couldn't re-upload ${file.name}: ${(e as Error).message}`)
    } finally {
      setReplacing(null)
      replaceTargetRef.current = null
    }
    startTransition(() => router.refresh())
  }

  async function handleCategory(id: string, category: DocumentCategory) {
    setError(null)
    setDocs((d) => d.map((x) => (x.id === id ? { ...x, category } : x)))
    try {
      await updateDocumentCategoryAction({ ...entityRef, documentId: id, category })
    } catch (e) {
      setError((e as Error).message)
    }
    startTransition(() => router.refresh())
  }

  const groups = DOCUMENT_CATEGORIES.map((cat) => ({
    cat,
    items: docs.filter((d) => d.category === cat),
  })).filter((g) => g.items.length > 0)

  return (
    <Card
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files)
      }}
      className={cn(dragOver && "ring-2 ring-primary")}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Files ({docs.length})</CardTitle>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void handleFiles(e.target.files)
              e.target.value = ""
            }}
          />
          <input
            ref={replaceInputRef}
            type="file"
            data-testid="replace-file-input"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleReplaceFile(f)
              e.target.value = ""
            }}
          />
          <DriveImportButton
            target={entityRef}
            onFileStart={(n) => setUploading((u) => [...u, n])}
            onFileDone={(n) => setUploading((u) => u.filter((x) => x !== n))}
            onError={setError}
            onComplete={() => startTransition(() => router.refresh())}
          />
          <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
            <Upload className="size-4" />
            Upload
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {uploading.map((n) => (
          <div key={n} className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Uploading {n}…
          </div>
        ))}

        {docs.length === 0 && uploading.length === 0 && (
          <div
            className={cn(
              "rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground transition-colors",
              dragOver && "border-primary text-foreground",
            )}
          >
            Drop a file here, or use Upload — RFPs, proposals, brand guidelines…
          </div>
        )}

        {groups.map(({ cat, items }) => (
          <div key={cat} className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {labelFor(cat)} ({items.length})
            </p>
            <div className="divide-y divide-border">
              {items.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{doc.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.sizeBytes != null && `${formatBytes(doc.sizeBytes)} · `}
                        {formatDate(doc.uploadedAt)}
                        {!doc.hasFile && " · Drive link"}
                      </p>
                      {doc.indexStatus === "skipped" && (
                        <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-amber-600">
                          <AlertTriangle className="size-3 shrink-0" /> Source file missing — re-upload to index
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Select
                      value={doc.category}
                      onValueChange={(v) => void handleCategory(doc.id, String(v) as DocumentCategory)}
                    >
                      <SelectTrigger className="h-8 w-[150px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {labelFor(c)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {doc.indexStatus === "skipped" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-amber-600 hover:text-amber-700"
                        disabled={replacing === doc.id}
                        onClick={() => pickReplacement(doc.id)}
                        aria-label={`Re-upload ${doc.name}`}
                      >
                        {replacing === doc.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <RotateCcw className="size-4" />
                        )}
                      </Button>
                    )}
                    {(doc.hasFile || doc.driveLinkUrl) && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        onClick={() => void handleDownload(doc.id)}
                        aria-label={`Download ${doc.name}`}
                      >
                        <Download className="size-4" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setPendingDelete(doc)}
                      aria-label={`Delete ${doc.name}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete file</DialogTitle>
            <DialogDescription>
              Delete “{pendingDelete?.name}”? This permanently removes the file
              and can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const target = pendingDelete
                setPendingDelete(null)
                if (target) void handleDelete(target.id)
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
