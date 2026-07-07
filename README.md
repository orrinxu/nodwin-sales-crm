# Nodwin CRM

> Internal sales CRM for the Nodwin Group — replacing Salesforce.
> Built for ~200+ users across multiple legal entities and regions.
> v1 ships to East Asia first, then rolls out group-wide.

---

## Read these in order

If you're a new contributor (human or agent), read these before doing anything:

1. **`AGENTS.md`** — the rules every agent must follow on every session
2. **`docs/SOW.md`** — the full Scope of Work (strategic context)
3. **`BUILD_TICKETS.md`** — what's being built next, in order
4. **`BOARD_RUNBOOK.md`** — what the human-in-the-loop does

---

## What this repo is

This is the source code for an internal CRM that holds:

- Sales pipeline data (accounts, contacts, opportunities, communications) for the Nodwin Group
- Confidential client RFPs and contract terms
- Deal values and revenue figures across multiple legal entities (NG India, NG Spr, Unpause, Trinity, MaxLevel, etc.)
- Reporting-line and visibility data for ~200 sales staff

It is built to replace Salesforce, integrating natively with the group's Google Workspace (Drive, Gmail, Calendar, Sheets, Slides) and Slack.

This is not a public product. It will not be sold. Future M&A acquisitions migrate onto this same instance.

---

## Architecture (one-paragraph version)

A Next.js (App Router) frontend talks to a Supabase backend (Postgres + Auth + Storage + Realtime + RLS). All data access goes through typed clients in `lib/data/`. All external service calls (AI, email, Slack, Drive, Gmail, Calendar) go through narrow modules in `lib/` that wrap the official SDKs and enforce safety properties: signature verification, spending caps, audit logging. Background jobs and scheduled work run through API routes under `apps/web/app/api/jobs/*`, triggered by a `pg_cron` scaffold (`supabase/migrations/20260619000008_pg_cron_scaffold.sql`); a managed durable-workflow layer (e.g. Inngest) is planned but not yet wired. The whole thing deploys as a Docker container on a single DigitalOcean VPS alongside a self-hosted Supabase stack (Postgres + Auth + Storage + Realtime, run via `docker compose`) plus a small Ollama VM (fallback AI). Authentication is Google OAuth restricted to allow-listed Nodwin Group domains.

Full architecture is in `docs/SOW.md` Section 6.

---

## The "managed primitives" approach

This project is being built primarily by AI-assisted ("vibe") coding by a non-coder lead. To make this safe for a system holding client RFPs and revenue data, the load-bearing security and correctness components are deliberately **not** vibe-coded — they are delegated to battle-tested managed primitives:

| Risk | Primitive used |
|---|---|
| Authentication | Supabase Auth + Google OAuth |
| Row-level access control | Supabase RLS with mandatory test suite |
| Money math | dinero.js + Postgres `numeric(20,4)` |
| Approval state machine | XState |
| Webhook signature verification | HMAC check against `POSTMARK_WEBHOOK_SECRET` (`lib/webhooks/postmark.ts`) |
| Inbound email parsing | Postmark Inbound (DKIM-verified) |
| Rate limiting | Supabase native |
| Email deliverability | Resend / SMTP with full SPF/DKIM/DMARC (outbound) |
| Background job durability | `api/jobs/*` routes + `pg_cron` scaffold (managed durable-workflow layer planned) |
| AI cost ceiling | Multi-layer caps (app + provider dashboard) |

The agents working on this repo write the *integration glue* around these primitives, not the primitives themselves. The primitives are committed to the repo as the first work done, before any UI or feature work begins. They live in `lib/` and `supabase/` and are flagged as high-risk in `AGENTS.md`.

