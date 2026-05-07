"use client"

import { useState, type ReactNode } from "react"

import { Sidebar } from "./sidebar"
import { Header } from "./header"
import { MobileSidebar } from "./mobile-sidebar"
import { SandboxBanner } from "./sandbox-banner"
import { useSessionManager } from "@/lib/auth/session-manager"
import type { AuthenticatedUser } from "@/lib/security/auth"

interface AppShellProps {
  user: AuthenticatedUser
  children: ReactNode
}

export function AppShell({ user, children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useSessionManager()

  return (
    <div className="flex min-h-screen">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
      />
      <MobileSidebar
        open={mobileMenuOpen}
        onOpenChange={setMobileMenuOpen}
      />
      <div className="flex flex-1 flex-col min-w-0">
        <SandboxBanner />
        <Header
          user={user}
          onMenuClick={() => setMobileMenuOpen(true)}
        />
        <main className="flex flex-1 flex-col">
          {children}
        </main>
      </div>
    </div>
  )
}
