import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/security/auth", () => ({
  requireUser: vi.fn(async () => ({ id: "mgr-1", email: "m@n.com", role: "sales_manager" })),
}))
vi.mock("@/lib/data/direct-reports", () => ({
  assignDirectReport: vi.fn(),
  removeDirectReport: vi.fn(),
  getUserDisplayName: vi.fn(async () => "Manager M"),
}))
vi.mock("@/lib/notifications/triggers", () => ({ notifyDirectReportReassigned: vi.fn(async () => {}) }))

import { assignDirectReportAction, removeDirectReportAction } from "./actions"
import { assignDirectReport, removeDirectReport } from "@/lib/data/direct-reports"
import { notifyDirectReportReassigned } from "@/lib/notifications/triggers"

const REP = "00000000-0000-0000-0000-0000000000a1"

describe("direct-reports actions (ORR-715)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("claims a rep and notifies the losing manager on a reassignment", async () => {
    vi.mocked(assignDirectReport).mockResolvedValue({ reportName: "Rep A", losingManagerId: "old-mgr" })
    const res = await assignDirectReportAction(REP)

    expect(res).toEqual({ ok: true })
    expect(assignDirectReport).toHaveBeenCalledWith(REP)
    expect(notifyDirectReportReassigned).toHaveBeenCalledWith({
      losingManagerId: "old-mgr",
      reportName: "Rep A",
      newManagerName: "Manager M",
    })
  })

  it("claims an unmanaged rep without notifying anyone", async () => {
    vi.mocked(assignDirectReport).mockResolvedValue({ reportName: "Rep A", losingManagerId: null })
    const res = await assignDirectReportAction(REP)
    expect(res).toEqual({ ok: true })
    expect(notifyDirectReportReassigned).not.toHaveBeenCalled()
  })

  it("does not notify when the losing manager is the actor themselves", async () => {
    vi.mocked(assignDirectReport).mockResolvedValue({ reportName: "Rep A", losingManagerId: "mgr-1" })
    await assignDirectReportAction(REP)
    expect(notifyDirectReportReassigned).not.toHaveBeenCalled()
  })

  it("maps an authorization error from the RPC", async () => {
    vi.mocked(assignDirectReport).mockRejectedValue(new Error("not authorised to manage this direct report"))
    const res = await assignDirectReportAction(REP)
    expect(res).toEqual({ ok: false, error: "You can only manage sales reps in your own entity and business unit." })
  })

  it("releases a report", async () => {
    vi.mocked(removeDirectReport).mockResolvedValue({ reportName: "Rep A" })
    const res = await removeDirectReportAction(REP)
    expect(res).toEqual({ ok: true })
    expect(removeDirectReport).toHaveBeenCalledWith(REP)
  })

  it("maps the not-your-report error on release", async () => {
    vi.mocked(removeDirectReport).mockRejectedValue(new Error("not your direct report"))
    const res = await removeDirectReportAction(REP)
    expect(res).toEqual({ ok: false, error: "They no longer report to you." })
  })

  it("rejects a non-uuid report id", async () => {
    await expect(assignDirectReportAction("nope")).rejects.toThrow()
    expect(assignDirectReport).not.toHaveBeenCalled()
  })
})
