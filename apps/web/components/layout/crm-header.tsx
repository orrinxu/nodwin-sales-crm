"use client"

import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { ModeToggle } from "@/components/theme/mode-toggle"
import { NotificationsDrawer } from "@/components/notifications/notifications-drawer"

export function CrmHeader() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-background px-6">
      <div className="relative w-80 max-w-full">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search deals, contacts..." className="pl-10" />
      </div>
      <div className="flex items-center gap-1">
        <ModeToggle />
        <NotificationsDrawer />
      </div>
    </header>
  )
}
