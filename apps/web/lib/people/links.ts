// Single source of truth for the colleague-profile action links (ORR-678).
// Changing email/Slack behaviour app-wide means editing only this file.

// Email — Gmail web compose (chosen over mailto per D5). To switch the whole app
// back to the default mail client, change this one return to `mailto:${email}`.
export function buildEmailHref(email: string): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`
}

// Slack DM — a deep link REQUIRES the member ID (U0…); a @handle cannot build one.
// `app_redirect` is the robust default: it opens the desktop app when installed
// and falls back to web. Returns null when no member ID is stored so callers
// render plain text instead of fabricating a broken link (D2).
export function buildSlackDmHref(slackMemberId: string | null | undefined): string | null {
  if (!slackMemberId) return null
  return `https://slack.com/app_redirect?channel=${encodeURIComponent(slackMemberId)}`
}
