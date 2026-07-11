import Link from "next/link"

import { requireUser, requireRole } from "@/lib/security/auth"
import { adminSections } from "@/components/layout/admin-nav"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function AdminPage() {
  const user = await requireUser()
  requireRole(user, "admin")

  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Configure your organisation, access, data, automation, and integrations.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {adminSections.map((section) => (
          <Card key={section.label}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <section.icon className="size-4 shrink-0 text-muted-foreground" />
                {section.label}
              </CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-1">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                    >
                      <item.icon className="size-3.5 shrink-0 text-muted-foreground" />
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
