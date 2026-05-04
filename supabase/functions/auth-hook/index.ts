import { createClient } from "jsr:@supabase/supabase-js@2"
import { jwtVerify, importJWK } from "npm:jose@5"
import {
  type AuthEvent,
  type AuthHookResponse,
  extractEmailDomain,
  isSignupAction,
  buildTokenValidationKey,
} from "./lib.ts"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

async function verifyHookJwt(authHeader: string | null): Promise<void> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or malformed Authorization header")
  }

  const token = authHeader.slice(7)
  const secret = Deno.env.get("SUPABASE_JWT_SECRET")
  if (!secret) throw new Error("SUPABASE_JWT_SECRET is not configured")
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
    await verifyHookJwt(req.headers.get("Authorization"))
  } catch {
    return Response.json(
      { decision: "reject", error: "Unauthorized" } satisfies AuthHookResponse,
      { status: 401 },
    )
  }

  try {
    const event: AuthEvent = await req.json()

    if (!isSignupAction(event.action)) {
      return Response.json({ decision: "allow" } satisfies AuthHookResponse)
    }

    const emailDomain = extractEmailDomain(event.email)
    if (!emailDomain) {
      return Response.json(
        { decision: "reject", error: "Invalid email address" } satisfies AuthHookResponse,
        { status: 400 },
      )
    }

    const { data: allowedDomains, error } = await supabase
      .from("auth_allowed_domains")
      .select("domain")
      .eq("domain", emailDomain)

    if (error) {
      console.error("Auth hook domain lookup failed:", error.message)
      return Response.json(
        { decision: "reject", error: "Internal error verifying domain" } satisfies AuthHookResponse,
        { status: 500 },
      )
    }

    if (!allowedDomains || allowedDomains.length === 0) {
      return Response.json(
        {
          decision: "reject",
          error: `Sign-up from domain '${emailDomain}' is not allowed`,
        } satisfies AuthHookResponse,
      )
    }

    return Response.json({ decision: "allow" } satisfies AuthHookResponse)
  } catch (err) {
    console.error("Auth hook unexpected error:", err)
    return Response.json(
      { decision: "reject", error: "Internal error" } satisfies AuthHookResponse,
      { status: 500 },
    )
  }
})
