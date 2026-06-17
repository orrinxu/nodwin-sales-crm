/**
 * @deprecated Import from `@/lib/data/metrics` instead.
 * This file is a re-export shim for backward compatibility.
 */
export {
  getPipelineMetrics,
  getPipelineSummary,
  getRecentDeals,
  getRecentActivities,
  getReportingCurrency,
} from "./metrics"

export type {
  PipelineMetrics,
  PipelineStageSummary,
  RecentDealRecord,
  DashboardContext,
} from "./metrics"
