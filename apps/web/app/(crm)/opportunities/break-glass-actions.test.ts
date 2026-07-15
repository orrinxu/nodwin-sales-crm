import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/security/auth", () => ({
  requireUser: vi.fn(async () => ({ id: "exec-1", email: "founder@nodwin.com", role: "exec" })),
  requireRole: vi.fn(),
}))
vi.mock("@/lib/data/break-glass", () => ({ breakGlassConfidential: vi.fn() }))
vi.mock("@/lib/notifications/triggers", () => ({ notifyBreakGlass: vi.fn(async () => {}) }))

// The action module pulls in the whole opportunities data layer at import; stub
// the pieces that touch server-only infra so the import resolves under vitest.
vi.mock("@/lib/data/opportunities", () => ({
  createOpportunity: vi.fn(), updateOpportunity: vi.fn(), updateOpportunityStage: vi.fn(),
  bulkUpdateOpportunityStage: vi.fn(), bulkDeleteOpportunities: vi.fn(),
  opportunityCreateSchema: { parse: (v: unknown) => v }, opportunityUpdateSchema: { parse: (v: unknown) => v },
  opportunityStageUpdateSchema: { parse: (v: unknown) => v }, bulkStageUpdateSchema: { parse: (v: unknown) => v },
  bulkDeleteSchema: { parse: (v: unknown) => v }, opportunitySplitsUpdateSchema: { parse: (v: unknown) => v },
  opportunityTeamUpdateSchema: { parse: (v: unknown) => v }, updateOpportunitySplits: vi.fn(), updateOpportunityTeamMembers: vi.fn(),
}))
vi.mock("@/lib/data/activities", () => ({ createActivity: vi.fn(), activityCreateSchema: { parse: (v: unknown) => v } }))
vi.mock("@/lib/data/contacts", () => ({ searchAccountOptions: vi.fn(), searchContactOptions: vi.fn(), createContact: vi.fn(), contactCreateSchema: { parse: (v: unknown) => v } }))
vi.mock("@/lib/data/accounts", () => ({ createAccount: vi.fn(), accountCreateSchema: { parse: (v: unknown) => v } }))
vi.mock("@/lib/data/approvals", () => ({
  submitOpportunityForApproval: vi.fn(), recordApprovalDecision: vi.fn(), reassignApprovalStep: vi.fn(),
  cancelApprovalInstance: vi.fn(), notifyCurrentApprover: vi.fn(),
}))
vi.mock("@/lib/data/saved-views", () => ({ saveView: vi.fn(), deleteSavedView: vi.fn(), saveViewInputSchema: { parse: (v: unknown) => v } }))

import { breakGlassConfidentialAction } from "./actions"
import { breakGlassConfidential } from "@/lib/data/break-glass"
import { notifyBreakGlass } from "@/lib/notifications/triggers"

const VALID_ID = "00000000-0000-0000-0000-0000000000aa"

describe("breakGlassConfidentialAction (ORR-716)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("grants, then notifies the named list, and returns ok", async () => {
    vi.mocked(breakGlassConfidential).mockResolvedValue({
      opportunityId: VALID_ID, opportunityName: "Secret Deal", notifyUserIds: ["owner-1", "override-1"],
    })
    const res = await breakGlassConfidentialAction({ opportunityId: VALID_ID, reason: "Compliance review" })

    expect(res).toEqual({ ok: true })
    expect(breakGlassConfidential).toHaveBeenCalledWith(VALID_ID, "Compliance review")
    expect(notifyBreakGlass).toHaveBeenCalledWith(
      expect.objectContaining({
        opportunityId: VALID_ID,
        opportunityName: "Secret Deal",
        reason: "Compliance review",
        recipientUserIds: ["owner-1", "override-1"],
        actorName: "founder@nodwin.com",
      }),
    )
  })

  it("rejects an empty reason before touching the RPC", async () => {
    await expect(
      breakGlassConfidentialAction({ opportunityId: VALID_ID, reason: "   " }),
    ).rejects.toThrow()
    expect(breakGlassConfidential).not.toHaveBeenCalled()
  })

  it("maps an insufficient-privilege RPC error to a friendly message and does not notify", async () => {
    vi.mocked(breakGlassConfidential).mockRejectedValue(new Error("not authorised to break-glass into a Confidential deal"))
    const res = await breakGlassConfidentialAction({ opportunityId: VALID_ID, reason: "let me in" })

    expect(res).toEqual({ ok: false, error: "Only founders can break-glass into a Confidential deal." })
    expect(notifyBreakGlass).not.toHaveBeenCalled()
  })

  it("maps the already-entitled error", async () => {
    vi.mocked(breakGlassConfidential).mockRejectedValue(new Error("you already have access to this deal"))
    const res = await breakGlassConfidentialAction({ opportunityId: VALID_ID, reason: "x" })
    expect(res).toEqual({ ok: false, error: "You already have access to this deal." })
  })

  it("maps the non-confidential error", async () => {
    vi.mocked(breakGlassConfidential).mockRejectedValue(new Error("break-glass only applies to Confidential deals"))
    const res = await breakGlassConfidentialAction({ opportunityId: VALID_ID, reason: "x" })
    expect(res).toEqual({ ok: false, error: "That deal isn't Confidential." })
  })
})
