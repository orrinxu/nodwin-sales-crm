interface RichTextDisplayProps {
  html: string
  className?: string
}

export function RichTextDisplay({ html, className = "" }: RichTextDisplayProps) {
  if (!html) return null

  return (
    <div
      className={`prose prose-sm max-w-none text-sm text-muted-foreground ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
