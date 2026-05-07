"use client"

import type { FieldDefinition } from "@/lib/data/field-definitions"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface CustomFieldsFormProps {
  fieldDefinitions: FieldDefinition[]
  values: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  errors: Record<string, string | undefined>
}

export function CustomFieldsForm({
  fieldDefinitions,
  values,
  onChange,
  errors,
}: CustomFieldsFormProps) {
  if (fieldDefinitions.length === 0) return null

  return (
    <div className="space-y-4">
      <div className="border-b pb-2">
        <h3 className="text-sm font-medium">Custom Fields</h3>
      </div>
      {fieldDefinitions.map((def) => (
        <FieldInput
          key={def.id}
          definition={def}
          value={values[def.key]}
          onChange={(v) => onChange(def.key, v)}
          error={errors[def.key]}
        />
      ))}
    </div>
  )
}

interface FieldInputProps {
  definition: FieldDefinition
  value: unknown
  onChange: (value: unknown) => void
  error?: string
}

function FieldInput({ definition: def, value, onChange, error }: FieldInputProps) {
  const currentValue = value ?? def.defaultValue ?? ""

  switch (def.dataType) {
    case "text":
    case "url":
      return (
        <div className="grid gap-1.5">
          <Label htmlFor={`cf-${def.key}`}>
            {def.label}
            {def.required && <span className="text-destructive"> *</span>}
          </Label>
          <Input
            id={`cf-${def.key}`}
            type={def.dataType === "url" ? "url" : "text"}
            value={currentValue as string}
            onChange={(e) => onChange(e.target.value || null)}
            placeholder={def.label}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )

    case "number":
    case "currency":
      return (
        <div className="grid gap-1.5">
          <Label htmlFor={`cf-${def.key}`}>
            {def.label}
            {def.required && <span className="text-destructive"> *</span>}
          </Label>
          <div className="relative">
            {def.dataType === "currency" && (
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
            )}
            <Input
              id={`cf-${def.key}`}
              type="number"
              value={currentValue === "" || currentValue === null ? "" : String(currentValue)}
              onChange={(e) => {
                const val = e.target.value
                onChange(val === "" ? null : Number(val))
              }}
              placeholder={def.label}
              className={def.dataType === "currency" ? "pl-6" : ""}
              step={def.dataType === "currency" ? "0.01" : "1"}
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )

    case "date":
      return (
        <div className="grid gap-1.5">
          <Label htmlFor={`cf-${def.key}`}>
            {def.label}
            {def.required && <span className="text-destructive"> *</span>}
          </Label>
          <Input
            id={`cf-${def.key}`}
            type="date"
            value={currentValue as string}
            onChange={(e) => onChange(e.target.value || null)}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )

    case "datetime":
      return (
        <div className="grid gap-1.5">
          <Label htmlFor={`cf-${def.key}`}>
            {def.label}
            {def.required && <span className="text-destructive"> *</span>}
          </Label>
          <Input
            id={`cf-${def.key}`}
            type="datetime-local"
            value={currentValue as string}
            onChange={(e) => onChange(e.target.value || null)}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )

    case "boolean":
      return (
        <div className="flex items-center gap-2">
          <input
            id={`cf-${def.key}`}
            type="checkbox"
            className="size-4 rounded border-input accent-primary"
            checked={!!currentValue}
            onChange={(e) => onChange(e.target.checked)}
          />
          <Label htmlFor={`cf-${def.key}`} className="cursor-pointer">
            {def.label}
            {def.required && <span className="text-destructive"> *</span>}
          </Label>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )

    case "single_select":
      return (
        <div className="grid gap-1.5">
          <Label htmlFor={`cf-${def.key}`}>
            {def.label}
            {def.required && <span className="text-destructive"> *</span>}
          </Label>
          <select
            id={`cf-${def.key}`}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value={currentValue as string}
            onChange={(e) => onChange(e.target.value || null)}
          >
            <option value="">Select...</option>
            {(def.options ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )

    case "multi_select":
      return (
        <div className="grid gap-1.5">
          <Label>
            {def.label}
            {def.required && <span className="text-destructive"> *</span>}
          </Label>
          <div className="space-y-1">
            {(def.options ?? []).map((opt) => {
              const selected = Array.isArray(currentValue) && (currentValue as string[]).includes(opt)
              return (
                <label
                  key={opt}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input accent-primary"
                    checked={selected}
                    onChange={() => {
                      const current = Array.isArray(currentValue) ? [...(currentValue as string[])] : []
                      if (selected) {
                        onChange(current.filter((v) => v !== opt))
                      } else {
                        onChange([...current, opt])
                      }
                    }}
                  />
                  {opt}
                </label>
              )
            })}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )

    case "rich_text":
      return (
        <div className="grid gap-1.5">
          <Label htmlFor={`cf-${def.key}`}>
            {def.label}
            {def.required && <span className="text-destructive"> *</span>}
          </Label>
          <textarea
            id={`cf-${def.key}`}
            className="min-h-[80px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-y placeholder:text-muted-foreground"
            value={currentValue as string}
            onChange={(e) => onChange(e.target.value || null)}
            placeholder={def.label}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )

    default:
      return (
        <div className="grid gap-1.5">
          <Label htmlFor={`cf-${def.key}`}>
            {def.label}
            {def.required && <span className="text-destructive"> *</span>}
          </Label>
          <Input
            id={`cf-${def.key}`}
            value={currentValue as string}
            onChange={(e) => onChange(e.target.value || null)}
            placeholder={def.label}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )
  }
}
