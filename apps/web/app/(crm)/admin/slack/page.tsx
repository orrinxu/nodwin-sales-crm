import { requireUser, requireRole } from "@/lib/security/auth"
import { getSlackConnections, getSlackEventRouting } from "@/lib/data/slack"
import { SlackConnectionsForm } from "@/components/admin/slack-connections-form"
import {
  saveSlackConnectionAction,
  deleteSlackConnectionAction,
  setSlackEventRoutingAction,
  sendTestSlackAction,
} from "./actions"

export default async function AdminSlackPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  const [connections, eventRouting] = await Promise.all([
    getSlackConnections(ctx),
    getSlackEventRouting(ctx),
  ])

  return (
    <SlackConnectionsForm
      connections={connections}
      eventRouting={eventRouting}
      saveAction={saveSlackConnectionAction}
      deleteAction={deleteSlackConnectionAction}
      setEventRoutingAction={setSlackEventRoutingAction}
      testAction={sendTestSlackAction}
    />
  )
}
