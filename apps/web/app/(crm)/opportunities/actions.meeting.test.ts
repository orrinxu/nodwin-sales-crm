import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ActivityRecord } from "@/lib/data/activities"

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/security/auth", () => ({
  requireUser: vi.fn(async () => ({ id: "user-1", email: "u@n.com", role: "sales" })),
  requireRole: vi.fn(),
}))

// The activities data layer + push engine. Mock fns are created via vi.hoisted so
// they exist when the hoisted vi.mock factories run.
const { createActivityMock, pushMock } = vi.hoisted(() => ({
  createActivityMock: vi.fn(),
  pushMock: vi.fn(),
}))
vi.mock("@/lib/data/activities", () => ({
  createActivity: createActivityMock,
  activityCreateSchema: { parse: (v: unknown) => v },
}))
vi.mock("@/lib/integrations/calendar/push", () => ({
  pushMeetingToGoogle: pushMock,
}))

// Stub the remaining data/notification modules the actions barrel imports so the
// module graph loads without touching real server clients.
vi.mock("@/lib/data/opportunities", () => ({
  createOpportunity: vi.fn(),
  updateOpportunity: vi.fn(),
  updateOpportunityStage: vi.fn(),
  bulkUpdateOpportunityStage: vi.fn(),
  bulkDeleteOpportunities: vi.fn(),
  opportunityCreateSchema: { parse: (v: unknown) => v },
  opportunityUpdateSchema: { parse: (v: unknown) => v },
  opportunityStageUpdateSchema: { parse: (v: unknown) => v },
  bulkStageUpdateSchema: { parse: (v: unknown) => v },
  bulkDeleteSchema: { parse: (v: unknown) => v },
  opportunitySplitsUpdateSchema: { parse: (v: unknown) => v },
  opportunityTeamUpdateSchema: { parse: (v: unknown) => v },
  updateOpportunitySplits: vi.fn(),
  updateOpportunityTeamMembers: vi.fn(),
}))
vi.mock("@/lib/data/contacts", () => ({
  searchAccountOptions: vi.fn(),
  searchContactOptions: vi.fn(),
  createContact: vi.fn(),
  contactCreateSchema: { parse: (v: unknown) => v },
  searchUserOptions: vi.fn(),
}))
vi.mock("@/lib/data/accounts", () => ({
  createAccount: vi.fn(),
  accountCreateSchema: { parse: (v: unknown) => v },
}))
vi.mock("@/lib/data/opportunity-line-items", () => ({
  replaceOpportunityLineItems: vi.fn(),
  setOpportunityLineItemsPricing: vi.fn(),
  lineItemInputSchema: { parse: (v: unknown) => v },
}))
vi.mock("@/lib/data/approvals", () => ({
  submitOpportunityForApproval: vi.fn(),
  recordApprovalDecision: vi.fn(),
  reassignApprovalStep: vi.fn(),
  cancelApprovalInstance: vi.fn(),
  notifyCurrentApprover: vi.fn(),
}))
vi.mock("@/lib/data/saved-views", () => ({
  saveView: vi.fn(),
  deleteSavedView: vi.fn(),
  saveViewInputSchema: { parse: (v: unknown) => v },
}))
vi.mock("@/lib/data/break-glass", () => ({ breakGlassConfidential: vi.fn() }))
vi.mock("@/lib/notifications/triggers", () => ({ notifyBreakGlass: vi.fn() }))
vi.mock("@/lib/data/field-definitions", () => ({ getFieldDefinitions: vi.fn(async () => []) }))
vi.mock("@/lib/data/field-definitions.types", () => ({
  findMissingRequiredFields: vi.fn(() => []),
}))

import { createMeetingAction } from "./actions"

const activity = { id: "act-9", type: "meeting" } as ActivityRecord

beforeEach(() => {
  vi.clearAllMocks()
  createActivityMock.mockResolvedValue(activity)
})

describe("createMeetingAction (ORR-829)", () => {
  it("creates the meeting FIRST (type forced to 'meeting'), THEN pushes", async () => {
    pushMock.mockResolvedValue({ pushed: true, externalEventId: "g-1" })

    const result = await createMeetingAction("opp-1", {
      opportunityId: "opp-1",
      subject: "Kickoff",
      startsAt: "2026-07-21T09:00:00.000Z",
      endsAt: "2026-07-21T10:00:00.000Z",
    })

    // Persisted with type coerced to meeting, before the push ran.
    const createInput = createActivityMock.mock.calls[0][1]
    expect(createInput.type).toBe("meeting")
    // The created activity is what gets pushed.
    expect(pushMock).toHaveBeenCalledWith(expect.anything(), activity)
    expect(createActivityMock.mock.invocationCallOrder[0]).toBeLessThan(
      pushMock.mock.invocationCallOrder[0],
    )

    expect(result).toEqual({ activity, pushed: true })
  })

  it("reports a skipped push (calendar not connected) without a warning", async () => {
    pushMock.mockResolvedValue({ pushed: false, reason: "not_connected" })

    const result = await createMeetingAction("opp-1", { subject: "Sync" })

    expect(result.activity).toBe(activity)
    expect(result.pushed).toBe(false)
    expect(result.reason).toBe("not_connected")
    expect(result.pushWarning).toBeUndefined()
  })

  it("keeps the meeting and surfaces a soft warning when the push fails", async () => {
    pushMock.mockResolvedValue({ pushed: false, reason: "Google 500" })

    const result = await createMeetingAction("opp-1", { subject: "Sync" })

    // The meeting is never lost — the activity is still returned.
    expect(result.activity).toBe(activity)
    expect(result.pushed).toBe(false)
    expect(result.pushWarning).toBeTruthy()
  })
})
