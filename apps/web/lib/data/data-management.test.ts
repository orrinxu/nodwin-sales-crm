import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  financeExportConfigCreateSchema,
  financeExportConfigUpdateSchema,
  importJobCreateSchema,
} from "./data-management"

let mockSelect: ReturnType<typeof vi.fn>
let mockEq: ReturnType<typeof vi.fn>
let mockOrder: ReturnType<typeof vi.fn>
let mockSingle: ReturnType<typeof vi.fn>
let mockInsert: ReturnType<typeof vi.fn>
let mockUpdate: ReturnType<typeof vi.fn>
let mockDelete: ReturnType<typeof vi.fn>
let mockUpsert: ReturnType<typeof vi.fn>
let mockLimit: ReturnType<typeof vi.fn>
let mockFrom: ReturnType<typeof vi.fn>

function buildMockChain() {
  const qb = {
    select: mockSelect,
    eq: mockEq,
    order: mockOrder,
    single: mockSingle,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    upsert: mockUpsert,
    limit: mockLimit,
  }
  for (const key of Object.keys(qb)) {
    qb[key as keyof typeof qb].mockReturnValue(qb)
  }
  return qb
}

beforeEach(() => {
  mockSelect = vi.fn()
  mockEq = vi.fn()
  mockOrder = vi.fn()
  mockSingle = vi.fn()
  mockInsert = vi.fn()
  mockUpdate = vi.fn()
  mockDelete = vi.fn()
  mockUpsert = vi.fn()
  mockLimit = vi.fn()
  mockFrom = vi.fn()
  mockFrom.mockReturnValue(buildMockChain())
})

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

vi.mock("server-only", () => ({}))

const defaultCtx = {
  user: { id: "user-1", email: "alice@nodwin.com", role: "admin" },
  source: "web" as const,
}

const UUID_1 = "00000000-0000-0000-0000-000000000001"
const UUID_2 = "00000000-0000-0000-0000-000000000002"
const UUID_3 = "00000000-0000-0000-0000-000000000003"
const CONFIG_1 = "00000000-0000-0000-0000-100000000001"
const CONFIG_2 = "00000000-0000-0000-0000-100000000002"
const JOB_1 = "00000000-0000-0000-0000-200000000001"
const JOB_2 = "00000000-0000-0000-0000-200000000002"

const mockDbConfig = {
  id: CONFIG_1,
  entity_id: UUID_1,
  destination_drive_folder_id: "folder-abc",
  format: { columns: ["name", "amount"] },
  schedule: "0 6 * * *",
  enabled: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-15T00:00:00Z",
  entities: { name: "Nodwin" },
}

const mockDbConfig2 = {
  id: CONFIG_2,
  entity_id: UUID_2,
  destination_drive_folder_id: null,
  format: {},
  schedule: null,
  enabled: false,
  created_at: "2026-02-01T00:00:00Z",
  updated_at: "2026-02-15T00:00:00Z",
  entities: { name: "Trinity" },
}

const mockDbConfigNoEntity = {
  id: "config-3",
  entity_id: UUID_3,
  destination_drive_folder_id: null,
  format: {},
  schedule: null,
  enabled: false,
  created_at: "2026-03-01T00:00:00Z",
  updated_at: "2026-03-15T00:00:00Z",
  entities: null,
}

const mockDbJob: Record<string, unknown> = {
  id: JOB_1,
  entity_id: UUID_1,
  kind: "export",
  target_entity_type: "accounts",
  status: "completed",
  file_url: null,
  drive_file_id: null,
  record_count: 150,
  error_log: null,
  created_by: "user-1",
  created_at: "2026-03-01T00:00:00Z",
  updated_at: "2026-03-01T00:01:00Z",
  entities: { name: "Nodwin" },
}

