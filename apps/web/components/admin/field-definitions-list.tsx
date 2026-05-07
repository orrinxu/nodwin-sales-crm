"use client"

import { useMemo } from "react"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table"

import type { FieldDefinition, CreateFieldDefinitionInput } from "@/lib/data/field-definitions"
import { FieldDefinitionDialog } from "@/components/admin/field-definition-dialog"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface FieldDefinitionsListProps {
  fieldDefinitions: FieldDefinition[]
  createAction: (input: CreateFieldDefinitionInput) => Promise<void>
}

function getDataTypeVariant(dt: string): "default" | "secondary" | "outline" | "destructive" {
  switch (dt) {
    case "text":
    case "currency":
    case "boolean":
      return "default"
    case "rich_text":
    case "date":
    case "datetime":
    case "user_ref":
    case "account_ref":
      return "secondary"
    case "number":
    case "single_select":
    case "multi_select":
    case "url":
      return "outline"
    case "formula":
      return "destructive"
    default:
      return "outline"
  }
}

export function FieldDefinitionsList({
  fieldDefinitions,
  createAction,
}: FieldDefinitionsListProps) {
  const columns: ColumnDef<FieldDefinition>[] = useMemo(
    () => [
      {
        accessorKey: "entityType",
        header: "Entity",
        cell: ({ row }) => (
          <Badge variant="secondary" className="capitalize">
            {row.getValue<string>("entityType")}
          </Badge>
        ),
      },
      {
        accessorKey: "key",
        header: "Key",
        cell: ({ row }) => (
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
            {row.getValue<string>("key")}
          </code>
        ),
      },
      {
        accessorKey: "label",
        header: "Label",
        cell: ({ row }) => (
          <span className="font-medium">{row.getValue<string>("label")}</span>
        ),
      },
      {
        accessorKey: "dataType",
        header: "Type",
        cell: ({ row }) => {
          const dt = row.getValue<string>("dataType")
          return (
            <Badge variant={getDataTypeVariant(dt)}>
              {dt.replace(/_/g, " ")}
            </Badge>
          )
        },
      },
      {
        accessorKey: "required",
        header: "Required",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.getValue<boolean>("required") ? "Yes" : "No"}
          </span>
        ),
      },
      {
        accessorKey: "active",
        header: "Active",
        cell: ({ row }) =>
          row.getValue<boolean>("active") ? (
            <Badge variant="default">Active</Badge>
          ) : (
            <Badge variant="outline">Inactive</Badge>
          ),
      },
    ],
    [],
  )

  const table = useReactTable({
    data: fieldDefinitions,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-6 py-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Custom Fields
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage custom field definitions across all entity types.
          </p>
        </div>
        <FieldDefinitionDialog createAction={createAction} />
      </div>

      <div className="flex-1 p-6">
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length > 0 ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No custom fields defined yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
