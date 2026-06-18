# RCA: Missing Sidebar + Broken DB on Local Preview

> **Incident:** "Host nodwin-sales-crm on :3002" repeatedly reported as done, but the app served a cards-only homepage with no sidebar and all CRM routes returned 500.
>
> **Severity:** High (wasted multiple engineering cycles across several "fixed it" rounds)
>
> **Root cause IDs:** RC-1 (branch mismatch), RC-2 (unapplied schema), RC-3 (incomplete verification)
>
> **Author:** Tech Writer
>
> **Date:** 2026-06-05

---

## Timeline

| Date / Time (SGT) | Event |
|---|---|
| **Jun 2, 10:22** | Commit `1ce612d` changes testing guide from port 3000 to **3002** on branch `feat/orr-425`. The PM2 ecosystem config (`infra/local-preview/ecosystem.config.js`) remains on port **3030**. Two port configs now exist. |
| **Jun 4, 09:05** | `124a763` — Root `/` redirects to `/contacts` land on `main`. |
| **Jun 4, 10:36** | `78d9440` — Dashboard home page with navigation cards lands on `main`. |
| **Jun 4, 11:33** | **`326c6e5`** — Sidebar navigation layout (`app/(crm)/layout.tsx`, sidebar component) lands on `main`. Every route under `(crm)/` now depends on this layout. |
| **Jun 4, ~11:33** | `feat/orr-432` was cut from `main` at `14820ef` — **before** the sidebar landed. The branch never has the sidebar on disk. |
| **Jun 4, 23:19–23:44** | Work on `feat/orr-432`: dashboard, tests, auth guard. All work is on the feature branch, not `main`. |
| **Jun 5, 00:06** | Merge `6828621` ("Merge branch 'main' into feat/orr-432") pulls sidebar + dashboard onto `feat/orr-432` on disk — but **the running PM2/dev process is not restarted**. The old process still serves the pre-merge code. |
| **Jun 5 (morning)** | Board checks `http://192.168.88.51:3002`. Sees cards-only homepage, no sidebar. Reports broken. |
| **Multiple rounds** | Agents check HTTP 200 on `/api/health` and the homepage. Report "serving on :3002" as done. Board opens browser — same broken state. |
| **Jun 5 (debug)** | Board investigates directly. Finds: (1) PM2/dev is running `feat/orr-432` branch, not `main`; (2) even after the merge is on disk, the running process is stale; (3) after restart, every `(crm)/` route returns 500 — the Supabase `.51` instance has no schema. |

---

## Root Causes

### RC-1: Branch mismatch

The dev server was running from `feat/orr-432`, not `main`. This branch was cut before the sidebar landed. The sidebar files (`app/(crm)/layout.tsx`, sidebar components, theme provider, recharts dep) never existed on disk until the merge `6828621` was pulled — and even then, not until the server was restarted.

**Why it happened:**

- The `infra/local-preview/README.md` and `deploy.sh` both say "pull latest from `main`" but there is no **pre-deploy branch check** in either script.
- PM2 was manually started from a working directory on `feat/orr-432` (possibly during development) and left running. There is no guard that asserts "you are on `main` before starting."
- The testing deployment guide (`docs/testing-deployment.md` §Option 3) mentions LAN access but never says "ensure you are on `main`."

**Why it was missed:**

Every prior verification attempt checked "is the server running on port 3002?" via `curl http://localhost:3002/api/health`. This returns `{"status":"ok"}` regardless of which branch is deployed. The homepage at `/` also renders on `feat/orr-432` because the root redirect (commit `124a763`) and dashboard navigation cards (commit `78d9440`) **were** included in the merge into `main` on Jun 4 — but the sidebar layout that wraps all `(crm)/` routes was in the same merge and should have been the verification target.

### RC-2: Unapplied schema

