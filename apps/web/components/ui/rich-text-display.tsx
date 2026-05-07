"use client"

import DOMPurify from "dompurify"

interface RichTextDisplayProps {
  html: string
  className?: string
}

export function RichTextDisplay({ html, className = "" }: RichTextDisplayProps) {
  if (!html) return null

  const sanitizedHtml = DOMPurify.sanitize(html)

  return (
    <div
      className={`prose prose-sm max-w-none text-sm text-muted-foreground ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  )
}
