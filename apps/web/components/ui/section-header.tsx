import * as React from "react"

import { cn } from "@/lib/utils"
import { CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card"

interface SectionHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function SectionHeader({
  title,
  description,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <CardHeader className={className}>
      <CardTitle>{title}</CardTitle>
      {description ? <CardDescription>{description}</CardDescription> : null}
      {action ? <CardAction>{action}</CardAction> : null}
    </CardHeader>
  )
}
