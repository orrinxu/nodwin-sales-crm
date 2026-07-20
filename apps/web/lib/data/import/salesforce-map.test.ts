import { describe, it, expect } from "vitest"
import {
  mapStage,
  normalizeWebsite,
  normalizeCurrency,
  normalizeNumber,
  normalizeDate,
  parseSalesforceDate,
  detectIdColumn,
  hasCurrencyColumn,
  mapAccountRow,
  mapContactRow,
  mapOpportunityRow,
} from "./salesforce-map"

describe("mapStage (ORR-699 / ORR-809a)", () => {
  it("maps standard Salesforce stages to CRM stages", () => {
    expect(mapStage("Prospecting")).toBe("qualify")
    expect(mapStage("Proposal/Price Quote")).toBe("propose")
    expect(mapStage("Negotiation/Review")).toBe("negotiate")
    expect(mapStage("Closed Won")).toBe("closed_won")
    expect(mapStage("Closed Lost")).toBe("closed_lost")
  })
  it("is case-insensitive", () => {
    expect(mapStage("CLOSED WON")).toBe("closed_won")
  })
  it("returns null for unknown stages instead of guessing qualify (ORR-809a)", () => {
    expect(mapStage("Something Custom")).toBeNull()
    expect(mapStage("Disqualified")).toBeNull()
    expect(mapStage("Closed Won - Contract Signed")).toBeNull()
  })
})

describe("normalizeNumber (ORR-809d)", () => {
  it("strips percent signs", () => {
    expect(normalizeNumber("10%")).toBe("10")
  })
  it("strips currency symbols and thousands separators", () => {
    expect(normalizeNumber("$1,000.50")).toBe("1000.50")
    expect(normalizeNumber("1,250")).toBe("1250")
  })
  it("returns undefined for non-numeric or blank", () => {
    expect(normalizeNumber("")).toBeUndefined()
    expect(normalizeNumber("N/A")).toBeUndefined()
  })
})

describe("detectIdColumn / hasCurrencyColumn (ORR-809 c/f)", () => {
  it("detects a record-Id column per entity", () => {
    expect(detectIdColumn(["Account ID", "Name"], "accounts")).toBe(true)
    expect(detectIdColumn(["Opportunity ID", "Name"], "opportunities")).toBe(true)
    expect(detectIdColumn(["Name", "Amount"], "opportunities")).toBe(false)
  })
  it("detects a currency column", () => {
    expect(hasCurrencyColumn(["Name", "Currency"])).toBe(true)
    expect(hasCurrencyColumn(["Name", "CurrencyIsoCode"])).toBe(true)
    expect(hasCurrencyColumn(["Name", "Amount"])).toBe(false)
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

describe("normalizeDate / parseSalesforceDate (ORR-809e)", () => {
  it("passes through valid ISO dates", () => {
    expect(normalizeDate("2026-01-15")).toBe("2026-01-15")
  })
  it("converts US M/D/YYYY", () => {
    expect(normalizeDate("1/5/2026")).toBe("2026-01-05")
  })
  it("returns undefined for unparseable values", () => {
    expect(normalizeDate("last tuesday")).toBeUndefined()
  })
  it("parses non-US D/M dates when the day disambiguates", () => {
    // "19/07/2026" — 19 can only be a day, so month is 07.
    expect(parseSalesforceDate("19/07/2026").iso).toBe("2026-07-19")
  })
  it("rejects impossible calendar dates rather than emitting them", () => {
    // "2/31/2026" previously became "2026-02-31" and errored at the DB.
    const r = parseSalesforceDate("2/31/2026")
    expect(r.iso).toBeUndefined()
    expect(r.warning).toMatch(/impossible/i)
    // ISO form of an impossible date is also rejected.
    expect(parseSalesforceDate("2026-02-31").iso).toBeUndefined()
  })
  it("flags ambiguous D/M vs M/D but still parses as US M/D", () => {
    const r = parseSalesforceDate("3/4/2026")
    expect(r.iso).toBe("2026-03-04")
    expect(r.warning).toMatch(/ambiguous/i)
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
