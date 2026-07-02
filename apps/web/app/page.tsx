import { redirect } from "next/navigation"

// The canonical dashboard lives at /dashboard, inside the (crm) route group so
// it inherits the sidebar layout. Root just forwards there (post-login redirects
// and the sidebar nav also point at /dashboard).
export default function Home() {
  redirect("/dashboard")
}
