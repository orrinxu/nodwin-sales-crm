import { describe, it, expect, vi, beforeEach } from "vitest"
import { productCreateSchema, productUpdateSchema } from "./products"

const mockEq = vi.fn()
const mockOrder = vi.fn()
const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockSingle = vi.fn()
const mockFrom = vi.fn()

function buildMockChain() {
  const qb = {
    select: mockSelect,
    eq: mockEq,
    order: mockOrder,
    insert: mockInsert,
    update: mockUpdate,
    single: mockSingle,
  }
  for (const key of Object.keys(qb)) {
    qb[key as keyof typeof qb].mockReturnValue(qb)
  }
  return qb
}

beforeEach(() => {
  vi.resetAllMocks()
  mockFrom.mockReturnValue(buildMockChain())
})

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}))
vi.mock("server-only", () => ({}))

const ctx = {
  user: { id: "aaaaaaaa-1111-1111-1111-111111111111", email: "admin@nodwin.com", role: "admin" },
  source: "web" as const,
}

const dbProduct = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Homepage Banner",
  sku: "BANNER-01",
  description: "Top-of-page banner",
  unit_price_amount: "5000.0000",
  unit_price_currency: "INR",
  active: true,
  display_order: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-15T00:00:00Z",
}

describe("productCreateSchema", () => {
  it("requires a name", () => {
    expect(productCreateSchema.safeParse({ name: "" }).success).toBe(false)
    expect(productCreateSchema.safeParse({ name: "Banner" }).success).toBe(true)
  })

  it("defaults displayOrder to 0", () => {
    const parsed = productCreateSchema.parse({ name: "Banner" })
    expect(parsed.displayOrder).toBe(0)
  })

  it("update schema allows a partial patch", () => {
    expect(productUpdateSchema.safeParse({ name: "Renamed" }).success).toBe(true)
    expect(productUpdateSchema.safeParse({}).success).toBe(true)
  })
})

describe("getAllProducts", () => {
  it("maps db rows to domain records (money pair → unitPrice)", async () => {
    mockOrder.mockResolvedValueOnce({ data: [dbProduct], error: null })
    const { getAllProducts } = await import("./products")
    const result = await getAllProducts(ctx)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("Homepage Banner")
    expect(result[0].unitPriceAmount).toBe("5000.00")
    expect(result[0].unitPriceCurrency).toBe("INR")
    expect(mockFrom).toHaveBeenCalledWith("products")
  })

  it("throws on supabase error", async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: new Error("boom") })
    const { getAllProducts } = await import("./products")
    await expect(getAllProducts(ctx)).rejects.toThrow("Failed to load products")
  })
})

describe("createProduct", () => {
  it("stores a Money-correct unit price and defaults currency to USD", async () => {
    mockSingle.mockResolvedValueOnce({ data: dbProduct, error: null })
    const { createProduct } = await import("./products")
    await createProduct(ctx, { name: "Widget", unitPriceAmount: "199.99" })
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Widget",
        unit_price_amount: "199.99",
        unit_price_currency: "USD",
        sku: null,
      }),
    )
  })

  it("treats a blank price as 0", async () => {
    mockSingle.mockResolvedValueOnce({ data: dbProduct, error: null })
    const { createProduct } = await import("./products")
    await createProduct(ctx, { name: "Freebie", unitPriceAmount: "", unitPriceCurrency: "INR" })
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ unit_price_amount: "0.00", unit_price_currency: "INR" }),
    )
  })
})

describe("updateProduct", () => {
  it("only sends provided fields and recomputes price when amount changes", async () => {
    mockSingle.mockResolvedValueOnce({ data: dbProduct, error: null })
    const { updateProduct } = await import("./products")
    await updateProduct(ctx, "11111111-1111-1111-1111-111111111111", {
      unitPriceAmount: "250",
      unitPriceCurrency: "INR",
    })
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ unit_price_amount: "250.00", unit_price_currency: "INR" }),
    )
    // name/sku untouched
    const arg = mockUpdate.mock.calls[0][0] as Record<string, unknown>
    expect(arg).not.toHaveProperty("name")
    expect(arg).not.toHaveProperty("sku")
  })

  it("throws when there is nothing to update", async () => {
    const { updateProduct } = await import("./products")
    await expect(
      updateProduct(ctx, "11111111-1111-1111-1111-111111111111", {}),
    ).rejects.toThrow("No fields to update")
  })
})
