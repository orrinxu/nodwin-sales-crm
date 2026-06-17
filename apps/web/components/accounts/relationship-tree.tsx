"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"
import type { AccountRelationshipGraph, RelationshipTreeNode } from "@/lib/data/accounts"

const RELATIONSHIP_LABELS: Record<string, string> = {
  subsidiary_of: "Subsidiary of",
  procurement_via: "Procurement via",
  partner_with: "Partner with",
  parent_of: "Parent of",
  sister_company: "Sister company",
}

function relationshipBadgeVariant(kind: string): "default" | "secondary" | "outline" {
  switch (kind) {
    case "parent_of":
    case "subsidiary_of":
      return "default"
    case "partner_with":
    case "sister_company":
      return "secondary"
    case "procurement_via":
      return "outline"
    default:
      return "outline"
  }
}

function RelationshipNode({ node, depth }: { node: RelationshipTreeNode; depth: number }) {
  if (!node.children || node.children.length === 0) {
    return (
      <div
        className="flex items-center gap-2 py-1.5 pl-5"
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
      >
        {node.kind && (
          <Badge variant={relationshipBadgeVariant(node.kind)} className="text-xs shrink-0">
            {RELATIONSHIP_LABELS[node.kind] ?? node.kind}
            {node.direction === "inbound" && (
              <span className="ml-0.5 text-[10px] opacity-70">(in)</span>
            )}
          </Badge>
        )}
        <span className="text-sm">{node.accountName}</span>
    {node.notes && (
      <span className="text-xs text-muted-foreground truncate max-w-[200px]">
        {`\u2014 ${node.notes}`}
      </span>
    )}
      </div>
    )
  }

  return (
    <Collapsible defaultOpen>
      <div style={{ paddingLeft: `${depth * 20 + 12}px` }}>
        <CollapsibleTrigger className="py-1.5 pr-2">
          {node.kind && (
            <Badge variant={relationshipBadgeVariant(node.kind)} className="text-xs shrink-0 mr-1">
              {RELATIONSHIP_LABELS[node.kind] ?? node.kind}
              {node.direction === "inbound" && (
                <span className="ml-0.5 text-[10px] opacity-70">(in)</span>
              )}
            </Badge>
          )}
          <span className="text-sm">{node.accountName}</span>
          <span className="text-xs text-muted-foreground ml-auto">
            {node.children.length}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="py-0.5">
            {node.notes && (
              <div
                className="pl-5 pb-1 text-xs text-muted-foreground"
                style={{ paddingLeft: `${(depth + 1) * 20 + 12}px` }}
              >
                {node.notes}
              </div>
            )}
            {node.children.map((child) => (
              <RelationshipNode key={child.id} node={child} depth={depth + 1} />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

interface RelationshipTreeProps {
  graph: AccountRelationshipGraph | null
}

export function RelationshipTree({ graph }: RelationshipTreeProps) {
  if (!graph) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Relationship Tree</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Unable to load relationship data.
          </p>
        </CardContent>
      </Card>
    )
  }

  const { root } = graph
  const hasRelationships = root.children.length > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Relationship Tree</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasRelationships ? (
          <p className="text-sm text-muted-foreground">
            No relationships found for this account.
          </p>
        ) : (
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="py-1.5 pr-2 font-medium">
              <span className="text-sm font-semibold">{root.accountName}</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {root.children.length} related
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="py-0.5">
                {root.children.map((child) => (
                  <RelationshipNode key={child.id} node={child} depth={0} />
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  )
}
