"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  Settings,
  ScrollText,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export interface AdminNavItem {
  title: string
  href: string
  icon: LucideIcon
}

export const adminNavItems: AdminNavItem[] = [
  { title: "Overview", href: "/admin", icon: LayoutDashboard },
  { title: "Users", href: "/admin/users", icon: Users },
  { title: "Settings", href: "/admin/settings", icon: Settings },
  { title: "Audit Log", href: "/admin/audit-log", icon: ScrollText },
]

interface AdminNavProps {
  className?: string
}

export function AdminNav({ className }: AdminNavProps) {
  const pathname = usePathname()

  return (
    <nav className={cn("flex flex-col gap-0.5", className)}>
      {adminNavItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/")

        return (
          <Link key={item.href} href={item.href}>
            <Button
              variant="ghost"
              className={cn(
                "w-full justify-start gap-3 px-3",
                isActive && "bg-accent text-accent-foreground",
              )}
            >
              <item.icon className="size-4 shrink-0" />
              <span>{item.title}</span>
            </Button>
          </Link>
        )
      })}
    </nav>
  )
}
