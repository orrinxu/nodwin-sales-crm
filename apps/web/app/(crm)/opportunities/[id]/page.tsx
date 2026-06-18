import { notFound } from "next/navigation"
import { requireUser } from "@/lib/security/auth"
import {
  getOpportunityById,
  getBusinessUnitOptions,
} from "@/lib/data/opportunities"
import { getActivitiesForOpportunity } from "@/lib/data/activities"
import { getRevenueSchedule } from "@/lib/data/revenue-schedule"
import { updateOpportunityAction, createActivityAction, saveRevenueScheduleAction } from "../actions"
import { OpportunityDetailWrapper } from "@/components/opportunities/opportunity-detail-wrapper"

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireUser()
  const { id } = await params

  const ctx = { user, source: "web" as const }
  const [opportunity, businessUnits, activities, revenueSchedule] = await Promise.all([
    getOpportunityById(ctx, id),
    getBusinessUnitOptions(ctx),
    getActivitiesForOpportunity(ctx, id),
    getRevenueSchedule(ctx, id),
  ])

  if (!opportunity) {
    notFound()
  }

  return (
    <OpportunityDetailWrapper
      opportunity={opportunity}
      businessUnits={businessUnits}
      updateAction={updateOpportunityAction}
      activities={activities}
      createActivityAction={createActivityAction}
      saveRevenueScheduleAction={saveRevenueScheduleAction}
      revenueSchedule={revenueSchedule}
    />
  )
}
