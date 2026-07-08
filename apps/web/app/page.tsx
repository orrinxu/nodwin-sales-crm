import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { env } from "@/lib/security/env"

// Root forwards based on auth: the dashboard when signed in, the login page
// otherwise. (The canonical dashboard lives at /dashboard inside the (crm)
// route group so it inherits the sidebar layout.)
export default async function Home() {
  // Local preview bypasses real auth (requireUser returns a stub admin), so
  // send it straight to the app.
  if (env.NEXT_PUBLIC_ENV === "local-preview") {
    redirect("/dashboard")
  }

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  redirect(user ? "/dashboard" : "/login")
}
