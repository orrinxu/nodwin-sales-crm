"use client"

import * as React from "react"
import { SearchIcon, XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

interface FilterBarProps {
  children: React.ReactNode
  hasActiveFilters: boolean
  onClear: () => void
  className?: string
}

export function FilterBar({
  children,
  hasActiveFilters,
  onClear,
  className,
}: FilterBarProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
      {hasActiveFilters ? (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <XIcon />
          Clear
        </Button>
      ) : null}
    </div>
  )
}

interface FilterSearchProps {
  placeholder?: string
  value: string
  onChange: (value: string) => void
  className?: string
}

export function FilterSearch({
  placeholder = "Search...",
  value,
  onChange,
  className,
}: FilterSearchProps) {
  return (
    <div className={cn("relative flex-1 sm:max-w-xs", className)}>
      <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-8"
      />
    </div>
  )
}
