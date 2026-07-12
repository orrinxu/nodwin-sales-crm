import { Mail, MessageSquare } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PublicProfileRecord } from "@/lib/data/user-profile"
import { buildEmailHref, buildSlackDmHref } from "@/lib/people/links"

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  )
}

// Read-only colleague profile. Server component — no interactivity beyond the
// email / Slack anchors, so nothing here needs "use client".
export function PersonProfile({ profile }: { profile: PublicProfileRecord }) {
  const slackHref = buildSlackDmHref(profile.slackMemberId)

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">
          {profile.fullName ?? "Unnamed user"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {profile.position ?? "Team member"}
        </p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" value={profile.fullName ?? "—"} />
            <Field label="Position" value={profile.position ?? "—"} />
            <Field label="Company" value={profile.entityName ?? "—"} />
            <Field
              label="Email"
              value={
                profile.email ? (
                  <a
                    href={buildEmailHref(profile.email)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <Mail className="size-3" />
                    {profile.email}
                  </a>
                ) : (
                  "—"
                )
              }
            />
            <Field
              label="Slack"
              value={
                slackHref ? (
                  <a
                    href={slackHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <MessageSquare className="size-3" />
                    Message on Slack
                  </a>
                ) : (
                  <span className="text-muted-foreground">Not connected</span>
                )
              }
            />
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
