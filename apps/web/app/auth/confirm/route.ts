import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { env } from "@/lib/security/env"

const ALLOWED_DOMAINS = ["nodwin.com", "trinitygaming.in", "maxlevel.gg"]

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

function isAllowedDomain(email: string | undefined): boolean {
  if (!email) return false
  const atIndex = email.lastIndexOf("@")
  if (atIndex <= 0 || atIndex >= email.length - 1) return false
  if (email.indexOf("@") !== atIndex) return false
  const domain = email.slice(atIndex + 1)
  return ALLOWED_DOMAINS.includes(domain.toLowerCase())
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
  const token_hash = searchParams.get("token_hash")
  const type = searchParams.get("type")
  const next = searchParams.get("next") ?? "/dashboard"

  const origin = env.APP_URL

  if (!token_hash || type !== "magiclink") {
    return NextResponse.redirect(
      new URL("/login?error=missing_code", origin),
    )
  }

  const safeNext = isSafeRedirect(next, origin) ? next : "/dashboard"

  const response = NextResponse.redirect(new URL(safeNext, origin))

  const supabase = createSupabaseClient(request, response)

  const { error } = await supabase.auth.verifyOtp({
    token_hash,
    type: "magiclink",
  })

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=auth_failed&message=${encodeURIComponent(error.message)}`, origin),
    )
  }

  const { data: { user } } = await supabase.auth.getUser()

  if (!isAllowedDomain(user?.email)) {
    await supabase.auth.signOut()
    return NextResponse.redirect(
      new URL("/login?error=disallowed_domain", origin),
    )
  }

  return response
}
