"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard,
  Kanban,
  Users,
  Building2,
  History,
  BarChart3,
  Sliders,
  ChevronDown,
  Gamepad2,
  Globe,
  Briefcase,
  LinkIcon,
  Database,
} from "lucide-react"
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
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Pipeline", href: "/opportunities", icon: Kanban },

  { name: "Accounts", href: "/accounts", icon: Building2 },
  { name: "Contacts", href: "/contacts", icon: Users },
  { name: "Activities", href: "/activities", icon: History },
  { name: "Reports", href: "/reports", icon: BarChart3 },
]

const adminItems = [
  { name: "Custom Fields", href: "/admin/field-definitions", icon: Sliders },
  { name: "Entities", href: "/admin/entities", icon: Globe },
  { name: "Business Units", href: "/admin/business-units", icon: Briefcase },
  { name: "Relationship Types", href: "/admin/relationship-types", icon: LinkIcon },
  { name: "Data Management", href: "/admin/data-management", icon: Database },
]

interface SidebarProps {
  user: {
    id: string
    email?: string
    role?: string
  }
}

function SidebarNav({ className }: { className?: string }) {
  const pathname = usePathname()
  const isAdminActive = pathname.startsWith("/admin")
  const [adminOpen, setAdminOpen] = useState(isAdminActive)

  return (
    <nav className={cn("flex flex-col gap-1", className)}>
      {navigation.map((item) => {
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
        <CollapsibleTrigger
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            isAdminActive
              ? "text-sidebar-accent-foreground"
              : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          )}
        >
          <Sliders className={cn("size-4 shrink-0", isAdminActive && "text-primary")} />
          Admin
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-1 flex flex-col gap-1 border-l border-border pl-5 pt-1">
            {adminItems.map((item) => {
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
          <DropdownMenuItem disabled>Settings</DropdownMenuItem>
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
        <SidebarNav />
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
            <SidebarNav />
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