const mockDbJobFailed: Record<string, unknown> = {
  id: JOB_2,
  entity_id: null,
  kind: "import",
  target_entity_type: null,
  status: "failed",
  file_url: "https://drive.example.com/file",
  drive_file_id: "drive-xyz",
  record_count: 0,
  error_log: { message: "Connection timeout" },
  created_by: "user-2",
  created_at: "2026-03-02T00:00:00Z",
  updated_at: "2026-03-02T00:01:00Z",
  entities: null,
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

describe("financeExportConfigCreateSchema", () => {
  it("accepts valid minimal input", () => {
    const result = financeExportConfigCreateSchema.safeParse({
      entityId: UUID_1,
    })
    expect(result.success).toBe(true)
  })

  it("accepts full input with all optional fields", () => {
    const result = financeExportConfigCreateSchema.safeParse({
      entityId: UUID_1,
      destinationDriveFolderId: "folder-abc",
      format: { columns: ["name"] },
      schedule: "0 6 * * *",
      enabled: true,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.enabled).toBe(true)
      expect(result.data.schedule).toBe("0 6 * * *")
    }
  })

  it("rejects empty entityId", () => {
    const result = financeExportConfigCreateSchema.safeParse({
      entityId: "",
    })
    expect(result.success).toBe(false)
  })

  it("rejects non-uuid entityId", () => {
    const result = financeExportConfigCreateSchema.safeParse({
      entityId: "not-a-uuid",
    })
    expect(result.success).toBe(false)
  })

  it("applies defaults", () => {
    const result = financeExportConfigCreateSchema.safeParse({
      entityId: UUID_1,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.enabled).toBe(false)
      expect(result.data.format).toEqual({})
    }
  })

  it("accepts empty string destinationDriveFolderId (coerces to optional)", () => {
    const result = financeExportConfigCreateSchema.safeParse({
      entityId: UUID_1,
      destinationDriveFolderId: "",
    })
    expect(result.success).toBe(true)
  })
})

describe("financeExportConfigUpdateSchema", () => {
  it("accepts partial input", () => {
    const result = financeExportConfigUpdateSchema.safeParse({
      enabled: true,
    })
    expect(result.success).toBe(true)
  })

  it("accepts empty input", () => {
    const result = financeExportConfigUpdateSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it("accepts full input", () => {
    const result = financeExportConfigUpdateSchema.safeParse({
      destinationDriveFolderId: "new-folder",
      format: { columns: ["id"] },
      schedule: "0 12 * * *",
      enabled: false,
    })
    expect(result.success).toBe(true)
  })

  it("accepts empty string for drive folder", () => {
    const result = financeExportConfigUpdateSchema.safeParse({
      destinationDriveFolderId: "",
    })
    expect(result.success).toBe(true)
  })
})

describe("importJobCreateSchema", () => {
  it("accepts valid minimal input", () => {
    const result = importJobCreateSchema.safeParse({
      kind: "export",
    })
    expect(result.success).toBe(true)
  })

  it("accepts full input", () => {
    const result = importJobCreateSchema.safeParse({
      entityId: "00000000-0000-0000-0000-000000000001",
      kind: "import",
      targetEntityType: "accounts",
      status: "running",
    })
    expect(result.success).toBe(true)
  })

  it("rejects invalid kind", () => {
    const result = importJobCreateSchema.safeParse({
      kind: "delete",
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid status", () => {
    const result = importJobCreateSchema.safeParse({
      kind: "export",
      status: "cancelled",
    })
    expect(result.success).toBe(false)
  })

  it("applies defaults", () => {
    const result = importJobCreateSchema.safeParse({
      kind: "import",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe("pending")
    }
  })
})

// ---------------------------------------------------------------------------
// getAllFinanceExportConfigs
// ---------------------------------------------------------------------------

describe("getAllFinanceExportConfigs", () => {
  it("returns all configs with entity names", async () => {
    mockOrder.mockResolvedValueOnce({
      data: [mockDbConfig, mockDbConfig2],
      error: null,
    })

    const { getAllFinanceExportConfigs } = await import(
      "./data-management"
    )
    const result = await getAllFinanceExportConfigs(defaultCtx)

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe(CONFIG_1)
    expect(result[0].entityId).toBe(UUID_1)
    expect(result[0].entityName).toBe("Nodwin")
    expect(result[0].destinationDriveFolderId).toBe("folder-abc")
    expect(result[0].schedule).toBe("0 6 * * *")
    expect(result[0].enabled).toBe(true)
    expect(result[0].format).toEqual({ columns: ["name", "amount"] })
    expect(result[1].entityName).toBe("Trinity")
    expect(result[1].enabled).toBe(false)
    expect(mockFrom).toHaveBeenCalledWith("finance_export_config")
    expect(mockSelect).toHaveBeenCalledWith("*, entities(name)")
  })

  it("returns empty array when no configs exist", async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null })

    const { getAllFinanceExportConfigs } = await import(
      "./data-management"
    )
    const result = await getAllFinanceExportConfigs(defaultCtx)

    expect(result).toEqual([])
  })

  it("returns null entityName when entities join returns null", async () => {
    mockOrder.mockResolvedValueOnce({
      data: [mockDbConfigNoEntity],
      error: null,
    })

    const { getAllFinanceExportConfigs } = await import(
      "./data-management"
    )
    const result = await getAllFinanceExportConfigs(defaultCtx)

    expect(result).toHaveLength(1)
    expect(result[0].entityName).toBeNull()
  })

  it("throws on supabase error", async () => {
    mockOrder.mockResolvedValueOnce({
      data: null,
      error: new Error("DB error"),
    })

    const { getAllFinanceExportConfigs } = await import(
      "./data-management"
    )
    await expect(
      getAllFinanceExportConfigs(defaultCtx),
    ).rejects.toThrow("Failed to load export configs")
  })
})

// ---------------------------------------------------------------------------
// getFinanceExportConfigById
// ---------------------------------------------------------------------------

describe("getFinanceExportConfigById", () => {
  it("returns config when found", async () => {
    mockSingle.mockResolvedValueOnce({
      data: mockDbConfig,
      error: null,
    })

    const { getFinanceExportConfigById } = await import(
      "./data-management"
    )
    const result = await getFinanceExportConfigById(
      defaultCtx,
      CONFIG_1,
    )

    expect(result).not.toBeNull()
    expect(result!.id).toBe(CONFIG_1)
    expect(result!.entityName).toBe("Nodwin")
    expect(mockFrom).toHaveBeenCalledWith("finance_export_config")
    expect(mockEq).toHaveBeenCalledWith("id", CONFIG_1)
  })

  it("returns null when config not found (PGRST116)", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST116", message: "No rows found" },
    })

    const { getFinanceExportConfigById } = await import(
      "./data-management"
    )
    const result = await getFinanceExportConfigById(
      defaultCtx,
      "nonexistent",
    )

    expect(result).toBeNull()
  })

  it("throws on unexpected error", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { code: "XX000", message: "Unexpected" },
    })

    const { getFinanceExportConfigById } = await import(
      "./data-management"
    )
    await expect(
      getFinanceExportConfigById(defaultCtx, CONFIG_1),
    ).rejects.toThrow("Failed to load export config")
  })
})

