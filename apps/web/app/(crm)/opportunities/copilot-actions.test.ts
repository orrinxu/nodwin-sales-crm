import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const { requireUser, getOpportunityById, getActivitiesForOpportunity, runDealCopilot } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getOpportunityById: vi.fn(),
  getActivitiesForOpportunity: vi.fn(),
  runDealCopilot: vi.fn(),
}))

vi.mock("@/lib/security/auth", () => ({ requireUser }))
vi.mock("@/lib/data/opportunities", () => ({ getOpportunityById }))
vi.mock("@/lib/data/activities", () => ({ getActivitiesForOpportunity }))
vi.mock("@/lib/ai/deal-copilot", () => ({ runDealCopilot }))

import {
  dealCopilotSummaryAction,
  dealCopilotEmailAction,
  dealCopilotNextBestActionAction,
} from "./copilot-actions"

const USER = { id: "user-1", email: "dana@nodwin.com", role: "sales" }
const OPP_ID = "11111111-1111-1111-1111-111111111111"

beforeEach(() => {
  vi.clearAllMocks()
  requireUser.mockResolvedValue(USER)
  getOpportunityById.mockResolvedValue({ id: OPP_ID, name: "Acme" })
  getActivitiesForOpportunity.mockResolvedValue([{ id: "a1", type: "call" }])
  runDealCopilot.mockResolvedValue({ ok: true, text: "generated" })
})

describe("deal copilot server actions", () => {
  it("loads the deal under the authenticated user context (RLS-gated) and runs the copilot", async () => {
    const res = await dealCopilotSummaryAction(OPP_ID)

    expect(requireUser).toHaveBeenCalled()
    // deal fetched with the user ctx so RLS applies
    expect(getOpportunityById).toHaveBeenCalledWith(
      { user: USER, source: "web" },
      OPP_ID,
    )
    // copilot invoked with the user id, the resolved action + deal + activities
    expect(runDealCopilot).toHaveBeenCalledWith(
      USER.id,
      "summary",
      { id: OPP_ID, name: "Acme" },
      [{ id: "a1", type: "call" }],
    )
    expect(res).toEqual({ ok: true, text: "generated" })
  })

  it("maps each action to its copilot action tag", async () => {
    await dealCopilotEmailAction(OPP_ID)
    expect(runDealCopilot.mock.calls[0][1]).toBe("email")

    runDealCopilot.mockClear()
    await dealCopilotNextBestActionAction(OPP_ID)
    expect(runDealCopilot.mock.calls[0][1]).toBe("next_best_action")
  })

  it("returns a not-found result WITHOUT calling the model when the deal isn't visible", async () => {
    getOpportunityById.mockResolvedValue(null)
    const res = await dealCopilotSummaryAction(OPP_ID)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/not found|access/i)
    expect(runDealCopilot).not.toHaveBeenCalled()
  })

  it("passes the unconfigured result straight through", async () => {
    runDealCopilot.mockResolvedValue({ ok: false, unconfigured: true, error: "AI is not configured." })
    const res = await dealCopilotSummaryAction(OPP_ID)
    expect(res).toMatchObject({ ok: false, unconfigured: true })
  })

  it("rejects a non-uuid opportunity id", async () => {
    await expect(dealCopilotSummaryAction("not-a-uuid")).rejects.toThrow()
    expect(runDealCopilot).not.toHaveBeenCalled()
  })
})
