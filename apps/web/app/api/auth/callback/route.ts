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

  const supabase = createServerClient(
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

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=auth_failed&message=${encodeURIComponent(error.message)}`, origin),
    )
  }

  return response
}
