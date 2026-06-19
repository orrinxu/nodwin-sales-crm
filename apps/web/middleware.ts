import { createServerClient } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"
import { env } from "@/lib/security/env"

function isLocalPreview(): boolean {
  return env.NODE_ENV !== "production" && env.NEXT_PUBLIC_ENV === "local-preview"
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    env.SUPABASE_URL,
    env.SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    },
  )

  if (isLocalPreview()) {
    return response
  }

  const { data: { user } } = await supabase.auth.getUser()
  const isAuthenticated = !!user
  const pathname = request.nextUrl.pathname

  if (pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  if (pathname.startsWith("/login")) {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL("/dashboard", request.url))
    }
    return response
  }

  if (!isAuthenticated) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("next", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/* (Next.js internals)
     * - api/* (API routes handle their own auth)
     * - auth/* (OAuth callback, magic link confirm)
     * - favicon.ico
     */
    "/((?!_next|api|auth|favicon\\.ico).*)",
  ],
}
