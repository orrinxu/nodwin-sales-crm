"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import type { FieldDefinition } from "@/lib/data/field-definitions.types"

interface CustomFieldsDisplayProps {
  fieldDefinitions: FieldDefinition[]
  customData: Record<string, unknown>
}

function formatValue(value: unknown, def: FieldDefinition): string {
  if (value === null || value === undefined) return "—"

  switch (def.dataType) {
    case "boolean":
      return value ? "Yes" : "No"
    case "date":
      return new Date(value as string).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    case "datetime":
      return new Date(value as string).toLocaleString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    case "currency":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(value as number)
    case "number":
      return new Intl.NumberFormat("en-US").format(value as number)
    case "url":
      return value as string
    case "multi_select":
      return Array.isArray(value) ? value.join(", ") : String(value)
    case "single_select":
      return String(value)
    default:
      return String(value)
  }
}

function renderValue(value: unknown, def: FieldDefinition) {
  const formatted = formatValue(value, def)

  if (formatted === "—") return formatted

  if (def.dataType === "url") {
    const href = String(value)
    if (href.startsWith("http://") || href.startsWith("https://")) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          {(() => {
            try {
              return new URL(href).hostname
            } catch {
              return href
            }
          })()}
        </a>
      )
    }
    return href
  }

  if (def.dataType === "boolean") {
    return (
      <span
        className={
          value ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
        }
      >
        {formatted}
      </span>
    )
  }

  if (def.dataType === "multi_select" && Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1">
        {(value as string[]).map((v) => (
          <span
            key={v}
            className="inline-flex items-center rounded-md border bg-muted px-2 py-0.5 text-xs"
          >
            {v}
          </span>
        ))}
      </div>
    )
  }

  if (def.dataType === "single_select") {
    return (
      <span className="inline-flex items-center rounded-md border bg-muted px-2 py-0.5 text-xs">
        {formatted}
      </span>
    )
  }

  return <span className="whitespace-pre-wrap text-sm">{formatted}</span>
}

export function CustomFieldsDisplay({
  fieldDefinitions,
  customData,
}: CustomFieldsDisplayProps) {
  if (fieldDefinitions.length === 0) return null

  const hasValues = fieldDefinitions.some((def) => customData[def.key] !== undefined && customData[def.key] !== null)
  if (!hasValues) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custom Fields</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 sm:grid-cols-2">
          {fieldDefinitions.map((def) => {
            const value = customData[def.key]
            if (value === undefined || value === null) return null
            return (
              <div key={def.id} className="grid gap-1.5">
                <Label className="text-muted-foreground text-xs">
                  {def.label}
                </Label>
                {renderValue(value, def)}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
