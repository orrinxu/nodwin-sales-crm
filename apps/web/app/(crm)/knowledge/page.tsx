import { requireUser, requirePermission } from "@/lib/security/auth"
import { KnowledgeSearch } from "@/components/knowledge/knowledge-search"

export const metadata = {
  title: "Knowledge - Nodwin CRM",
}

export default async function KnowledgePage() {
  // Reference for the roles-permissions enforcement pattern: gate a surface on a
  // permission key. Super Admin bypasses; every seeded role currently holds
  // `knowledge.view`, so this is additive (no access regression) and becomes
  // meaningful once an admin toggles it off for a role. Rolling this out to the
  // rest of the product surfaces is a tracked follow-up. The search results are
  // additionally entitlement-filtered per-user in the DB.
  const user = await requireUser()
  await requirePermission(user, "knowledge.view")
  return <KnowledgeSearch />
}
