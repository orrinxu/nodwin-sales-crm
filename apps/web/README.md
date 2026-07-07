# web

The `web` app of the Nodwin CRM monorepo — the Next.js (App Router) frontend and its
server-side API routes. This is the main application; everything user-facing lives here.

## Development

```bash
pnpm dev   # runs `next dev -H 0.0.0.0` — app on http://localhost:3000
```

Run commands from the repo root so the workspace toolchain and Supabase stack come up together.

## Setup

Don't set this app up in isolation. See the root [`README.md`](../../README.md) for stack and
env vars, and [`docs/startup-guide.md`](../../docs/startup-guide.md) for the full local dev setup.
