"use client"

import { ModeToggle } from "@/components/theme/mode-toggle"
import { NotificationsDrawer } from "@/components/notifications/notifications-drawer"
import { SidebarMobile } from "@/components/layout/sidebar"
import { GlobalSearch } from "@/components/layout/global-search"
import { CreateLauncher } from "@/components/layout/create-launcher"

interface CrmHeaderProps {
  user: {
    id: string
    email?: string
    role?: string
  }
}

export function CrmHeader({ user }: CrmHeaderProps) {
  return (
    <header className="flex h-12 items-center justify-between gap-2 border-b border-border bg-background px-3 lg:h-14 lg:px-6">
      <div className="flex items-center gap-2">
        <SidebarMobile user={user} />
        <GlobalSearch />
      </div>
      <div className="flex items-center gap-1 lg:gap-1.5">
        <CreateLauncher />
        <ModeToggle />
        <NotificationsDrawer />
      </div>
    </header>
  )
}
