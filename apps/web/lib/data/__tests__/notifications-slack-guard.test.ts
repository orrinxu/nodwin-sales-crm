import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn() }))

import {
  notificationRoutingUpsertSchema,
  userNotificationOverrideUpsertSchema,
} from "../notifications"

const UUID = "11111111-1111-1111-1111-111111111111"

// ORR-811c — SLACK_ROUTABLE_EVENTS must be enforced at the schema layer, not just
// the admin UI, so a direct action/POST can't fan a confidential or per-recipient
// event out to the shared Slack channel.
describe("notificationRoutingUpsertSchema — Slack routable-event guard (ORR-811c)", () => {
  it("accepts slack for a routable event (approval_requested)", () => {
    expect(
      notificationRoutingUpsertSchema.safeParse({
        eventType: "approval_requested",
        channel: "slack",
        enabled: true,
      }).success,
    ).toBe(true)
  })

  it("rejects slack for confidential_break_glass", () => {
    expect(
      notificationRoutingUpsertSchema.safeParse({
        eventType: "confidential_break_glass",
        channel: "slack",
        enabled: true,
      }).success,
    ).toBe(false)
  })

  it("rejects slack for mention", () => {
    expect(
      notificationRoutingUpsertSchema.safeParse({
        eventType: "mention",
        channel: "slack",
        enabled: true,
      }).success,
    ).toBe(false)
  })

  it("rejects slack for direct_report_reassigned", () => {
    expect(
      notificationRoutingUpsertSchema.safeParse({
        eventType: "direct_report_reassigned",
        channel: "slack",
        enabled: true,
      }).success,
    ).toBe(false)
  })

  it("still allows in_app for a non-routable event", () => {
    expect(
      notificationRoutingUpsertSchema.safeParse({
        eventType: "confidential_break_glass",
        channel: "in_app",
        enabled: true,
      }).success,
    ).toBe(true)
  })
})

describe("userNotificationOverrideUpsertSchema — no per-user Slack overrides (ORR-811c)", () => {
  it("rejects any per-user slack override", () => {
    expect(
      userNotificationOverrideUpsertSchema.safeParse({
        userId: UUID,
        eventType: "deal_won",
        channel: "slack",
        enabled: true,
      }).success,
    ).toBe(false)
  })

  it("allows an email per-user override", () => {
    expect(
      userNotificationOverrideUpsertSchema.safeParse({
        userId: UUID,
        eventType: "deal_won",
        channel: "email",
        enabled: false,
      }).success,
    ).toBe(true)
  })
})
