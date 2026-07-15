"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard,
  Target,
  Users,
  Building2,
  History,
  BarChart3,
  Sliders,
  ChevronDown,
  Gamepad2,
  Sparkles,
  Network,
} from "lucide-react"
import { adminSections } from "./admin-nav"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { useSignOut } from "@/lib/auth/session-manager"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useState } from "react"

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  // Unified Opportunities surface (ORR-711): scope chips (My Pipeline / All
  // Deals / Closing This Month) + Board/Table view. The old /pipeline page
  // folded into here; "My Pipeline · Board" is the default landing.
  { name: "Opportunities", href: "/opportunities", icon: Target },

  { name: "Accounts", href: "/accounts", icon: Building2 },
  { name: "Contacts", href: "/contacts", icon: Users },
  { name: "Activities", href: "/activities", icon: History },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Knowledge", href: "/knowledge", icon: Sparkles },
  // Direct-reports roster (ORR-715) — only for managers who maintain a reporting
  // line. Non-managers never see it (the page also guards with an empty state).
  { name: "Direct reports", href: "/direct-reports", icon: Network, managerOnly: true },
]

const MANAGER_NAV_ROLES = ["sales_manager", "regional_head", "group_sales_lead", "admin"]

interface SidebarProps {
  user: {
    id: string
    email?: string
    role?: string
  }
}

function SidebarNav({ className, role }: { className?: string; role?: string }) {
  const pathname = usePathname()
  const isAdminActive = pathname.startsWith("/admin")
  const [adminOpen, setAdminOpen] = useState(isAdminActive)
  const isManager = !!role && MANAGER_NAV_ROLES.includes(role)

  return (
    <nav className={cn("flex flex-col gap-1", className)}>
      {navigation.filter((item) => !item.managerOnly || isManager).map((item) => {
        const isActive =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href)
        return (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <item.icon
              className={cn("size-4 shrink-0", isActive && "text-primary")}
            />
            {item.name}
          </Link>
        )
      })}

      <Collapsible
        open={adminOpen}
        onOpenChange={setAdminOpen}
        className="flex flex-col gap-1"
      >
        {/* The label links to the /admin overview; a separate chevron toggles the
            inline section list, so "Admin" is reachable as a page (not just a toggle). */}
        <div className="flex items-center gap-1">
          <Link
            href="/admin"
            className={cn(
              "flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              pathname === "/admin"
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : isAdminActive
                  ? "text-sidebar-accent-foreground hover:bg-sidebar-accent"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <Sliders className={cn("size-4 shrink-0", isAdminActive && "text-primary")} />
            Admin
          </Link>
          <CollapsibleTrigger
            aria-label="Toggle admin sections"
            className={cn(
              "w-auto justify-center rounded-lg p-2.5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isAdminActive && "text-sidebar-accent-foreground",
            )}
          />
        </div>
        <CollapsibleContent>
          <div className="ml-1 flex flex-col gap-2 border-l border-border pl-5 pt-1">
            {adminSections.map((section) => (
              <Collapsible key={section.label} defaultOpen className="flex flex-col gap-1">
                <CollapsibleTrigger className="px-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
                  {section.label}
                </CollapsibleTrigger>
                <CollapsibleContent className="flex flex-col gap-1">
                  {section.items.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                          isActive
                            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                            : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        )}
                      >
                        <item.icon className="size-3.5 shrink-0" />
                        {item.name}
                      </Link>
                    )
                  })}
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </nav>
  )
}

function UserSection({ user }: SidebarProps) {
  const { signOut } = useSignOut()
  const router = useRouter()
  const initials = user.email
    ? user.email
        .split("@")[0]
        .split(/[._-]/)
        .map((p) => p[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?"

  return (
    <div className="border-t border-border p-3">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              className="h-auto w-full justify-start gap-3 px-3 py-2"
            />
          }
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-1 flex-col items-start text-left">
            <span className="text-sm font-medium">
              {user.email?.split("@")[0] ?? "User"}
            </span>
            <span className="text-xs text-muted-foreground">
              {user.role === "admin" ? "Admin" : "Sales Rep"}
            </span>
          </div>
          <ChevronDown className="size-4 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onClick={() => router.push("/settings")}>Settings</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onClick={async () => {
              await signOut()
              router.push("/login")
            }}
          >
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function SidebarDesktop({ user }: SidebarProps) {
  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 lg:border-r lg:border-border">
      <div className="flex h-16 items-center gap-2 border-b border-border px-6">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
          <Gamepad2 className="size-4 text-primary-foreground" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-foreground">Nodwin</span>
          <span className="text-xs text-muted-foreground">Sales CRM</span>
        </div>
      </div>
      <ScrollArea className="flex-1 px-3 py-4">
        <SidebarNav role={user.role} />
      </ScrollArea>
      <UserSection user={user} />
    </aside>
  )
}

export function SidebarMobile({ user }: SidebarProps) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="lg:hidden" />
        }
      >
        <Gamepad2 className="size-5" />
        <span className="sr-only">Open navigation menu</span>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center gap-2 border-b border-border px-6">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
              <Gamepad2 className="size-4 text-primary-foreground" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">
                Nodwin
              </span>
              <span className="text-xs text-muted-foreground">Sales CRM</span>
            </div>
          </div>
          <ScrollArea className="flex-1 px-3 py-4">
            <SidebarNav role={user.role} />
          </ScrollArea>
          <UserSection user={user} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function Sidebar({ user }: SidebarProps) {
  return <SidebarDesktop user={user} />
}
