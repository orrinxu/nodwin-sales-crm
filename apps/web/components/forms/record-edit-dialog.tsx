"use client"

import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface RecordEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The element that opens the dialog (a Button). Omit for fully-controlled use. */
  trigger?: React.ReactElement
  title: string
  description?: string
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  /** Footer action row (e.g. Cancel + Save). Rendered in a sticky footer. */
  footer: React.ReactNode
  children: React.ReactNode
  /** Width override; defaults to a roomy two-column-friendly modal. */
  contentClassName?: string
}

/**
 * The shared shell for FULL record edits: a wide, centered modal with a header,
 * a scrollable two-column-friendly body, and a sticky footer. Replaces the
 * narrow right-hand slide-over (Sheet) that crammed ~25 fields into ~384px.
 * The slim Sheet is reserved for the small per-entity "quick edit" subset.
 */
export function RecordEditDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  onSubmit,
  footer,
  children,
  contentClassName,
}: RecordEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent
        className={cn(
          // Wide on desktop (≈82% of viewport, capped), full-height-safe at 90vh.
          // The dialog sizes to content and only reaches the cap (and scrolls)
          // when the content genuinely overflows — which on desktop, with the
          // 3-column field grid, it should not.
          "flex max-h-[90vh] w-[82vw] max-w-[1400px] flex-col gap-0 overflow-hidden p-0 text-[15px]",
          contentClassName,
        )}
      >
        <DialogHeader className="border-b px-6 py-4 pr-12">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          {/* Sizes to content (no scroll) until it exceeds the 90vh cap — then
              scrolls. On desktop it fits; on mobile (1 column) it scrolls. */}
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5 [&_input]:text-[15px] [&_textarea]:text-[15px]">
            {children}
          </div>
          <div className="flex flex-col-reverse gap-2 border-t bg-muted/50 px-6 py-3 sm:flex-row sm:justify-end">
            {footer}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
