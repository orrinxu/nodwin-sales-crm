"use client"

import {
  Building2,
  ChevronDown,
  ChevronRight,
  GitFork,
  Globe,
  Handshake,
  Link,
  Plus,
  Squirrel,
} from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type {
  AccountRelationshipKind,
  AccountTreeData,
  AccountTreeEdge,
} from "@/lib/data/accounts"

interface AccountTreeProps {
  data: AccountTreeData
}

const kindConfig: Record<
  AccountRelationshipKind,
  { label: string; icon: typeof Link; className: string }
> = {
  subsidiary_of: {
    label: "Subsidiary Of",
    icon: Squirrel,
    className: "bg-secondary text-secondary-foreground",
  },
  parent_of: {
    label: "Parent Of",
    icon: GitFork,
    className: "bg-primary text-primary-foreground",
  },
  procurement_via: {
    label: "Procurement Via",
    icon: Globe,
    className: "border bg-background text-foreground",
  },
  partner_with: {
    label: "Partner With",
    icon: Handshake,
    className: "border bg-background text-foreground",
  },
  sister_company: {
    label: "Sister Company",
    icon: Plus,
    className: "bg-secondary text-secondary-foreground",
  },
}

function RelationshipBadge({ kind }: { kind: AccountRelationshipKind }) {
  const config = kindConfig[kind]
  const Icon = config.icon
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}
    >
      <Icon className="size-3" />
      {config.label}
    </span>
  )
}

interface TreeEdgeProps {
  edge: AccountTreeEdge
  direction: "up" | "down" | "peer"
  isFocalRelated: boolean
}

function isParentRelationship(
  kind: AccountRelationshipKind,
): boolean {
  return kind === "parent_of"
}

function isChildRelationship(
  kind: AccountRelationshipKind,
): boolean {
  return kind === "subsidiary_of"
}

function isPeerRelationship(
  kind: AccountRelationshipKind,
): boolean {
  return (
    kind === "sister_company" ||
    kind === "partner_with" ||
    kind === "procurement_via"
  )
}

function getOtherAccount(
  edge: AccountTreeEdge,
  focalAccountId: string,
): { id: string; name: string } {
  return edge.fromAccount.id === focalAccountId
    ? edge.toAccount
    : edge.fromAccount
}

interface TreeNodeProps {
  accountId: string
  accountName: string
  edges: AccountTreeEdge[]
  depth: number
}

function TreeNode({ accountId, accountName, edges, depth }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = edges.length > 0

  return (
    <li className="relative flex flex-col items-center">
      <div className="flex items-center gap-2">
        {hasChildren ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-5"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
          </Button>
        ) : (
          <div className="size-5" />
        )}
        <Card className="border-primary/20 min-w-[180px] shadow-sm">
          <CardContent className="flex items-center gap-2 px-3 py-2">
            <Building2 className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-medium">{accountName}</span>
          </CardContent>
        </Card>
      </div>
      {hasChildren && expanded && (
        <ul className="relative mt-3 flex gap-6 before:absolute before:left-1/2 before:top-0 before:h-3 before:w-px before:bg-border">
          {edges.map((edge) => {
            const other = getOtherAccount(edge, accountId)
            const kid = isChildRelationship(edge.relationship.kind)
            const pr = isParentRelationship(edge.relationship.kind)
            const peer = isPeerRelationship(edge.relationship.kind)
            return (
              <li
                key={edge.relationship.id}
                className="relative flex flex-col items-center before:absolute before:left-1/2 before:top-0 before:h-3 before:w-px before:bg-border"
              >
                <RelationshipBadge kind={edge.relationship.kind} />
                <TreeNode
                  accountId={other.id}
                  accountName={other.name}
                  edges={[]}
                  depth={depth + 1}
                />
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}

export function AccountTree({ data }: AccountTreeProps) {
  const { focalAccount, edges } = data

  const parentEdges = edges.filter(
    (e) =>
      e.toAccount.id === focalAccount.id &&
      (isParentRelationship(e.relationship.kind) ||
        e.relationship.kind === "subsidiary_of"),
  )

  const childEdges = edges.filter(
    (e) =>
      e.fromAccount.id === focalAccount.id &&
      (isChildRelationship(e.relationship.kind) ||
        e.relationship.kind === "parent_of"),
  )

  const peerEdges = edges.filter(
    (e) =>
      isPeerRelationship(e.relationship.kind) &&
      !parentEdges.includes(e) &&
      !childEdges.includes(e),
  )

  const hasRelationships =
    edges.length > 0

  if (!hasRelationships) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <GitFork className="size-5 text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-base font-medium">No Relationships</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            This account has no parent, child, or peer relationships defined yet.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="py-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitFork className="size-4" />
            Account Hierarchy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4">
            {parentEdges.length > 0 && (
              <div className="flex flex-col items-center gap-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Parents
                </span>
                <ul className="flex gap-6">
                  {parentEdges.map((edge) => {
                    const parent = getOtherAccount(edge, focalAccount.id)
                    return (
                      <li
                        key={edge.relationship.id}
                        className="relative flex flex-col items-center"
                      >
                        <TreeNode
                          accountId={parent.id}
                          accountName={parent.name}
                          edges={[]}
                          depth={0}
                        />
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-px w-8 bg-border" />
                          <RelationshipBadge kind={edge.relationship.kind} />
                          <div className="h-px w-8 bg-border" />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            <div className="relative flex flex-col items-center">
              {parentEdges.length > 0 && (
                <div className="h-4 w-px bg-border" />
              )}
              <Card className="border-primary min-w-[220px] shadow-md">
                <CardContent className="flex items-center gap-3 px-4 py-3">
                  <div className="flex size-8 items-center justify-center rounded-full bg-primary/10">
                    <Building2 className="size-4 text-primary" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">
                      {focalAccount.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {focalAccount.industry ?? "Current Account"}
                    </span>
                  </div>
                </CardContent>
              </Card>
              {childEdges.length > 0 && (
                <div className="h-4 w-px bg-border" />
              )}
            </div>

            {childEdges.length > 0 && (
              <div className="flex flex-col items-center gap-3">
                <ul className="flex gap-6">
                  {childEdges.map((edge) => {
                    const child = getOtherAccount(edge, focalAccount.id)
                    return (
                      <li
                        key={edge.relationship.id}
                        className="relative flex flex-col items-center"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <div className="h-px w-8 bg-border" />
                          <RelationshipBadge kind={edge.relationship.kind} />
                          <div className="h-px w-8 bg-border" />
                        </div>
                        <TreeNode
                          accountId={child.id}
                          accountName={child.name}
                          edges={[]}
                          depth={0}
                        />
                      </li>
                    )
                  })}
                </ul>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Children
                </span>
              </div>
            )}

            {peerEdges.length > 0 && (
              <div className="mt-6 w-full border-t pt-6">
                <span className="mb-4 block text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Peer Relationships
                </span>
                <div className="flex flex-wrap justify-center gap-4">
                  {peerEdges.map((edge) => {
                    const peer = getOtherAccount(edge, focalAccount.id)
                    return (
                      <div
                        key={edge.relationship.id}
                        className="flex items-center gap-2"
                      >
                        <Card className="min-w-[160px] shadow-sm">
                          <CardContent className="flex items-center gap-2 px-3 py-2">
                            <Building2 className="size-4 shrink-0 text-muted-foreground" />
                            <span className="truncate text-sm font-medium">
                              {peer.name}
                            </span>
                          </CardContent>
                        </Card>
                        <RelationshipBadge kind={edge.relationship.kind} />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
