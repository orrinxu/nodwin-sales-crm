import "server-only"
import { sendNotification } from "./delivery"
import type { NotificationEventType } from "../data/notifications"

export interface StageChangeContext {
  opportunityId: string
  opportunityName: string
  fromStage: string
  toStage: string
  event: string
  ownerUserId: string
  entityId?: string
}

export async function notifyStageChange(
  ctx: StageChangeContext,
): Promise<void> {
  let eventType: NotificationEventType = "stage_change"
  let title: string
  let message: string
  const linkUrl = `/opportunities/${ctx.opportunityId}`

  switch (ctx.event) {
    case "CLOSE_WON":
      eventType = "deal_won"
      title = `Deal won: ${ctx.opportunityName}`
      message = `Opportunity "${ctx.opportunityName}" has been won (${ctx.fromStage} → ${ctx.toStage}).`
      break
    case "CLOSE_LOST":
      eventType = "deal_lost"
      title = `Deal lost: ${ctx.opportunityName}`
      message = `Opportunity "${ctx.opportunityName}" has been marked as lost (${ctx.fromStage} → ${ctx.toStage}).`
      break
    case "REOPEN":
      title = `Opportunity reopened: ${ctx.opportunityName}`
      message = `Opportunity "${ctx.opportunityName}" has been reopened at ${ctx.toStage}.`
      break
    default:
      title = `Stage change: ${ctx.opportunityName}`
      message = `Opportunity "${ctx.opportunityName}" moved from ${ctx.fromStage} to ${ctx.toStage}.`
  }

  try {
    await sendNotification(ctx.ownerUserId, eventType, {
      title,
      message,
      linkUrl,
      entityId: ctx.entityId,
      metadata: {
        event_type: eventType,
        event: ctx.event,
        opportunity_id: ctx.opportunityId,
        from_stage: ctx.fromStage,
        to_stage: ctx.toStage,
      },
    })
  } catch (err) {
    console.error(
      `[notifications] Failed to send stage change notification: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

export interface DealAssignedContext {
  opportunityId: string
  opportunityName: string
  newOwnerUserId: string
  entityId?: string
}

export async function notifyDealAssigned(
  ctx: DealAssignedContext,
): Promise<void> {
  try {
    await sendNotification(ctx.newOwnerUserId, "deal_assigned", {
      title: `Assigned: ${ctx.opportunityName}`,
      message: `You have been assigned to opportunity "${ctx.opportunityName}".`,
      linkUrl: `/opportunities/${ctx.opportunityId}`,
      entityId: ctx.entityId,
      metadata: {
        event_type: "deal_assigned",
        opportunity_id: ctx.opportunityId,
      },
    })
  } catch (err) {
    console.error(
      `[notifications] Failed to send deal assigned notification: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

export interface ApprovalRequestedContext {
  approverUserId: string
  opportunityName: string
  opportunityId: string
  stepNumber: number
  totalSteps: number
  entityId?: string
}

export async function notifyApprovalRequested(
  ctx: ApprovalRequestedContext,
): Promise<void> {
  try {
    await sendNotification(ctx.approverUserId, "approval_requested", {
      title: `Approval requested: ${ctx.opportunityName}`,
      message: `Your approval is needed for "${ctx.opportunityName}" (step ${ctx.stepNumber} of ${ctx.totalSteps}).`,
      linkUrl: `/opportunities/${ctx.opportunityId}`,
      entityId: ctx.entityId,
      metadata: {
        event_type: "approval_requested",
        opportunity_id: ctx.opportunityId,
        step_number: ctx.stepNumber,
        total_steps: ctx.totalSteps,
      },
    })
  } catch (err) {
    console.error(
      `[notifications] Failed to send approval requested notification: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

export interface BreakGlassContext {
  opportunityId: string
  opportunityName: string
  actorName: string
  reason: string
  /** Owner + prior named list (the RPC excludes the actor). */
  recipientUserIds: string[]
  entityId?: string
}

// Notify a Confidential deal's existing named list that someone broke glass into
// it (ORR-716). This is the real-time accountability channel for an emergency
// self-grant — every recipient already has access to the deal. Best-effort per
// recipient: a delivery failure is logged, never thrown (the grant already stands).
export async function notifyBreakGlass(ctx: BreakGlassContext): Promise<void> {
  const linkUrl = `/opportunities/${ctx.opportunityId}`
  for (const userId of ctx.recipientUserIds) {
    try {
      await sendNotification(userId, "confidential_break_glass", {
        title: `Break-glass access: ${ctx.opportunityName}`,
        message: `${ctx.actorName} used break-glass to access the Confidential deal "${ctx.opportunityName}". Reason: ${ctx.reason}`,
        linkUrl,
        entityId: ctx.entityId,
        metadata: {
          event_type: "confidential_break_glass",
          opportunity_id: ctx.opportunityId,
          actor_name: ctx.actorName,
        },
      })
    } catch (err) {
      console.error(
        `[notifications] Failed to send break-glass notification to ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
}

export interface DirectReportReassignedContext {
  /** The manager who lost the report (the one to notify). */
  losingManagerId: string
  reportName: string
  newManagerName: string
}

// Notify a manager that one of their direct reports was reassigned away (ORR-715,
// O2: no admin co-sign — the losing manager is informed, not asked). Best-effort.
export async function notifyDirectReportReassigned(
  ctx: DirectReportReassignedContext,
): Promise<void> {
  try {
    await sendNotification(ctx.losingManagerId, "direct_report_reassigned", {
      title: `Direct report reassigned: ${ctx.reportName}`,
      message: `${ctx.reportName} is now a direct report of ${ctx.newManagerName}.`,
      linkUrl: "/direct-reports",
      metadata: {
        event_type: "direct_report_reassigned",
        report_name: ctx.reportName,
        new_manager_name: ctx.newManagerName,
      },
    })
  } catch (err) {
    console.error(
      `[notifications] Failed to send direct-report reassignment notification: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

export interface MentionContext {
  mentionedUserId: string
  mentionedByName: string
  opportunityName?: string
  opportunityId?: string
  commentPreview: string
  entityId?: string
}

export async function notifyMention(ctx: MentionContext): Promise<void> {
  try {
    const contextStr = ctx.opportunityName
      ? ` on "${ctx.opportunityName}"`
      : ""

    await sendNotification(ctx.mentionedUserId, "mention", {
      title: `${ctx.mentionedByName} mentioned you`,
      message: `${ctx.mentionedByName} mentioned you${contextStr}: "${ctx.commentPreview}"`,
      linkUrl: ctx.opportunityId
        ? `/opportunities/${ctx.opportunityId}`
        : undefined,
      entityId: ctx.entityId,
      metadata: {
        event_type: "mention",
        mentioned_by_name: ctx.mentionedByName,
        opportunity_id: ctx.opportunityId ?? null,
      },
    })
  } catch (err) {
    console.error(
      `[notifications] Failed to send mention notification: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}
