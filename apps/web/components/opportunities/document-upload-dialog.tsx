"use client"

import { useState } from "react"
import { Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DOCUMENT_CATEGORIES, getCategoryLabel } from "@/lib/data/documents.types"
import type { DocumentCategory } from "@/lib/data/documents.types"

interface DocumentUploadDialogProps {
  opportunityId: string
  createAction: (opportunityId: string, input: unknown) => Promise<unknown>
}

export function DocumentUploadDialog({
  opportunityId,
  createAction,
}: DocumentUploadDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [category, setCategory] = useState<DocumentCategory>("other")
  const [linkUrl, setLinkUrl] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError("Document name is required.")
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await createAction(opportunityId, {
        name: name.trim(),
        category,
        linkUrl: linkUrl.trim() || null,
      })
      setName("")
      setCategory("other")
      setLinkUrl("")
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload document.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Upload className="size-4" />
        Upload Document
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>
              Add a document reference to this opportunity.
              {!linkUrl.trim() && (
                <>
                  {" "}
                  Google Drive integration is coming in a future update — you can
                  provide a link URL for now.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="doc-name">Document Name</Label>
              <Input
                id="doc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Signed MSA"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="doc-category">Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as DocumentCategory)}
              >
                <SelectTrigger id="doc-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {getCategoryLabel(cat)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="doc-link">
                Link URL <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="doc-link"
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://drive.google.com/..."
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <DialogFooter showCloseButton>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