Even when the correct code was running (branch correct, process restarted), every route inside `(crm)/` returned HTTP 500 with `PGRST205: Could not find the table 'public.contacts' in the schema cache`. The Supabase instance at `192.168.88.51:54321` had never received the migrations from `supabase/migrations/`.

**Why it happened:**

- The local-preview setup guide (`infra/local-preview/README.md`) only mentions building the app — it never mentions running `supabase db push` or `pnpm db:migrate` against the `.51` Supabase instance.
- The startup guide (`docs/startup-guide.md`) has migration steps, but the local-preview flow is treated as a *subset* of the full startup guide. The deploy script (`deploy.sh`) only does `git pull → install → build → restart`. No DB step.
- The `.env.local` file for `.51` was hand-configured with keys from a Supabase project that was never linked via `supabase link`, so `supabase db push` would not target it without explicit setup.

### RC-3: Incomplete verification

Across multiple rounds, agents reported the task as done based on a shallow check: HTTP 200 on `/api/health` and a visual/textual check of the homepage. No agent ever:

1. Checked which branch was checked out (`git branch --show-current`)
2. Opened a route under `(crm)/` (e.g., `/contacts`, `/pipeline`, `/dashboard`)
3. Inspected the Supabase schema for the expected tables
4. Restarted the process after pulling new code

**How the verification gap propagated:**

| Round | What was checked | What should have been checked |
|---|---|---|
| 1st "host on :3002" | HTTP 200 on /api/health | Branch correctness + (crm)/ route renders + DB has tables |
| 2nd "fixed" | curl homepage, text match for "login" | Same as above + process restart after pull |
| 3rd "fixed" | curl homepage, text match for "CRM" | Same as above |
| Board root cause | Everything | N/A |

---

## Systemic Gaps

### No hosting checklist

There is no single document that lists the prerequisites for "host this app on a port." The `infra/local-preview/README.md` covers setup but omits:

- **Branch prerequisite:** Must be `main` (or an explicit named branch).
- **DB prerequisite:** Migrations must be applied; expected tables must exist.
- **Verification procedure:** Concrete steps to confirm the app works end-to-end.

The deploy script (`deploy.sh`) assumes `main` (via `git pull origin main`) but does not enforce it or verify it post-pull.

### Two port conventions

The PM2 ecosystem config uses port **3030**, but the testing guide was changed to port **3002** (commit `1ce612d` on `feat/orr-425`). This created confusion about which port the dev server should actually be on. The board was checking `:3002`; PM2 was configured for `:3030`.

### Silent merges

The merge commit `6828621` was pushed to the remote by Paperclip during the debugging session. The running dev server did not reflect it (stale process). The agent did not surface the merge or restart the process.

---

## Remediation

### Immediate (this issue)

1. [ ] Document this RCA (`docs/forensics/ORR-448-RCA.md`) ✅
2. [ ] Update `infra/local-preview/deploy.sh` to add a branch guard and a restart-after-pull step.
3. [ ] Update `infra/local-preview/README.md` to list all prerequisites: branch, DB migrations, verification steps.

### Short-term (next sprint)

4. [ ] Create a consolidated "hosting checklist" in `docs/` that covers: branch prerequisite, DB schema prerequisite, migration command, verification procedure.
5. [ ] Resolve the port convention: pick one port (3030 from PM2 or 3002 from testing guide) and update all docs to match.
6. [x] Update `docs/testing-deployment.md` to include a branch-check step and a verification section that routes through `(crm)/`. ✅

### Long-term (process)

7. [ ] Add a pre-deploy smoke test to `deploy.sh` that:
   - Asserts `git branch --show-current` is `main`
   - Runs `supabase db push` (or warns if unlinked)
   - Curls a `(crm)/` route and expects non-500
   - Restarts the PM2 process after pull
8. [ ] Add a task template for "host app on port X" tasks that includes the checklist items so agents check them automatically.
9. [ ] Investigate adding a PM2 ecosystem-level `pre-start` hook that verifies branch and DB health.
