import type { DealStage } from "@/lib/opportunity"
import type { DealHealth } from "@/lib/opportunity/deal-health"

export const PROJECT_TYPES = [
  "ip",
  "white_label",
  "media_rights",
  "d2c_retail",
  "d2c_pins",
  "d2c_touring",
  "consulting_tech",
  "consulting_ideas",
  "talent_management",
  "pr_services",
  "other",
] as const

export type ProjectType = (typeof PROJECT_TYPES)[number]

export const REVENUE_CATEGORIES = ["live", "content"] as const

export type RevenueCategory = (typeof REVENUE_CATEGORIES)[number]

export const RECURRING_SPLIT_KINDS = ["flat", "custom"] as const

export type RecurringSplitKind = (typeof RECURRING_SPLIT_KINDS)[number]

export const VISIBILITY_TIERS = ["standard", "restricted", "confidential"] as const

export type VisibilityTier = (typeof VISIBILITY_TIERS)[number]

export const SERVICE_TYPES = [
  "brand_campaign_and_activation",
  "content_production",
  "convention_b2c",
  "publisher_services",
  "shop_b2c_retail",
  "studio_production",
  "talent_influencer_services",
  "consultancy_services",
  "pr",
] as const

export type ServiceType = (typeof SERVICE_TYPES)[number]

export const PROPERTY_TYPES = [
  "conference",
  "expo",
  "festival",
  "food_festival",
  "scripted_reality_show",
  "talk_show",
  "tournament",
  "consultancy_services",
] as const

export type PropertyType = (typeof PROPERTY_TYPES)[number]

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  brand_campaign_and_activation: "Brand Campaign & Activation",
  content_production: "Content Production",
  convention_b2c: "Convention B2C",
  publisher_services: "Publisher Services",
  shop_b2c_retail: "Shop/B2C/Retail",
  studio_production: "Studio Production",
  talent_influencer_services: "Talent/Influencer Services",
  consultancy_services: "Consultancy Services",
  pr: "PR",
}

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  conference: "Conference",
  expo: "Expo",
  festival: "Festival",
  food_festival: "Food Festival",
  scripted_reality_show: "Scripted/Reality Show",
  talk_show: "Talk Show",
  tournament: "Tournament",
  consultancy_services: "Consultancy Services",
}

export interface OpportunityRecord {
  id: string
  name: string
  accountId: string
  accountName: string | null
  primaryContactId: string | null
  /** Optional so existing record mocks don't need updating; always set by the data layer. */
  primaryContactName?: string | null
  stage: DealStage
  probabilityPct: number
  /** Decimal string representation of the amount (e.g. "50000.00"). Never a float. */
  amount: string
  currency: string
  ownerUserId: string
  ownerName: string | null
  salesUnitId: string
  revenueRecognitionUnitId: string | null
  billingEntityId: string | null
  entitySalesId: string | null
  serviceType: string[] | null
  propertyType: string | null
  barterValue: string | null
  servicePeriodStart: string | null
  servicePeriodEnd: string | null
  executionDate: string | null
  estimatedGrossMarginPct: number | null
  countryExecution: string | null
  projectType: string | null
  revenueCategory: string | null
  recurring: boolean
  recurringSplitKind: string | null
  description: string | null
  closeDate: string | null
  lossReason: string | null
  visibilityTier: string
  customData: Record<string, unknown>
  createdAt: string
  updatedAt: string
  /**
   * At-a-glance card health signals (overdue / stale). Attached in a batched pass
   * by the pipeline data layer (see lib/data/deal-health.ts) for board / table
   * rendering; `undefined` on records fetched elsewhere.
   */
  health?: DealHealth | null
}

export interface OpportunityListResult {
  opportunities: OpportunityRecord[]
  totalCount: number
}

const stageLabels: Record<DealStage, string> = {
  qualify: "Qualify",
  meet_and_present: "Meet & Present",
  propose: "Propose",
  negotiate: "Negotiate",
  verbal_agreement: "Verbal Agreement",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
}

export function getStageLabel(stage: DealStage): string {
  // eslint-disable-next-line security/detect-object-injection -- stage is typed DealStage
  return stageLabels[stage]
}

export interface BusinessUnitOption {
  id: string
  name: string
}

export interface OpportunityCreateInput {
  name: string
  accountId: string
  primaryContactId?: string
  stage: DealStage
  amount?: string
  currency?: string
  closeDate?: string
  description?: string
  ownerUserId?: string
  salesUnitId: string
  revenueRecognitionUnitId?: string
  billingEntityId?: string
  entitySalesId?: string
  serviceType?: ServiceType[]
  propertyType?: PropertyType
  barterValue?: string
  servicePeriodStart?: string
  servicePeriodEnd?: string
  executionDate?: string
  estimatedGrossMarginPct?: number
  countryExecution?: string
  projectType?: ProjectType
  revenueCategory?: RevenueCategory
  recurring?: boolean
  recurringSplitKind?: RecurringSplitKind
  probabilityPct?: number
  visibilityTier?: VisibilityTier
  lossReason?: string
  customData?: Record<string, unknown>
}

export interface OpportunitySplit {
  id: string
  opportunityId: string
  salesUnitId: string
  userId: string | null
  pct: number
  notes: string | null
  createdAt: string
}

export interface OpportunitySplitInput {
  salesUnitId: string
  userId?: string | null
  pct: number
  notes?: string | null
}

export interface OpportunitySplitsUpdateInput {
  splits: OpportunitySplitInput[]
}

export interface OpportunityTeamMember {
  id: string
  opportunityId: string
  userId: string
  userName: string | null
  role: string
  addedBy: string | null
  addedAt: string
}

export interface OpportunityTeamMemberInput {
  userId: string
  role: string
}

export interface UserOption {
  id: string
  fullName: string
}
