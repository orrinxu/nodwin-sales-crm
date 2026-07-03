import { requireUser, requireRole } from "@/lib/security/auth"
import { getAllAllowedDomains } from "@/lib/data/allowed-domains"
import { AllowedDomainsList } from "@/components/admin/allowed-domains-list"
import {
  createAllowedDomainAction,
  deleteAllowedDomainAction,
} from "./actions"

export default async function AdminAllowedDomainsPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  const domains = await getAllAllowedDomains(ctx)

  return (
    <AllowedDomainsList
      domains={domains}
      createAction={createAllowedDomainAction}
      deleteAction={deleteAllowedDomainAction}
    />
  )
}
