import { createClient } from "npm:@supabase/supabase-js@2"
import { jwtVerify, importJWK } from "npm:jose@5"
import {
  type AuthEvent,
  type AuthHookResponse,
  extractEmailDomain,
  isSignupAction,
  buildTokenValidationKey,
} from "./lib.ts"

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

async function verifyHookJwt(authHeader: string | null): Promise<void> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or malformed Authorization header")
  }

  const token = authHeader.slice(7)
  const secret = Deno.env.get("SUPABASE_JWT_SECRET")
  if (!secret) {
    throw new Error("SUPABASE_JWT_SECRET is not configured")
  }
  const jwk = buildTokenValidationKey(secret)
  const { payload } = await jwtVerify(token, await importJWK(jwk), {
    algorithms: ["HS256"],
  })

  if (typeof payload.iss !== "string" || payload.iss !== "supabase") {
    throw new Error("Invalid JWT issuer")
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    const event: AuthEvent = await req.json()

    try {
      await verifyHookJwt(req.headers.get("Authorization"))
    } catch {
      return Response.json(
        { decision: "deny", error: "Unauthorized" } satisfies AuthHookResponse,
        { status: 401 },
      )
    }

    const actionHeader = req.headers.get("x-supabase-auth-hook-event")
    const action = event.action ?? actionHeader ?? undefined

    if (!isSignupAction(action)) {
      return Response.json({ decision: "allow" } satisfies AuthHookResponse)
    }

    const userEmail = event.user?.email
    if (!userEmail) {
      return Response.json(
        { decision: "deny", error: "Email is required" } satisfies AuthHookResponse,
        { status: 400 },
      )
    }

    const domain = extractEmailDomain(userEmail)
    if (!domain) {
      return Response.json(
        { decision: "deny", error: "Invalid email address" } satisfies AuthHookResponse,
        { status: 400 },
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data, error } = await supabase
      .from("auth_allowed_domains")
      .select("domain")
      .eq("domain", domain)
      .maybeSingle()

    if (error) {
      console.error("Auth hook error querying allowed domains:", error.message)
      return Response.json(
        { decision: "deny", error: "Internal error" } satisfies AuthHookResponse,
        { status: 500 },
      )
    }

    if (!data) {
      console.warn(`Auth hook denied sign-up from domain: ${domain} (email: ${userEmail})`)
      return Response.json(
        {
          decision: "deny",
          error: `Sign-up from domain "${domain}" is not allowed. Contact your administrator.`,
        } satisfies AuthHookResponse,
        { status: 403 },
      )
    }

    return Response.json(
      { decision: "allow" } satisfies AuthHookResponse,
    )
  } catch (err) {
    console.error("Auth hook unexpected error:", err)
    return Response.json(
      { decision: "deny", error: "Internal error" } satisfies AuthHookResponse,
      { status: 500 },
    )
  }
})