// ---------------------------------------------------------------------------
// createFinanceExportConfig (upsert)
// ---------------------------------------------------------------------------

describe("createFinanceExportConfig", () => {
  it("creates config with all fields", async () => {
    mockSingle.mockResolvedValueOnce({
      data: mockDbConfig,
      error: null,
    })

    const { createFinanceExportConfig } = await import(
      "./data-management"
    )
    const result = await createFinanceExportConfig(defaultCtx, {
      entityId: UUID_1,
      destinationDriveFolderId: "folder-abc",
      schedule: "0 6 * * *",
      enabled: true,
    })

    expect(result.id).toBe(CONFIG_1)
    expect(result.entityId).toBe(UUID_1)
    expect(result.destinationDriveFolderId).toBe("folder-abc")
    expect(result.enabled).toBe(true)
    expect(mockFrom).toHaveBeenCalledWith("finance_export_config")
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_id: UUID_1,
        destination_drive_folder_id: "folder-abc",
        schedule: "0 6 * * *",
        enabled: true,
      }),
      { onConflict: "entity_id" },
    )
  })

  it("creates config with minimal fields", async () => {
    mockSingle.mockResolvedValueOnce({
      data: mockDbConfig2,
      error: null,
    })

    const { createFinanceExportConfig } = await import(
      "./data-management"
    )
    const result = await createFinanceExportConfig(defaultCtx, {
      entityId: UUID_2,
    })

    expect(result.enabled).toBe(false)
    expect(result.destinationDriveFolderId).toBeNull()
    expect(result.schedule).toBeNull()
  })

  it("throws on supabase error", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: new Error("DB error"),
    })

    const { createFinanceExportConfig } = await import(
      "./data-management"
    )
    await expect(
      createFinanceExportConfig(defaultCtx, {
        entityId: UUID_1,
      }),
    ).rejects.toThrow("Failed to create export config")
  })
})

