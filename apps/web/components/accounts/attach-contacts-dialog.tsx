"use client"

import { useState, useMemo } from "react"
import { UserPlus, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ContactPickerOption } from "@/lib/data/contacts"

interface AttachContactsDialogProps {
  accountId: string
  attachableContacts: ContactPickerOption[]
  attachAction: (accountId: string, input: { contactIds: string[] }) => Promise<void>
  createAction: (accountId: string, input: unknown) => Promise<unknown>
  onDone: () => void
}

function tabClass(active: boolean) {
  return `px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
    active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
  }`
}

export function AttachContactsDialog({
  accountId,
  attachableContacts,
  attachAction,
  createAction,
  onDone,
}: AttachContactsDialogProps) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<"existing" | "new">("existing")
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [title, setTitle] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return attachableContacts
    return attachableContacts.filter(
      (c) => c.fullName.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q),
    )
  }, [attachableContacts, query])

  function reset() {
    setTab("existing")
    setQuery("")
    setSelected(new Set())
    setError(null)
    setName("")
    setEmail("")
    setTitle("")
  }
  function handleOpenChange(o: boolean) {
    setOpen(o)
    if (!o) reset()
  }
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleAttach() {
    if (selected.size === 0) return
    setPending(true)
    setError(null)
    try {
      await attachAction(accountId, { contactIds: Array.from(selected) })
      handleOpenChange(false)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to attach contacts")
    } finally {
      setPending(false)
    }
  }

  async function handleCreate() {
    if (name.trim() === "") {
      setError("Full name is required")
      return
    }
    setPending(true)
    setError(null)
    try {
      await createAction(accountId, {
        fullName: name.trim(),
        email: email.trim() || null,
        title: title.trim() || null,
      })
      handleOpenChange(false)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create contact")
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" />
        Attach
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attach contacts</DialogTitle>
            <DialogDescription>
              Link existing contacts to this account, or create a new one attached to it.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-1 border-b">
            <button type="button" onClick={() => setTab("existing")} className={tabClass(tab === "existing")}>
              Existing
            </button>
            <button type="button" onClick={() => setTab("new")} className={tabClass(tab === "new")}>
              New contact
            </button>
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 p-2 text-sm text-destructive">{error}</div>
          )}

          {tab === "existing" ? (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search contacts..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
              <div className="max-h-64 divide-y overflow-y-auto rounded-lg border">
                {filtered.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    {attachableContacts.length === 0
                      ? "No other contacts available to attach."
                      : "No contacts match your search."}
                  </p>
                ) : (
                  filtered.map((c) => (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-2 p-2 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selected.has(c.id)}
                        onCheckedChange={() => toggle(c.id)}
                        aria-label={`Select ${c.fullName}`}
                      />
                      <span className="flex-1">
                        <span className="text-sm font-medium">{c.fullName}</span>
                        {c.title && <span className="text-xs text-muted-foreground"> · {c.title}</span>}
                        {c.email && <span className="block text-xs text-muted-foreground">{c.email}</span>}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-1.5">
                <Label htmlFor="ac-name">
                  Full Name <span className="text-destructive">*</span>
                </Label>
                <Input id="ac-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Contact name" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ac-email">Email</Label>
                <Input id="ac-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ac-title">Title</Label>
                <Input id="ac-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Head of Procurement" />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            {tab === "existing" ? (
              <Button type="button" onClick={handleAttach} disabled={pending || selected.size === 0}>
                {pending ? "Attaching..." : `Attach${selected.size > 0 ? ` (${selected.size})` : ""}`}
              </Button>
            ) : (
              <Button type="button" onClick={handleCreate} disabled={pending || name.trim() === ""}>
                {pending ? "Creating..." : "Create & attach"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
