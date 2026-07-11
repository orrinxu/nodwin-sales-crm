"use client"

import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface SaveBarProps {
  /** Whether there are unsaved changes — controls the slide-in. */
  open: boolean
  /** Left-hand message. Defaults to a generic unsaved-changes line. */
  message?: React.ReactNode
  onSave: () => void
  onDiscard: () => void
  /** Disables the actions and shows a saving state. */
  saving?: boolean
  saveLabel?: string
  discardLabel?: string
  className?: string
}

/**
 * App-wide unified unsaved-changes bar (convention G1). A form/section tracks its
 * own dirty state (see admin `role-matrix.ts` for the "n changed" dirty-diff prior
 * art) and renders one of these; it slides up from the bottom while there are
 * unsaved changes and offers Save / Discard. Not autosave.
 */
export function SaveBar({
  open,
  message,
  onSave,
  onDiscard,
  saving = false,
  saveLabel = "Save changes",
  discardLabel = "Discard",
  className,
}: SaveBarProps) {
  return (
    <div
      role="region"
      aria-label="Unsaved changes"
      aria-hidden={!open}
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-4 border-t border-border bg-card px-6 py-3 shadow-[0_-6px_20px_rgba(0,0,0,0.05)] transition-transform duration-200 motion-reduce:transition-none",
        open ? "translate-y-0" : "pointer-events-none translate-y-full",
        className,
      )}
    >
      <div className="flex items-center gap-2.5 text-sm font-medium">
        <span className="size-2 shrink-0 rounded-full bg-warning" aria-hidden />
        {message ?? "You have unsaved changes."}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
          {discardLabel}
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {saving ? "Saving…" : saveLabel}
        </Button>
      </div>
    </div>
  )
}
