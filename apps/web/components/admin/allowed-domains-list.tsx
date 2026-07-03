"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { PlusIcon, Trash2Icon, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { AllowedDomainRecord } from "@/lib/data/allowed-domains"

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(dateStr))
  } catch {
    return dateStr
  }
}

interface AllowedDomainsListProps {
  domains: AllowedDomainRecord[]
  createAction: (input: { domain: string }) => Promise<AllowedDomainRecord>
  deleteAction: (id: string) => Promise<void>
}

function DeleteDomainDialog({
  domain,
  open,
  onOpenChange,
  deleteAction,
}: {
  domain: AllowedDomainRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
  deleteAction: AllowedDomainsListProps["deleteAction"]
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (!domain) return
    setPending(true)
    setError(null)
    try {
      await deleteAction(domain.id)
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove domain.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove allowed domain</DialogTitle>
          <DialogDescription>
            Remove &ldquo;{domain?.domain}&rdquo; from the sign-in allow-list? New sign-ups
            from this domain will be rejected, and existing users on this domain will be
            unable to sign in.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={pending}>
            {pending ? "Removing..." : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AllowedDomainsList({
  domains,
  createAction,
  deleteAction,
}: AllowedDomainsListProps) {
  const router = useRouter()
  const [value, setValue] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingDomain, setDeletingDomain] = useState<AllowedDomainRecord | null>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!value.trim()) return
    setPending(true)
    setError(null)
    try {
      await createAction({ domain: value })
      setValue("")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add domain.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Allowed Sign-in Domains</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Only Google accounts whose email domain is on this list can sign in. Add a domain
          when onboarding a new group entity or M&amp;A acquisition.
        </p>
      </div>

      <form onSubmit={handleAdd} className="flex flex-wrap items-start gap-2">
        <div className="flex-1 sm:max-w-xs">
          <Input
            aria-label="Domain"
            placeholder="e.g. nodwin.com"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              if (error) setError(null)
            }}
          />
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
        <Button type="submit" disabled={pending || !value.trim()}>
          <PlusIcon className="h-4 w-4" />
          {pending ? "Adding..." : "Add domain"}
        </Button>
      </form>

      {domains.length > 0 ? (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="w-20 text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {domains.map((domain) => (
                <TableRow key={domain.id}>
                  <TableCell className="font-medium">{domain.domain}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(domain.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeletingDomain(domain)}
                      aria-label={`Remove ${domain.domain}`}
                    >
                      <Trash2Icon className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <Card className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <ShieldCheck className="size-10 text-muted-foreground" />
            <div>
              <h2 className="text-base font-medium">No allowed domains</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Add a domain above so users can sign in.
              </p>
            </div>
          </div>
        </Card>
      )}

      <DeleteDomainDialog
        domain={deletingDomain}
        open={!!deletingDomain}
        onOpenChange={(open) => { if (!open) setDeletingDomain(null) }}
        deleteAction={deleteAction}
      />
    </div>
  )
}
