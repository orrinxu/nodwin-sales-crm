import { requireUser, requireRole } from "@/lib/security/auth"
import { getEmailTransport } from "@/lib/data/email-transport"
import { EmailTransportForm } from "@/components/admin/email-transport-form"
import { saveEmailTransportAction, sendTestEmailAction } from "./actions"

export default async function AdminEmailPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  const config = await getEmailTransport(ctx)

  return (
    <EmailTransportForm
      config={config}
      currentUserEmail={user.email ?? ""}
      saveAction={saveEmailTransportAction}
      testAction={sendTestEmailAction}
    />
  )
}
