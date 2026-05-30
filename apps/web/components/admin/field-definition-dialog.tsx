"use client"

import { useState } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  fieldDataTypes,
  fieldEntityTypes,
  type CreateFieldDefinitionInput,
} from "@/lib/data/field-definitions.types"

const formSchema = z.object({
  entityType: z.enum(fieldEntityTypes, { required_error: "Entity type is required" }),
  label: z.string().min(1, "Label is required").max(200),
  dataType: z.enum(fieldDataTypes, { required_error: "Data type is required" }),
  options: z.string(),
  required: z.boolean(),
  displayOrder: z.coerce.number().int().min(0),
})

type FormData = z.infer<typeof formSchema>

function entityLabel(entity: string): string {
  return entity.charAt(0).toUpperCase() + entity.slice(1)
}

function dataTypeLabel(dt: string): string {
  return dt.replace(/_/g, " ")
}

interface FieldDefinitionDialogProps {
  createAction: (input: CreateFieldDefinitionInput) => Promise<void>
}

export function FieldDefinitionDialog({ createAction }: FieldDefinitionDialogProps) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      entityType: "account",
      label: "",
      dataType: "text",
      options: "",
      required: false,
      displayOrder: 0,
    },
  })

  const watchedDataType = form.watch("dataType")
  const showOptions =
    watchedDataType === "single_select" || watchedDataType === "multi_select"

  async function onSubmit(data: FormData) {
    setPending(true)
    setError(null)
    try {
      const isSelectType =
        data.dataType === "single_select" || data.dataType === "multi_select"
      await createAction({
        entityType: data.entityType,
        label: data.label,
        dataType: data.dataType,
        options: isSelectType
          ? data.options
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : null,
        required: data.required,
        displayOrder: data.displayOrder,
      })
      form.reset()
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create field definition.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="default" size="sm" />}>
        <PlusIcon className="h-4 w-4" />
        Add Custom Field
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Create Custom Field</DialogTitle>
            <DialogDescription>
              Define a new custom field for an entity type.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="entity-type">
                Entity Type <span className="text-destructive">*</span>
              </Label>
              <Controller
                control={form.control}
                name="entityType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="entity-type" data-testid="entity-type-select-trigger">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fieldEntityTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {entityLabel(type)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.entityType && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.entityType.message}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="label">
                Label <span className="text-destructive">*</span>
              </Label>
              <Input
                id="label"
                {...form.register("label")}
                placeholder="e.g. Deal Size"
              />
              {form.formState.errors.label && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.label.message}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="data-type">
                Data Type <span className="text-destructive">*</span>
              </Label>
              <Controller
                control={form.control}
                name="dataType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="data-type" data-testid="data-type-select-trigger">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fieldDataTypes.map((dt) => (
                        <SelectItem key={dt} value={dt}>
                          {dataTypeLabel(dt)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.dataType && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.dataType.message}
                </p>
              )}
            </div>

            {showOptions && (
              <div className="grid gap-2">
                <Label htmlFor="options">Options (comma-separated)</Label>
                <Input
                  id="options"
                  {...form.register("options")}
                  placeholder="Option 1, Option 2, Option 3"
                />
                {form.formState.errors.options && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.options.message}
                  </p>
                )}
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="display-order">Display Order</Label>
              <Input
                id="display-order"
                type="number"
                min={0}
                {...form.register("displayOrder")}
              />
              {form.formState.errors.displayOrder && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.displayOrder.message}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Controller
                control={form.control}
                name="required"
                render={({ field }) => (
                  <Checkbox
                    id="required"
                    checked={field.value}
                    onCheckedChange={(value) => field.onChange(!!value)}
                  />
                )}
              />
              <Label htmlFor="required">Required</Label>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
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
