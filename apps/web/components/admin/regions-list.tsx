"use client"

import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/navigation"
import { Search, PlusIcon, PencilIcon, Trash2Icon, Map as MapIcon, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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
  DialogTrigger,
} from "@/components/ui/dialog"
import { Card } from "@/components/ui/card"
import type {
  RegionRecord,
  RegionCreateInput,
  RegionUpdateInput,
} from "@/lib/data/regions"

const codeField = z
  .string()
  .max(24)
  .regex(/^[A-Za-z0-9_-]*$/, "Code may contain only letters, numbers, hyphens and underscores")
  .optional()
  .or(z.literal(""))

const createFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  code: codeField,
})
type CreateFormData = z.infer<typeof createFormSchema>

const editFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  code: codeField,
})
type EditFormData = z.infer<typeof editFormSchema>

interface RegionsListProps {
  regions: RegionRecord[]
  createAction: (input: RegionCreateInput) => Promise<RegionRecord>
  updateAction: (id: string, input: RegionUpdateInput) => Promise<RegionRecord>
  deactivateAction: (id: string) => Promise<void>
}

function CreateRegionDialog({ createAction }: { createAction: RegionsListProps["createAction"] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<CreateFormData>({
    resolver: zodResolver(createFormSchema),
    defaultValues: { name: "", code: "" },
  })

  async function onSubmit(data: CreateFormData) {
    setPending(true)
    setError(null)
    try {
      await createAction({ name: data.name, code: data.code || null })
      form.reset()
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create region.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="default" size="sm" />}>
        <PlusIcon className="h-4 w-4" />
        Add Region
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg text-[15px]">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Create Region</DialogTitle>
            <DialogDescription>
              A region groups entities. A regional head sees deals across every entity in their region.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="region-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input id="region-name" {...form.register("name")} placeholder="e.g. South Asia" />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="region-code">Code</Label>
              <Input id="region-code" {...form.register("code")} placeholder="optional, e.g. SA" />
              {form.formState.errors.code && (
                <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>
              )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditRegionDialog({
  region,
  open,
  onOpenChange,
  updateAction,
}: {
  region: RegionRecord
  open: boolean
  onOpenChange: (open: boolean) => void
  updateAction: RegionsListProps["updateAction"]
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<EditFormData>({
    resolver: zodResolver(editFormSchema),
    defaultValues: { name: region.name, code: region.code ?? "" },
  })

  async function onSubmit(data: EditFormData) {
    setPending(true)
    setError(null)
    try {
      await updateAction(region.id, { name: data.name, code: data.code || null })
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update region.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg text-[15px]">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Edit Region</DialogTitle>
            <DialogDescription>Update details for &ldquo;{region.name}&rdquo;.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-region-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input id="edit-region-name" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-region-code">Code</Label>
              <Input id="edit-region-code" {...form.register("code")} />
              {form.formState.errors.code && (
                <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>
              )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeactivateRegionDialog({
  region,
  open,
  onOpenChange,
  deactivateAction,
}: {
  region: RegionRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
  deactivateAction: RegionsListProps["deactivateAction"]
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleDeactivate() {
    if (!region) return
    setPending(true)
    try {
      await deactivateAction(region.id)
      onOpenChange(false)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deactivate Region</DialogTitle>
          <DialogDescription>
            Deactivate &ldquo;{region?.name}&rdquo;? Entities keep their assignment, but the region
            no longer appears when assigning entities. Visibility already granted stays until the
            entities are reassigned.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDeactivate} disabled={pending}>
            {pending ? "Deactivating..." : "Deactivate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function RegionsList({ regions, createAction, updateAction, deactivateAction }: RegionsListProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [editing, setEditing] = useState<RegionRecord | null>(null)
  const [deactivating, setDeactivating] = useState<RegionRecord | null>(null)

  const filtered = useMemo(() => {
    if (!searchQuery) return regions
    const q = searchQuery.toLowerCase()
    return regions.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.code ?? "").toLowerCase().includes(q),
    )
  }, [regions, searchQuery])

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Regions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Group entities into regions. A regional head sees deals across every entity in their
            region (Confidential deals excluded). Assign entities to a region on the Entities page.
          </p>
        </div>
        <CreateRegionDialog createAction={createAction} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search regions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        {searchQuery && (
          <Button variant="ghost" size="sm" onClick={() => setSearchQuery("")}>
            <X />
            Clear
          </Button>
        )}
      </div>

      {filtered.length > 0 ? (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((region) => (
                <TableRow key={region.id}>
                  <TableCell className="font-medium">{region.name}</TableCell>
                  <TableCell>
                    {region.code ? (
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{region.code}</code>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {region.active ? <Badge variant="default">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(region)} aria-label={`Edit ${region.name}`}>
                        <PencilIcon className="h-4 w-4" />
                      </Button>
                      {region.active && (
                        <Button variant="ghost" size="icon" onClick={() => setDeactivating(region)} aria-label={`Deactivate ${region.name}`}>
                          <Trash2Icon className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <Card className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <MapIcon className="size-10 text-muted-foreground" />
            <div>
              <h2 className="text-base font-medium">
                {searchQuery ? "No matches" : "No regions yet"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {searchQuery
                  ? "No regions match your search."
                  : "Create a region, then assign entities to it on the Entities page."}
              </p>
            </div>
          </div>
        </Card>
      )}

      {editing && (
        <EditRegionDialog
          region={editing}
          open={!!editing}
          onOpenChange={(open) => { if (!open) setEditing(null) }}
          updateAction={updateAction}
        />
      )}
      <DeactivateRegionDialog
        region={deactivating}
        open={!!deactivating}
        onOpenChange={(open) => { if (!open) setDeactivating(null) }}
        deactivateAction={deactivateAction}
      />
    </div>
  )
}
