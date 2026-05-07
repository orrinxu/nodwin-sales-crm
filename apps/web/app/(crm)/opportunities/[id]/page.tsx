import { notFound } from "next/navigation"
import { requireUser } from "@/lib/security/auth"
import {
  getOpportunityById,
  getBusinessUnitOptions,
} from "@/lib/data/opportunities"
import { getDocumentsForOpportunity } from "@/lib/data/documents"
import { updateOpportunityAction, createDocumentAction } from "../actions"
import { OpportunityDetailWrapper } from "@/components/opportunities/opportunity-detail-wrapper"

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireUser()
  const { id } = await params

  const ctx = { user, source: "web" as const }
  const [opportunity, businessUnits, documents] = await Promise.all([
    getOpportunityById(ctx, id),
    getBusinessUnitOptions(ctx),
    getDocumentsForOpportunity(ctx, id),
  ])

  if (!opportunity) {
    notFound()
  }

  return (
    <OpportunityDetailWrapper
      opportunity={opportunity}
      businessUnits={businessUnits}
      documents={documents}
      updateAction={updateOpportunityAction}
      createDocumentAction={createDocumentAction}
    />
  )
}
