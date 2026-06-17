import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { RelationshipTree } from "./relationship-tree"
import type { AccountRelationshipGraph } from "@/lib/data/accounts"

vi.mock("server-only", () => ({}))

function makeGraph(overrides: Partial<AccountRelationshipGraph> = {}): AccountRelationshipGraph {
  return {
    root: {
      id: "root-id",
      accountId: "root-id",
      accountName: "Acme Corp",
      kind: null,
      direction: null,
      notes: null,
      children: [],
    },
    ...overrides,
  }
}

describe("RelationshipTree", () => {
  it("renders a null-safe empty state when graph is null", () => {
    render(<RelationshipTree graph={null} />)
    expect(screen.getByText("Unable to load relationship data.")).toBeInTheDocument()
  })

  it("renders empty state when there are no relationships", () => {
    render(<RelationshipTree graph={makeGraph()} />)
    expect(screen.getByText("No relationships found for this account.")).toBeInTheDocument()
  })

  it("renders the root account name", () => {
    const graph = makeGraph({
      root: {
        ...makeGraph().root,
        children: [
          {
            id: "rel-1",
            accountId: "sub-1",
            accountName: "SubCo Ltd",
            kind: "subsidiary_of",
            direction: "outbound",
            notes: null,
            children: [],
          },
        ],
      },
    })
    render(<RelationshipTree graph={graph} />)
    expect(screen.getByText("Acme Corp")).toBeInTheDocument()
  })

  it("renders related account names with relationship kind badges", () => {
    const graph = makeGraph({
      root: {
        ...makeGraph().root,
        children: [
          {
            id: "rel-1",
            accountId: "sub-1",
            accountName: "SubCo Ltd",
            kind: "subsidiary_of",
            direction: "outbound",
            notes: null,
            children: [],
          },
          {
            id: "rel-2",
            accountId: "partner-1",
            accountName: "Partner Inc",
            kind: "partner_with",
            direction: "outbound",
            notes: null,
            children: [],
          },
        ],
      },
    })
    render(<RelationshipTree graph={graph} />)
    expect(screen.getByText("SubCo Ltd")).toBeInTheDocument()
    expect(screen.getByText("Partner Inc")).toBeInTheDocument()
    expect(screen.getByText("Subsidiary of")).toBeInTheDocument()
    expect(screen.getByText("Partner with")).toBeInTheDocument()
  })

  it("renders the count of related accounts", () => {
    const graph = makeGraph({
      root: {
        ...makeGraph().root,
        children: [
          {
            id: "rel-1",
            accountId: "sub-1",
            accountName: "SubCo Ltd",
            kind: "subsidiary_of",
            direction: "outbound",
            notes: null,
            children: [],
          },
        ],
      },
    })
    render(<RelationshipTree graph={graph} />)
    expect(screen.getByText("1 related")).toBeInTheDocument()
  })

  it("renders inbound relationship indicator", () => {
    const graph = makeGraph({
      root: {
        ...makeGraph().root,
        children: [
          {
            id: "rel-in",
            accountId: "parent-1",
            accountName: "Parent Corp",
            kind: "parent_of",
            direction: "inbound",
            notes: null,
            children: [],
          },
        ],
      },
    })
    render(<RelationshipTree graph={graph} />)
    expect(screen.getByText("Parent Corp")).toBeInTheDocument()
    expect(screen.getByText("Parent of")).toBeInTheDocument()
    expect(screen.getByText("(in)")).toBeInTheDocument()
  })

  it("renders all relationship kinds", () => {
    const kinds: Array<{
      kind: "subsidiary_of" | "procurement_via" | "partner_with" | "parent_of" | "sister_company"
      label: string
    }> = [
      { kind: "subsidiary_of", label: "Subsidiary of" },
      { kind: "procurement_via", label: "Procurement via" },
      { kind: "partner_with", label: "Partner with" },
      { kind: "parent_of", label: "Parent of" },
      { kind: "sister_company", label: "Sister company" },
    ]

    const graph = makeGraph({
      root: {
        ...makeGraph().root,
        children: kinds.map((k, i) => ({
          id: `rel-${i}`,
          accountId: `acc-${i}`,
          accountName: `Company ${i}`,
          kind: k.kind,
          direction: "outbound" as const,
          notes: null,
          children: [],
        })),
      },
    })
    render(<RelationshipTree graph={graph} />)
    for (const k of kinds) {
      expect(screen.getByText(k.label)).toBeInTheDocument()
    }
  })

  it("renders relationship notes when present", () => {
    const graph = makeGraph({
      root: {
        ...makeGraph().root,
        children: [
          {
            id: "rel-1",
            accountId: "sub-1",
            accountName: "SubCo Ltd",
            kind: "subsidiary_of",
            direction: "outbound",
            notes: "Acquired in 2023",
            children: [],
          },
        ],
      },
    })
    render(<RelationshipTree graph={graph} />)
    expect(screen.getByText(/\u2014 Acquired in 2023/)).toBeInTheDocument()
  })

  it("renders nested relationships (2 levels deep)", () => {
    const graph = makeGraph({
      root: {
        ...makeGraph().root,
        children: [
          {
            id: "rel-1",
            accountId: "sub-1",
            accountName: "SubCo Ltd",
            kind: "subsidiary_of",
            direction: "outbound",
            notes: null,
            children: [
              {
                id: "nested-1",
                accountId: "sub-sub-1",
                accountName: "SubSubCo LLC",
                kind: "subsidiary_of",
                direction: "outbound",
                notes: null,
                children: [],
              },
            ],
          },
        ],
      },
    })
    render(<RelationshipTree graph={graph} />)
    expect(screen.getByText("SubCo Ltd")).toBeInTheDocument()
    expect(screen.getByText("SubSubCo LLC")).toBeInTheDocument()
  })
})
