export interface AuthEvent {
  user_id: string
  email: string
  action: "signup" | "login" | "token_refresh"
}

export interface AuthHookResponse {
  decision: "allow" | "reject"
  error?: string
}

export function extractEmailDomain(email: string): string | null {
  const atIndex = email.indexOf("@")
  if (atIndex <= 0 || atIndex === email.length - 1) {
    return null
  }
  return email.slice(atIndex + 1).toLowerCase()
}

export function isSignupAction(action: string): boolean {
  return action === "signup"
}

export function validateNextPath(rawNext: string): string {
  return rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/"
}

export function buildTokenValidationKey(secret: string): { kty: string; k: string } {
  return {
    kty: "oct",
    k: btoa(secret).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""),
  }
}
