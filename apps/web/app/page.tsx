import { redirect } from "next/navigation"

/**
 * Root `/` is unreachable under normal navigation — middleware redirects
 * `/` → `/dashboard`. This page exists as a safety-net fallback in case
 * middleware is bypassed (e.g. during local-preview auth skip, or in
 * test environments where middleware is not active).
 */
export default function RootPage() {
  redirect("/dashboard")
}
