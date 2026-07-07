"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { BookmarkIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type {
  SavedViewRecord,
  SavedViewFilters,
  SavedViewScope,
} from "@/lib/data/saved-views"

interface SavedViewsMenuProps {
  savedViews: SavedViewRecord[]
  scope: SavedViewScope
  /** The live filter state, serialized — what "Save current view" persists. */
  currentFilters: SavedViewFilters
  /** True when the live filters differ from pristine (gates saving). */
  canSave: boolean
  /** Restore a saved view's filters into the table. */
  onApply: (filters: SavedViewFilters) => void
  saveViewAction: (input: {
    name: string
    scope: SavedViewScope
    filters: SavedViewFilters
  }) => Promise<SavedViewRecord>
  deleteSavedViewAction: (id: string) => Promise<void>
}

/**
 * "Views" control for the opportunity list: apply a saved filter combination,
 * save the current one under a name (overwriting a same-named view), or delete a
 * view. Mutations go through server actions, then `router.refresh()` re-pulls the
 * server-rendered list so the menu reflects the new set.
 */
export function SavedViewsMenu({
  savedViews,
  scope,
  currentFilters,
  canSave,
  onApply,
  saveViewAction,
  deleteSavedViewAction,
}: SavedViewsMenuProps) {
  const router = useRouter()
  const [saveOpen, setSaveOpen] = useState(false)
  const [name, setName] = useState("")
  const [isPending, startTransition] = useTransition()

  const handleSave = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    startTransition(async () => {
      await saveViewAction({ name: trimmed, scope, filters: currentFilters })
      setName("")
      setSaveOpen(false)
      router.refresh()
    })
  }

  const handleDelete = (id: string) => {
    startTransition(async () => {
      await deleteSavedViewAction(id)
      router.refresh()
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
          <BookmarkIcon className="size-4" />
          Views
          {savedViews.length > 0 ? (
            <span className="ml-1 text-xs text-muted-foreground tabular-nums">
              {savedViews.length}
            </span>
          ) : null}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {savedViews.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              No saved views yet
            </div>
          ) : (
            savedViews.map((view) => (
              <DropdownMenuItem
                key={view.id}
                onClick={() => onApply(view.filters)}
                className="flex items-center justify-between gap-2"
              >
                <span className="truncate">{view.name}</span>
                <button
                  type="button"
                  aria-label={`Delete view ${view.name}`}
                  disabled={isPending}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleDelete(view.id)
                  }}
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!canSave}
            onClick={() => setSaveOpen(true)}
          >
            <PlusIcon className="size-4" />
            Save current view…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
            <DialogDescription>
              Name this filter combination so you can re-apply it later. Saving
              over an existing name replaces it.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              autoFocus
              placeholder="e.g. My hot deals"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave()
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSaveOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending || name.trim() === ""}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
