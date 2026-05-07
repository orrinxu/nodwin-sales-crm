"use client"

import Link from "next/link"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { TooltipProvider } from "@/components/ui/tooltip"
import { NavMain, mainNavItems } from "./nav-main"

interface MobileSidebarProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MobileSidebar({ open, onOpenChange }: MobileSidebarProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-64 p-0">
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle>
          <Link
            href="/dashboard"
            className="flex items-center gap-2"
            onClick={() => onOpenChange(false)}
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              N
            </div>
            <span className="text-sm font-semibold">Nodwin CRM</span>
          </Link>
        </SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-2 p-2 pt-4">
          <TooltipProvider>
            <NavMain
              items={mainNavItems}
              onItemClick={() => onOpenChange(false)}
            />
          </TooltipProvider>
        </div>
      </SheetContent>
    </Sheet>
  )
}
