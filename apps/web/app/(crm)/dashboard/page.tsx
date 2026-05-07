import { requireUser } from "@/lib/security/auth"

export default async function DashboardPage() {
  const user = await requireUser()

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-muted-foreground">
          Welcome, {user.email ?? user.id}
        </p>
      </div>
    </div>
  )
}
