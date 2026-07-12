import { notFound } from "next/navigation"
import { requireUser } from "@/lib/security/auth"
import { getUserProfileById } from "@/lib/data/user-profile"
import { PersonProfile } from "@/components/people/person-profile"

export default async function PersonProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const user = await requireUser()
  const { userId } = await params

  const ctx = { user, source: "web" as const }
  const profile = await getUserProfileById(ctx, userId)

  if (!profile) {
    notFound()
  }

  return <PersonProfile profile={profile} />
}
