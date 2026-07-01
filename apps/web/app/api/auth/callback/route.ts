import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { env } from "@/lib/security/env"

function isSafeRedirect(path: string, origin: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) {
    return false
  }
  try {
    const url = new URL(path, origin)
    return url.origin === new URL(origin).origin
  } catch {
    return false
  }
}

function createSupabaseClient(request: NextRequest, response: NextResponse) {
  return createServerClient(
    env.SUPABASE_URL,
    env.SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    },
  )
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/dashboard"

  const origin = env.APP_URL

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=missing_code", origin),
    )
  }

  const safeNext = isSafeRedirect(next, origin) ? next : "/dashboard"

  const response = NextResponse.redirect(new URL(safeNext, origin))

  const supabase = createSupabaseClient(request, response)

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=auth_failed&message=${encodeURIComponent(error.message)}`, origin),
    )
  }

  const { data: { user } } = await supabase.auth.getUser()

  // Consult the same allow-list the sign-up Edge hook uses (auth_allowed_domains),
  // via a SECURITY DEFINER RPC — no hard-coded list that could drift from the DB.
  let domainAllowed = false
  if (user?.email) {
    const { data: allowed } = await supabase.rpc("is_email_domain_allowed", {
      _email: user.email,
    })
    domainAllowed = allowed === true
  }

  if (!domainAllowed) {
    await supabase.auth.signOut()
    return NextResponse.redirect(
      new URL("/login?error=disallowed_domain", origin),
    )
  }

  return response
}
