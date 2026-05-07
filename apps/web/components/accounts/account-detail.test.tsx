import { describe, it, expect } from "vitest"
import { renderToString } from "react-dom/server"
import { AccountDetail } from "./account-detail"
import type { AccountRecord } from "@/lib/data/accounts"

const baseAccount: AccountRecord = {
  id: "acct-1",
  name: "Acme Corp",
  legalName: "Acme Corporation",
  website: "https://acme.com",
  country: "US",
  industry: "Technology",
  description: "A leading tech company",
  accountOwnerUserId: "user-1",
  ownerName: "Alice Johnson",
  emailDomains: ["acme.com", "acme-corp.com"],
  customData: {},
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-15T00:00:00Z",
}

const minimalAccount: AccountRecord = {
  id: "acct-2",
  name: "Beta Inc",
  legalName: null,
  website: null,
  country: null,
  industry: null,
  description: null,
  accountOwnerUserId: null,
  ownerName: null,
  emailDomains: null,
  customData: {},
  createdAt: "2026-02-01T00:00:00Z",
  updatedAt: "2026-02-01T00:00:00Z",
}

function render(account: AccountRecord) {
  return renderToString(<AccountDetail account={account} />)
}

describe("AccountDetail", () => {
  it("renders the account name in the heading", () => {
    const html = render(baseAccount)
    expect(html).toContain("Acme Corp")
  })

  it("renders the legal name", () => {
    const html = render(baseAccount)
    expect(html).toContain("Acme Corporation")
  })

  it("renders website as a link with hostname text", () => {
    const html = render(baseAccount)
    expect(html).toContain("acme.com")
    expect(html).toContain('href="https://acme.com"')
  })

  it("renders industry, country, and owner", () => {
    const html = render(baseAccount)
    expect(html).toContain("Technology")
    expect(html).toContain("US")
    expect(html).toContain("Alice Johnson")
  })

  it("renders email domains as a comma-separated list", () => {
    const html = render(baseAccount)
    expect(html).toContain("acme.com, acme-corp.com")
  })

  it("renders the description card when description is provided", () => {
    const html = render(baseAccount)
    expect(html).toContain("A leading tech company")
    expect(html).toContain("Description")
  })

  it("omits the description card when description is null", () => {
    const html = render(minimalAccount)
    expect(html).not.toContain("A leading tech company")
  })

  it("renders em dash for null fields", () => {
    const html = render(minimalAccount)
    expect(html).toContain("Beta Inc")
    expect(html).toContain("—")
  })

  it("renders all six tab labels", () => {
    const html = render(baseAccount)
    expect(html).toContain("Overview")
    expect(html).toContain("Contacts")
    expect(html).toContain("Opportunities")
    expect(html).toContain("Activities")
    expect(html).toContain("Documents")
    expect(html).toContain("Tree")
  })

  it("renders the back link to /accounts", () => {
    const html = render(baseAccount)
    expect(html).toContain('href="/accounts"')
  })
})
