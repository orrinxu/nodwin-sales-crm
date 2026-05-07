"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  Contact,
  Briefcase,
  Shield,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
}

export const mainNavItems: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Accounts", href: "/accounts", icon: Users },
  { title: "Contacts", href: "/contacts", icon: Contact },
  { title: "Opportunities", href: "/opportunities", icon: Briefcase },
  { title: "Admin", href: "/admin", icon: Shield },
]

interface NavMainProps {
  items: NavItem[]
  collapsed?: boolean
  onItemClick?: () => void
}

export function NavMain({ items, collapsed, onItemClick }: NavMainProps) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/")

        if (collapsed) {
          return (
            <Tooltip key={item.href}>
              <TooltipTrigger
                render={
                  <Link
                    href={item.href}
                    onClick={onItemClick}
                    aria-label={item.title}
                    className={cn(
                      "inline-flex size-9 items-center justify-center rounded-lg hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
                    )}
                  >
                    <item.icon className="size-4" />
                  </Link>
                }
              />
              <TooltipContent side="right" sideOffset={8}>
                {item.title}
              </TooltipContent>
            </Tooltip>
          )
        }

        return (
          <Link key={item.href} href={item.href} onClick={onItemClick}>
            <Button
              variant="ghost"
              className={cn(
                "w-full justify-start gap-3 px-3",
                isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
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