A pre-launch external security audit (~$2-3K, one day of a senior security engineer's time) reviews specifically: RLS policies, webhook handlers, the inbound email parser. This is non-negotiable before East Asia goes live.

---

## Stack

See `AGENTS.md` §3 for the pinned stack. Summary:

Shipped and wired:

- **Next.js + TypeScript + shadcn/ui + Tailwind** (frontend)
- **Supabase** (Postgres + Auth + Storage + Realtime + RLS)
- **dinero.js** (money)
- **XState** (workflows)
- **Vitest** (tests)
- **pnpm** (package manager)
- Background jobs — `api/jobs/*` routes + `pg_cron` scaffold
- Email — outbound via Resend/SMTP; **Postmark inbound webhook only** (parsed in `lib/email/`, no `postmark` SDK dependency)
- Slack — optional, driven by a `SLACK_BOT_TOKEN` env var over raw `fetch` (no `@slack/bolt` dependency)

Aspirational / SOW targets (stubbed or not yet wired):

- Google Workspace (Drive, Gmail, Calendar, Sheets) — a `drive/` integration stub under `lib/integrations/`; no `googleapis` dependency yet
- Managed durable-workflow layer (e.g. Inngest) — planned, not installed
- End-to-end tests (Playwright) — not a dependency; unit/integration tests are Vitest only

---

## Getting started (human or agent)

### Prerequisites

| Tool | Minimum version | Install |
|---|---|---|
| **Docker Desktop** (or Docker Engine) | 24+ | https://docs.docker.com/get-docker/ |
| **Node.js** | 20+ | https://nodejs.org |
| **pnpm** | 10+ | `npm i -g pnpm` |
| **Supabase CLI** | 1.x | `brew install supabase/tap/supabase` or `npm i -g supabase` |

Docker must be running before you execute any `supabase:*` or `db:*` scripts. The Supabase local stack runs entirely in containers.

### Quick start

See **`docs/startup-guide.md`** for the full step-by-step local dev setup. See **`docs/setup-guide.md`** for the authentication configuration (OAuth, self-hosted Supabase, magic link). One-liner:

```bash
git clone <repo-url> && cd nodwin-crm && pnpm install && \
  cp apps/web/.env.example apps/web/.env.local && \
  pnpm supabase:start && pnpm db:migrate && pnpm db:seed && pnpm dev
```

App runs at http://localhost:3000. Supabase Studio at http://localhost:54323.

### Required env vars

See `apps/web/.env.example` for the full list. The minimum to boot locally:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only, never expose to browser)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_APP_NAME`
- `POSTMARK_WEBHOOK_SECRET` (inbound email signature verification)
- `RESEND_API_KEY` (optional — transactional/outbound email)
- `ANTHROPIC_API_KEY` (optional — or whichever AI provider you're testing with)

Google OAuth is brokered by Supabase Auth; the app never reads Google client credentials directly.

---

## Daily commands

```bash
pnpm dev              # dev server (frontend + supabase if running)
pnpm lint             # ESLint
pnpm typecheck        # TypeScript no-emit check
pnpm test             # Vitest unit + integration
pnpm db:test          # RLS policy test suite (must pass before merging any policy change)
pnpm db:migrate       # apply pending migrations
pnpm db:reset         # nuke local DB and re-apply all migrations + seed (development only)
pnpm build            # production build
```

CI runs all of these on every PR. PRs do not merge with red CI.

---

## Project structure

```
nodwin-crm/
├── AGENTS.md                  # rules for agents
├── README.md                  # this file
├── BOARD_RUNBOOK.md           # human-in-the-loop reference
├── BUILD_TICKETS.md           # ordered ticket list
├── CHANGELOG.md               # human-readable changelog
├── docs/
│   ├── SOW.md                 # full strategic source of truth (v1.1)
│   ├── startup-guide.md       # step-by-step local dev setup
│   ├── setup-guide.md         # authentication setup (OAuth, self-hosted Supabase, magic link)
│   ├── data-model.md          # schema reference
│   ├── integrations.md        # integration architecture details
│   ├── security.md            # threat model and pre-launch checklist
│   ├── runbook-incident.md    # incident response procedures
│   └── _sources/              # source documents (SOW originals)
├── apps/
│   └── web/                   # Next.js web application (main app)
│       ├── app/               # Next.js App Router pages
│       │   ├── page.tsx       # root page
│       │   ├── layout.tsx     # root layout
│       │   ├── globals.css    # Tailwind CSS v4 entry
│       │   └── api/           # server-side API routes
│       │       └── auth/
│       │           └── callback/  # Google OAuth callback
│       ├── lib/               # shared application code
│       │   ├── money.ts       # HIGH-RISK — dinero.js wrapper
│       │   ├── ai/            # HIGH-RISK — AI router + 6 provider adapters
│       │   │   ├── router.ts
│       │   │   ├── cap-enforcement.ts
│       │   │   ├── usage-logger.ts
│       │   │   ├── supabase-cap-source.ts
│       │   │   └── providers/ (anthropic, gemini, deepseek, moonshot, ollama, openai-compatible)
│       │   ├── webhooks/      # HIGH-RISK — signature verification
│       │   │   └── postmark.ts
│       │   ├── email/         # HIGH-RISK — inbound email parser
│       │   │   └── inbound.ts
│       │   ├── security/      # HIGH-RISK — auth, audit, env, errors
│       │   │   ├── auth.ts
│       │   │   ├── audit.ts
│       │   │   └── env.ts
│       │   ├── data/          # typed Supabase queries (one file per entity)
│       │   │   └── opportunity-stage-history.ts
│       │   ├── workflows/     # XState state machines
│       │   │   ├── deal-stage.ts
│       │   │   ├── approval.ts
│       │   │   └── *.test.ts
│       │   └── utils.ts
│       ├── __tests__/         # Vitest test files
│       ├── next.config.ts
│       └── vitest.config.ts
├── supabase/
│   ├── migrations/            # HIGH-RISK — SQL migrations, ordered
│   ├── policies/              # HIGH-RISK — RLS policies, one file per table
│   ├── tests/                 # pgTAP RLS tests
│   ├── functions/             # Edge functions (empty — planned)
│   └── seed/                  # local/test seed data (dev only)
├── infra/
│   └── local-preview/         # PM2 + local preview deployment
│       ├── ecosystem.config.js
│       └── deploy.sh
├── scripts/                   # CI / utility scripts
│   ├── check-rls-coverage.sh
│   ├── lint-rls.sh
│   └── paperclip-issue-update.sh
├── .github/
│   └── workflows/
│       ├── ci.yml             # lint + typecheck + test + RLS test
│       └── migration-ci.yml   # migration / schema-drift checks
├── apps/web/eslint.config.mjs # HIGH-RISK — flat config, do not weaken rules
├── .env.example               # documented env vars (no real values)
└── (config: package.json, tsconfig.json, pnpm-workspace.yaml, etc.)
```

---

## Branching and commit conventions

- `main` is the production branch. Only PRs merge here.
- One PR per ticket. PR title: `[TICKET-ID] short description`.
- Commits inside a PR can be many; squash on merge.
- Commit message convention: imperative mood, present tense ("Add", "Fix", "Refactor"). Reference ticket ID in the body if not in the title.
- Never force-push to `main`. Force-push to feature branches is fine if no one else is working on them.

---

## Deployment

See `deploy/DEPLOYMENT.md` for the full step-by-step deploy guide (VPS provisioning, env vars, DNS, OAuth, troubleshooting), `deploy/README.md` for the reference, and `deploy/SUPABASE-SETUP.md` for bringing up the self-hosted Supabase stack and applying migrations.

| Environment | App | Supabase | Purpose |
|---|---|---|---|
| Local | `pnpm dev` | local docker | individual development |
| Staging | Docker container on the DO VPS | self-hosted Supabase on the same VPS | live-like environment; agent UAT |
| Production | future/separate deployment | future/separate self-hosted stack | live East Asia (and eventually group-wide) |

Deploys run via GitHub Actions on merge to `main`: build the image, push to `ghcr.io`, then SSH to the VPS and `docker compose pull app && docker compose up -d app` (see `.github/workflows/deploy.yml`). The board (human) controls what merges to `main`; the CTO agent does not have authority to promote to production.

Migrations run as part of deploy. Failed migrations halt deploy and surface to the board.

---

## Security

See `docs/security.md` for the full threat model and pre-launch security checklist. Key points:

- Custom SMTP with full SPF/DKIM/DMARC is mandatory before any user receives a real email
- All public tables have RLS enabled, with policies tested in CI
- All webhook handlers verify signatures as the first line of code (Postmark: hand-written constant-time HMAC via `lib/webhooks/verify.ts` — no SDK)
- All AI calls go through `lib/ai/router.ts` which enforces multi-layer spending caps
- Inbound email pipeline is hardened against forgery (DKIM verification + sender match + dead-letter table)
- A pre-launch external security audit is mandatory before East Asia go-live

---

## Telemetry, audit log, observability

- **Audit log:** every mutating operation on Opportunity, Account, Contact, Approval, Document, and OpportunitySplit writes to a single `audit_log` table via Postgres triggers. See `docs/data-model.md` §4.11.
- **AI usage:** every AI call writes to `ai_usage` (user, provider, model, tokens, cost, feature, timestamp). Drives the AI cost dashboard and cap enforcement.
- **Application logs:** `docker compose logs` on the VPS (app container) + Supabase container logs. Sentry (or equivalent) for error tracking — added in v1.5.
- **Uptime monitoring:** to be added before East Asia go-live (Better Stack / Pingdom / similar).

---

## Open-source dependencies

This project uses many open-source packages. We pin major versions and audit transitive dependencies via `pnpm audit` in CI. Adding a new dependency requires board approval (see `AGENTS.md` §6, package.json is high-risk).

---

## Licence

Proprietary — internal Nodwin Group use only. Not for redistribution.

---

## Contact

- **Project lead** Orrin Xu

---

*If you are an agent reading this: now go read `AGENTS.md`. Then come back to this file if you need a refresher on stack or folders.*