// ---------------------------------------------------------------------------
// updateFinanceExportConfig
// ---------------------------------------------------------------------------

describe("updateFinanceExportConfig", () => {
  it("updates config fields and returns updated record", async () => {
    mockEq
      .mockResolvedValueOnce({ data: null, error: null })
    mockSingle
      .mockResolvedValueOnce({
        data: {
          ...mockDbConfig,
          enabled: false,
          schedule: "0 12 * * *",
        },
        error: null,
      })

    const { updateFinanceExportConfig } = await import(
      "./data-management"
    )
    const result = await updateFinanceExportConfig(
      defaultCtx,
      CONFIG_1,
      { enabled: false, schedule: "0 12 * * *" },
    )

    expect(result.enabled).toBe(false)
    expect(result.schedule).toBe("0 12 * * *")
    expect(mockFrom).toHaveBeenCalledWith("finance_export_config")
    expect(mockUpdate).toHaveBeenCalledWith({
      enabled: false,
      schedule: "0 12 * * *",
    })
  })

  it("skips update when no fields changed", async () => {
    mockSingle.mockResolvedValueOnce({
      data: mockDbConfig,
      error: null,
    })

    const { updateFinanceExportConfig } = await import(
      "./data-management"
    )
    const result = await updateFinanceExportConfig(
      defaultCtx,
      CONFIG_1,
      {},
    )

    expect(result.id).toBe(CONFIG_1)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("throws when config not found", async () => {
    mockSingle
      .mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST116", message: "No rows found" },
      })

    const { updateFinanceExportConfig } = await import(
      "./data-management"
    )
    await expect(
      updateFinanceExportConfig(defaultCtx, CONFIG_1, {}),
    ).rejects.toThrow("Export config not found")
  })

  it("throws on update error", async () => {
    mockEq.mockResolvedValueOnce({
      data: null,
      error: new Error("DB error"),
    })

    const { updateFinanceExportConfig } = await import(
      "./data-management"
    )
    await expect(
      updateFinanceExportConfig(defaultCtx, CONFIG_1, {
        enabled: true,
      }),
    ).rejects.toThrow("Failed to update export config")
  })
})

// ---------------------------------------------------------------------------
// deleteFinanceExportConfig
// ---------------------------------------------------------------------------

describe("deleteFinanceExportConfig", () => {
  it("deletes config successfully", async () => {
    mockEq.mockResolvedValueOnce({ data: null, error: null })

    const { deleteFinanceExportConfig } = await import(
      "./data-management"
    )
    await deleteFinanceExportConfig(defaultCtx, CONFIG_1)

    expect(mockFrom).toHaveBeenCalledWith("finance_export_config")
    expect(mockDelete).toHaveBeenCalled()
    expect(mockEq).toHaveBeenCalledWith("id", CONFIG_1)
  })

  it("throws on delete error", async () => {
    mockEq.mockResolvedValueOnce({
      data: null,
      error: new Error("DB error"),
    })

    const { deleteFinanceExportConfig } = await import(
      "./data-management"
    )
    await expect(
      deleteFinanceExportConfig(defaultCtx, CONFIG_1),
    ).rejects.toThrow("Failed to delete export config")
  })
})

