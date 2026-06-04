import Link from "next/link"
import { Users, LayoutGrid, Sliders } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

const sections = [
  { href: "/contacts", label: "Contacts", description: "Manage your contacts and address book.", icon: Users },
  { href: "/opportunities", label: "Opportunities", description: "Track deals, pipeline stages, and revenue.", icon: LayoutGrid },
  { href: "/admin/field-definitions", label: "Custom Fields", description: "Manage custom field definitions.", icon: Sliders },
]

export default function Home() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nodwin Sales CRM</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Internal sales CRM for the Nodwin Group.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map(({ href, label, description, icon: Icon }) => (
          <Link key={href} href={href}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardContent className="flex items-start gap-4 p-6">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className="size-5 text-muted-foreground" />
                </div>
                <div>
                  <h2 className="text-base font-medium">{label}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {description}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
