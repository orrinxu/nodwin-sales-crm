import "server-only"

/* eslint-disable node/no-process-env -- single env-access boundary for server-side vars */
export const env = {
  POSTMARK_WEBHOOK_SECRET: process.env.POSTMARK_WEBHOOK_SECRET as string | undefined,
} as const
