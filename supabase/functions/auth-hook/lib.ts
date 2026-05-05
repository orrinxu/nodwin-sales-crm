export interface AuthEvent {
  user: {
    id: string
    email: string
    phone: string
    app_metadata: Record<string, unknown>
    user_metadata: Record<string, unknown>
  }
  action?: "signup" | "login" | "token_refresh"
}

export interface AuthHookResponse {
  decision: "deny" | "allow"
  error?: string
}

export function extractEmailDomain(email: string): string | null {
  const atIndex = email.indexOf("@")
  if (atIndex <= 0 || atIndex === email.length - 1) {
    return null
  }
  return email.slice(atIndex + 1).toLowerCase()
}

export function isSignupAction(action: string | undefined): boolean {
  return action === "signup"
}

export function buildTokenValidationKey(secret: string): { kty: string; k: string } {
  return {
    kty: "oct",
    k: btoa(secret).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""),
  }
}
