import Link from "next/link"

// Renders an internal user's (record owner's) name as a link to their read-only
// colleague profile at /people/[userId]. Degrades gracefully:
//   - no name        → the fallback label (e.g. "Unassigned")
//   - name, no id    → plain text (can't build a link)
//   - name + id      → link to the profile
// Plain (no "use client"): usable from both server and client component trees.
export function OwnerLink({
  userId,
  name,
  fallback = "Unassigned",
  className = "text-primary hover:underline",
  onPointerDown,
}: {
  userId: string | null | undefined
  name: string | null | undefined
  fallback?: string
  className?: string
  // Forwarded to the anchor so draggable contexts (kanban card) can stop the
  // pointerdown from being swallowed by the drag sensor.
  onPointerDown?: (e: React.PointerEvent) => void
}) {
  if (!name) {
    return <>{fallback}</>
  }
  if (!userId) {
    return <>{name}</>
  }
  return (
    <Link href={`/people/${userId}`} className={className} onPointerDown={onPointerDown}>
      {name}
    </Link>
  )
}
