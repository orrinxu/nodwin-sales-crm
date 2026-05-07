import { describe, it, expect } from "vitest"
import { renderToString } from "react-dom/server"
import { AccountTree } from "./account-tree"
import type { AccountTreeData } from "@/lib/data/accounts"

const baseTreeData: AccountTreeData = {
  focalAccount: {
    id: "acct-1",
    name: "Acme Corp",
    legalName: "Acme Corporation",
    website: "https://acme.com",
    country: "US",
    industry: "Technology",
    description: "A leading tech company",
    accountOwnerUserId: "user-1",
    ownerName: "Alice Johnson",
    emailDomains: ["acme.com"],
    customData: {},
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-15T00:00:00Z",
  },
  edges: [],
}

function render(data: AccountTreeData) {
  return renderToString(<AccountTree data={data} />)
}

describe("AccountTree", () => {
  it("renders the focal account name in the tree header", () => {
    const data: AccountTreeData = {
      ...baseTreeData,
      edges: [
        {
          relationship: {
            id: "rel-1",
            fromAccountId: "acct-parent",
            toAccountId: "acct-1",
            kind: "subsidiary_of",
            notes: null,
            createdAt: "2026-01-01T00:00:00Z",
          },
          fromAccount: { id: "acct-parent", name: "Parent Corp" },
          toAccount: { id: "acct-1", name: "Acme Corp" },
        },
      ],
    }
    const html = render(data)
    expect(html).toContain("Acme Corp")
  })

  it("shows empty state when no relationships exist", () => {
    const html = render(baseTreeData)
    expect(html).toContain("No Relationships")
  })

  it("renders parent relationships above the focal account", () => {
    const data: AccountTreeData = {
      ...baseTreeData,
      edges: [
        {
          relationship: {
            id: "rel-1",
            fromAccountId: "acct-parent",
            toAccountId: "acct-1",
            kind: "subsidiary_of",
            notes: null,
            createdAt: "2026-01-01T00:00:00Z",
          },
          fromAccount: { id: "acct-parent", name: "Parent Corp" },
          toAccount: { id: "acct-1", name: "Acme Corp" },
        },
      ],
    }
    const html = render(data)
    expect(html).toContain("Parent Corp")
    expect(html).toContain("Subsidiary Of")
    expect(html).not.toContain("No Relationships")
  })

  it("renders child relationships", () => {
    const data: AccountTreeData = {
      ...baseTreeData,
      edges: [
        {
          relationship: {
            id: "rel-2",
            fromAccountId: "acct-1",
            toAccountId: "acct-child",
            kind: "parent_of",
            notes: null,
            createdAt: "2026-01-01T00:00:00Z",
          },
          fromAccount: { id: "acct-1", name: "Acme Corp" },
          toAccount: { id: "acct-child", name: "Child Ltd" },
        },
      ],
    }
    const html = render(data)
    expect(html).toContain("Child Ltd")
    expect(html).toContain("Parent Of")
    expect(html).toContain("Children")
  })

  it("renders peer relationships", () => {
    const data: AccountTreeData = {
      ...baseTreeData,
      edges: [
        {
          relationship: {
            id: "rel-3",
            fromAccountId: "acct-1",
            toAccountId: "acct-peer",
            kind: "partner_with",
            notes: null,
            createdAt: "2026-01-01T00:00:00Z",
          },
          fromAccount: { id: "acct-1", name: "Acme Corp" },
          toAccount: { id: "acct-peer", name: "Peer Inc" },
        },
      ],
    }
    const html = render(data)
    expect(html).toContain("Peer Inc")
    expect(html).toContain("Partner With")
    expect(html).toContain("Peer Relationships")
  })

  it("renders all relationship kinds as badges", () => {
    const data: AccountTreeData = {
      ...baseTreeData,
      edges: [
        {
          relationship: {
            id: "rel-p1",
            fromAccountId: "p1",
            toAccountId: "acct-1",
            kind: "subsidiary_of",
            notes: null,
            createdAt: "2026-01-01T00:00:00Z",
          },
          fromAccount: { id: "p1", name: "Parent A" },
          toAccount: { id: "acct-1", name: "Acme Corp" },
        },
        {
          relationship: {
            id: "rel-p2",
            fromAccountId: "p2",
            toAccountId: "acct-1",
            kind: "procurement_via",
            notes: null,
            createdAt: "2026-01-01T00:00:00Z",
          },
          fromAccount: { id: "p2", name: "Supplier Co" },
          toAccount: { id: "acct-1", name: "Acme Corp" },
        },
        {
          relationship: {
            id: "rel-p3",
            fromAccountId: "p3",
            toAccountId: "acct-1",
            kind: "sister_company",
            notes: null,
            createdAt: "2026-01-01T00:00:00Z",
          },
          fromAccount: { id: "p3", name: "Sister Inc" },
          toAccount: { id: "acct-1", name: "Acme Corp" },
        },
      ],
    }
    const html = render(data)
    expect(html).toContain("Subsidiary Of")
    expect(html).toContain("Procurement Via")
    expect(html).toContain("Sister Company")
  })

  it("renders the hierarchy card title", () => {
    const data: AccountTreeData = {
      ...baseTreeData,
      edges: [
        {
          relationship: {
            id: "rel-1",
            fromAccountId: "acct-parent",
            toAccountId: "acct-1",
            kind: "subsidiary_of",
            notes: null,
            createdAt: "2026-01-01T00:00:00Z",
          },
          fromAccount: { id: "acct-parent", name: "Parent Corp" },
          toAccount: { id: "acct-1", name: "Acme Corp" },
        },
      ],
    }
    const html = render(data)
    expect(html).toContain("Account Hierarchy")
  })

  it("shows Parents section label when parent edges exist", () => {
    const data: AccountTreeData = {
      ...baseTreeData,
      edges: [
        {
          relationship: {
            id: "rel-1",
            fromAccountId: "acct-parent",
            toAccountId: "acct-1",
            kind: "subsidiary_of",
            notes: null,
            createdAt: "2026-01-01T00:00:00Z",
          },
          fromAccount: { id: "acct-parent", name: "Parent Corp" },
          toAccount: { id: "acct-1", name: "Acme Corp" },
        },
      ],
    }
    const html = render(data)
    expect(html).toContain("Parents")
  })

  it("shows Children section label when child edges exist", () => {
    const data: AccountTreeData = {
      ...baseTreeData,
      edges: [
        {
          relationship: {
            id: "rel-2",
            fromAccountId: "acct-1",
            toAccountId: "acct-child",
            kind: "parent_of",
            notes: null,
            createdAt: "2026-01-01T00:00:00Z",
          },
          fromAccount: { id: "acct-1", name: "Acme Corp" },
          toAccount: { id: "acct-child", name: "Child Ltd" },
        },
      ],
    }
    const html = render(data)
    expect(html).toContain("Children")
  })
})
