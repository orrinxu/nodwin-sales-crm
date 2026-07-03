import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn() }))

import {
  groupReportingCurrencySchema,
  entityReportingCurrencySchema,
  DEFAULT_REPORTING_CURRENCY,
} from "./organisation-settings"

describe("groupReportingCurrencySchema", () => {
  it("accepts a valid currency", () => {
    expect(groupReportingCurrencySchema.parse({ currencyCode: "INR" })).toEqual({ currencyCode: "INR" })
  })

  it("accepts null (clears the group default)", () => {
    expect(groupReportingCurrencySchema.parse({ currencyCode: null })).toEqual({ currencyCode: null })
  })

  it("rejects an invalid currency", () => {
    expect(() => groupReportingCurrencySchema.parse({ currencyCode: "rupees" })).toThrow()
  })
})

describe("entityReportingCurrencySchema", () => {
  it("accepts a valid entity + currency", () => {
    const parsed = entityReportingCurrencySchema.parse({
      entityId: "e0000001-0001-0001-0001-000000000001",
      currencyCode: "USD",
    })
    expect(parsed.currencyCode).toBe("USD")
  })

  it("rejects a non-uuid entity", () => {
    expect(() =>
      entityReportingCurrencySchema.parse({ entityId: "not-a-uuid", currencyCode: "USD" }),
    ).toThrow()
  })

  it("requires a currency (null not allowed for an entity override)", () => {
    expect(() =>
      entityReportingCurrencySchema.parse({ entityId: "e0000001-0001-0001-0001-000000000001", currencyCode: null }),
    ).toThrow()
  })
})

describe("DEFAULT_REPORTING_CURRENCY", () => {
  it("is USD", () => {
    expect(DEFAULT_REPORTING_CURRENCY).toBe("USD")
  })
})
