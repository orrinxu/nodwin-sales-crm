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
  /**
   * "wide" (default): big record editors — ~82vw up to 1400px, 3-column-friendly.
   * "md": smaller config editors (a handful of fields) — ~2xl, so they aren't
   * absurdly wide for 2–4 fields while keeping the same chrome.
   */
  size?: "wide" | "md"
  /** Extra width/style override on the panel. */
  contentClassName?: string
}

// NB: DialogContent's base caps the panel at `sm:max-w-sm` from 640px up, and an
// unprefixed max-w does NOT override a `sm:`-prefixed one in tailwind-merge — so
// the `sm:` variant must be set explicitly or the panel stays ~384px.
const sizeClass = (size: "wide" | "md") =>
  size === "md"
    ? "w-[92vw] max-w-2xl sm:max-w-2xl"
    : "w-[82vw] max-w-[1400px] sm:max-w-[1400px]"

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
  size = "wide",
  contentClassName,
}: RecordEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent
        className={cn(
          // Sizes to content and only reaches the 90vh cap (and scrolls) when the
          // content genuinely overflows — which on desktop, with the responsive
          // field grid, it should not.
          "flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 text-[15px]",
          sizeClass(size),
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