// ---------------------------------------------------------------------------
// getImportJobs
// ---------------------------------------------------------------------------

describe("getImportJobs", () => {
  it("returns all import jobs ordered by created_at desc", async () => {
    mockLimit.mockResolvedValueOnce({
      data: [mockDbJob, mockDbJobFailed],
      error: null,
    })

    const { getImportJobs } = await import("./data-management")
    const result = await getImportJobs(defaultCtx)

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe(JOB_1)
    expect(result[0].kind).toBe("export")
    expect(result[0].targetEntityType).toBe("accounts")
    expect(result[0].status).toBe("completed")
    expect(result[0].recordCount).toBe(150)
    expect(result[0].entityName).toBe("Nodwin")
    expect(mockFrom).toHaveBeenCalledWith("import_jobs")
    expect(mockSelect).toHaveBeenCalledWith("*, entities(name)")
    expect(mockOrder).toHaveBeenCalledWith("created_at", {
      ascending: false,
    })
    expect(mockLimit).toHaveBeenCalledWith(50)
  })

  it("returns null entityName for jobs without entity join", async () => {
    mockLimit.mockResolvedValueOnce({
      data: [mockDbJobFailed],
      error: null,
    })

    const { getImportJobs } = await import("./data-management")
    const result = await getImportJobs(defaultCtx)

    expect(result[0].entityId).toBeNull()
    expect(result[0].entityName).toBeNull()
    expect(result[0].errorLog).toEqual({ message: "Connection timeout" })
  })

  it("returns empty array when no jobs exist", async () => {
    mockLimit.mockResolvedValueOnce({ data: [], error: null })

    const { getImportJobs } = await import("./data-management")
    const result = await getImportJobs(defaultCtx)

    expect(result).toEqual([])
  })

  it("throws on supabase error", async () => {
    mockLimit.mockResolvedValueOnce({
      data: null,
      error: new Error("DB error"),
    })

    const { getImportJobs } = await import("./data-management")
    await expect(getImportJobs(defaultCtx)).rejects.toThrow(
      "Failed to load import jobs",
    )
  })
})

// ---------------------------------------------------------------------------
// createImportJob
// ---------------------------------------------------------------------------

describe("createImportJob", () => {
  it("creates import job with all fields", async () => {
    mockSingle.mockResolvedValueOnce({
      data: mockDbJob,
      error: null,
    })

    const { createImportJob } = await import("./data-management")
    const result = await createImportJob(defaultCtx, {
      entityId: UUID_1,
      kind: "export",
      targetEntityType: "accounts",
      status: "pending",
    })

    expect(result.id).toBe(JOB_1)
    expect(result.kind).toBe("export")
    expect(result.entityName).toBe("Nodwin")
    expect(mockFrom).toHaveBeenCalledWith("import_jobs")
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_id: UUID_1,
        kind: "export",
        target_entity_type: "accounts",
        status: "pending",
        created_by: "user-1",
      }),
    )
  })

  it("creates job with minimal fields", async () => {
    mockSingle.mockResolvedValueOnce({
      data: mockDbJobFailed,
      error: null,
    })

    const { createImportJob } = await import("./data-management")
    const result = await createImportJob(defaultCtx, {
      kind: "import",
    })

    expect(result.kind).toBe("import")
    expect(result.status).toBe("failed")
    expect(result.entityId).toBeNull()
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "import",
        status: "pending",
        created_by: "user-1",
      }),
    )
  })

  it("throws on supabase error", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: new Error("DB error"),
    })

    const { createImportJob } = await import("./data-management")
    await expect(
      createImportJob(defaultCtx, { kind: "export" }),
    ).rejects.toThrow("Failed to create import job")
  })
})
