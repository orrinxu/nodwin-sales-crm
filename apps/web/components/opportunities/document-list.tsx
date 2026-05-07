"use client"

import { FileText, ExternalLink } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { DocumentRecord } from "@/lib/data/documents.types"
import { getCategoryLabel } from "@/lib/data/documents.types"

interface DocumentListProps {
  documents: DocumentRecord[]
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function DocumentList({ documents }: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <FileText className="mx-auto size-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">
            No documents yet. Click &quot;Upload Document&quot; to add one.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center gap-3 rounded-lg border p-3"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
              <FileText className="size-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{doc.name}</span>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {getCategoryLabel(doc.category)}
                </Badge>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{doc.uploadedByName ?? "Unknown"}</span>
                <span>·</span>
                <span>{formatDate(doc.uploadedAt)}</span>
              </div>
            </div>
            {doc.linkUrl && (
              <a
                href={doc.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Open document"
              >
                <ExternalLink className="size-4" />
              </a>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
