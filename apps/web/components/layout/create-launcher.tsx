"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Briefcase, Building2, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"

// Global "Create new" launcher (Track C / gate G7, ORR-746). One reusable
// record-type chooser in the header — NOT a command palette (absent by design).
// Each item routes to the record's list page with ?create=1; that page's existing
// generator reads the flag (useAutoOpenCreate) and opens its chooser, so voice /
// text / document creation starts from anywhere without duplicating page data in
// the layout. A guarded "c" shortcut opens the menu. Deferred: dashboard-tile and
// command-palette mounts, AI type-inference (the rep picks the type here in v1).

const ITEMS = [
  { key: "opportunity", label: "New opportunity", href: "/opportunities?create=1", Icon: Briefcase },
  { key: "account", label: "New account", href: "/accounts?create=1", Icon: Building2 },
  { key: "contact", label: "New contact", href: "/contacts?create=1", Icon: User },
] as const

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable
}

export function CreateLauncher() {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const go = useCallback(
    (href: string) => {
      setOpen(false)
      router.push(href)
    },
    [router],
  )

  // "c" opens the create menu (Linear-style), ignored while typing or when a
  // modifier is held (so it never hijacks Ctrl/Cmd+C).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key !== "c" && e.key !== "C") return
      if (isEditableTarget(e.target)) return
      e.preventDefault()
      setOpen(true)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" aria-label="Create new" title="Create new (c)">
            <Plus />
            <span className="hidden sm:inline">New</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-48">
        {ITEMS.map(({ key, label, href, Icon }) => (
          <DropdownMenuItem key={key} onClick={() => go(href)}>
            <Icon className="text-muted-foreground" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
