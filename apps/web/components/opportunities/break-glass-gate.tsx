"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ShieldAlert, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { breakGlassConfidentialAction } from "@/app/(crm)/opportunities/actions"

// Break-glass entry (ORR-716). Rendered by the deal page in place of a 404 when an
// exec has a Confidential deal's link but no access yet. A reason is mandatory; on
// success the page refreshes and the now-entitled deal loads. Everyone already on
// the deal is notified server-side; the grant is audit-logged.
export function BreakGlassGate({
  opportunityId,
  opportunityName,
  ownerName,
}: {
  opportunityId: string
  opportunityName: string
  ownerName: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await breakGlassConfidentialAction({ opportunityId, reason })
      if (res.ok) {
        setOpen(false)
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <div className="mx-auto max-w-lg p-8">
      <div className="flex flex-col items-center gap-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-8 text-center">
        <ShieldAlert className="size-10 text-amber-500" />
        <div>
          <h1 className="text-lg font-semibold">Confidential deal</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            &ldquo;{opportunityName}&rdquo;{ownerName ? ` (owner: ${ownerName})` : ""} is a
            Confidential deal and you don&apos;t have access. As a founder you can break-glass to
            grant yourself access — this is <strong>logged</strong> and the deal&apos;s named list
            is <strong>notified</strong>.
          </p>
        </div>
        <Button variant="outline" onClick={() => { setReason(""); setError(null); setOpen(true) }}>
          <ShieldAlert className="size-4" /> Break-glass access (logged)
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Break-glass into &ldquo;{opportunityName}&rdquo;</DialogTitle>
            <DialogDescription>
              This grants you access to this one Confidential deal. It&apos;s recorded with your
              name and reason, and everyone already on the deal is notified.
            </DialogDescription>
          </DialogHeader>
          <label htmlFor="break-glass-reason" className="text-sm font-medium">Reason (required)</label>
          <textarea
            id="break-glass-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why do you need access to this deal?"
            className="w-full resize-y rounded-md border bg-transparent p-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" onClick={submit} disabled={pending || !reason.trim()}>
              {pending ? <><Loader2 className="size-4 animate-spin" /> Granting…</> : "Confirm break-glass"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
