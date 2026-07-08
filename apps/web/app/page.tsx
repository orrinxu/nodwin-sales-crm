import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { env } from "@/lib/security/env"

// Root forwards by session presence: /dashboard when a Supabase auth cookie is
// present, /login otherwise.
//
// We only READ cookies here. A Server Component can't write cookies, and a live
// `supabase.auth.getUser()` triggers Supabase's session refresh (setAll), which
// throws "Cookies can only be modified in a Server Action or Route Handler". The
// destination page validates the session for real (requireUser), so a stale or
// expired cookie still ends up back on /login.
export default async function Home() {
  if (env.NEXT_PUBLIC_ENV === "local-preview") {
    redirect("/dashboard")
  }

  const cookieStore = await cookies()
  const hasSession = cookieStore
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"))

  redirect(hasSession ? "/dashboard" : "/login")
}
