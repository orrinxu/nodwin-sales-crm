import { requireUser } from "@/lib/security/auth"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import Link from "next/link"
import {
  Users,
  Puzzle,
  GitBranch,
  DollarSign,
  Globe,
  Bot,
  ScrollText,
  type LucideIcon,
} from "lucide-react"

const adminCards: { title: string; description: string; href: string; icon: LucideIcon }[] = [
  { title: "Users", description: "Manage user accounts and roles", href: "/admin/users", icon: Users },
  { title: "Custom Fields", description: "Define custom fields for entities", href: "/admin/custom-fields", icon: Puzzle },
  { title: "Approval Workflows", description: "Configure approval processes", href: "/admin/approval-workflows", icon: GitBranch },
  { title: "Currencies", description: "Manage supported currencies", href: "/admin/currencies", icon: DollarSign },
  { title: "Domains", description: "Configure email domains", href: "/admin/domains", icon: Globe },
  { title: "AI Usage", description: "Monitor AI feature usage and limits", href: "/admin/ai-usage", icon: Bot },
  { title: "Audit Log", description: "View system audit trail", href: "/admin/audit-log", icon: ScrollText },
]

export default async function AdminOverviewPage() {
  const user = await requireUser()

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Welcome, {user.email ?? user.id}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {adminCards.map((card) => (
          <Link key={card.href} href={card.href}>
            <Card size="sm" className="h-full transition-colors hover:bg-muted/50">
              <CardHeader>
                <card.icon className="size-5 text-muted-foreground" />
                <CardTitle>{card.title}</CardTitle>
                <CardDescription>{card.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
