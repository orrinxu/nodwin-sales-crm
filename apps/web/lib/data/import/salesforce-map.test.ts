import { describe, it, expect } from "vitest"
import {
  mapStage,
  normalizeWebsite,
  normalizeCurrency,
  normalizeDate,
  mapAccountRow,
  mapContactRow,
  mapOpportunityRow,
} from "./salesforce-map"

describe("mapStage (ORR-699)", () => {
  it("maps standard Salesforce stages to CRM stages", () => {
    expect(mapStage("Prospecting")).toBe("qualify")
    expect(mapStage("Proposal/Price Quote")).toBe("propose")
    expect(mapStage("Negotiation/Review")).toBe("negotiate")
    expect(mapStage("Closed Won")).toBe("closed_won")
    expect(mapStage("Closed Lost")).toBe("closed_lost")
  })
  it("is case-insensitive and falls back to qualify for unknown stages", () => {
    expect(mapStage("CLOSED WON")).toBe("closed_won")
    expect(mapStage("Something Custom")).toBe("qualify")
  })
})

describe("normalizeWebsite", () => {
  it("prepends https:// when scheme is missing", () => {
    expect(normalizeWebsite("acme.com")).toBe("https://acme.com")
  })
  it("keeps an existing scheme", () => {
    expect(normalizeWebsite("http://acme.com")).toBe("http://acme.com")
  })
  it("returns undefined for blanks", () => {
    expect(normalizeWebsite("  ")).toBeUndefined()
  })
})

describe("normalizeCurrency", () => {
  it("uppercases valid codes", () => {
    expect(normalizeCurrency("usd")).toBe("USD")
  })
  it("rejects invalid codes", () => {
    expect(normalizeCurrency("US Dollars")).toBeUndefined()
  })
})

describe("normalizeDate", () => {
  it("passes through ISO dates", () => {
    expect(normalizeDate("2026-01-15")).toBe("2026-01-15")
  })
  it("converts US M/D/YYYY", () => {
    expect(normalizeDate("1/5/2026")).toBe("2026-01-05")
  })
  it("returns undefined for unparseable values", () => {
    expect(normalizeDate("last tuesday")).toBeUndefined()
  })
})

describe("row mappers", () => {
  it("maps an account row from varied headers + Salesforce Id", () => {
    const m = mapAccountRow({
      "Account ID": "001XYZ",
      "Account Name": "Acme",
      Website: "acme.com",
      "Billing Country": "USA",
    })
    expect(m.legacyId).toBe("001XYZ")
    expect(m.values).toMatchObject({ name: "Acme", website: "https://acme.com", country: "USA" })
  })

  it("builds contact full name from First + Last and carries the parent account id", () => {
    const m = mapContactRow({
      "Contact ID": "003ABC",
      "First Name": "Jane",
      "Last Name": "Doe",
      "Account ID": "001XYZ",
      Email: "jane@acme.com",
    })
    expect(m.values.fullName).toBe("Jane Doe")
    expect(m.accountLegacyId).toBe("001XYZ")
    expect(m.values.email).toBe("jane@acme.com")
  })

  it("supplies a placeholder loss reason for closed_lost opportunities", () => {
    const m = mapOpportunityRow({
      "Opportunity ID": "006AAA",
      Name: "Big deal",
      Stage: "Closed Lost",
      "Account ID": "001XYZ",
      Amount: "50000",
    })
    expect(m.values.stage).toBe("closed_lost")
    expect(m.values.lossReason).toBeTruthy()
    expect(m.values.amount).toBe("50000")
    expect(m.accountLegacyId).toBe("001XYZ")
  })
})
