import { requireUser } from "@/lib/security/auth"
import { KnowledgeSearch } from "@/components/knowledge/knowledge-search"

export const metadata = {
  title: "Knowledge - Nodwin CRM",
}

export default async function KnowledgePage() {
  // Gate the page on an authenticated session; the search itself is entitlement-
  // filtered per-user in the DB.
  await requireUser()
  return <KnowledgeSearch />
}
