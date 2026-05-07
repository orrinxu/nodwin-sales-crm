import DOMPurify from "isomorphic-dompurify"

interface RichTextDisplayProps {
  html: string
  className?: string
}

export function RichTextDisplay({ html, className = "" }: RichTextDisplayProps) {
  if (!html) return null

  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "a",
      "ul",
      "ol",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "blockquote",
      "code",
      "pre",
    ],
    ALLOWED_ATTR: ["href", "title", "target", "rel"],
  })

  return (
    <div
      className={`prose prose-sm max-w-none text-sm text-muted-foreground ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  )
}
