export const businessUnitKinds = [
  "sales",
  "revenue_recognition",
  "ops",
  "shared",
] as const

export type BusinessUnitKind = (typeof businessUnitKinds)[number]
