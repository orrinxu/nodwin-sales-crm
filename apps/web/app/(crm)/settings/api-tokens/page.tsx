import { requireUser } from "@/lib/security/auth"
import { listApiTokens } from "@/lib/data/api-tokens"
import { ApiTokensView } from "@/components/settings/api-tokens-view"
import { createApiTokenAction, revokeApiTokenAction } from "./actions"

// Per-user API tokens for external agents (NanoClaw / OpenClaw / scripts).
export default async function ApiTokensPage() {
  const user = await requireUser()
  const tokens = await listApiTokens({ user, source: "web" })

  return (
    <ApiTokensView
      tokens={tokens}
      createAction={createApiTokenAction}
      revokeAction={revokeApiTokenAction}
    />
  )
}
