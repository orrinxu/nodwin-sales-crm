# Git Worktree Guideline

How git worktrees are created, named, and retired for this repo. Summarized as
rules in [`AGENTS.md`](../AGENTS.md) §11.5 — this document is the full rationale.

## TL;DR

- Worktrees are keyed to a **unit of work (ticket)**, not to a named agent.
- New worktrees live under `~/crm-worktrees/<ticket>`, branched fresh off `origin/main`.
- Two worktrees are **permanent** and must never be removed in a cleanup sweep:
  the primary `main` checkout and `crm-docs`.
- **Retire a worktree the moment its PR merges** — remove the worktree *and*
  delete the branch together.

## Why not worktree-per-agent?

The repo previously used one long-lived worktree per Paperclip agent
(`paperclip-backend-engineer-crm`, `paperclip-frontend-crm`, …). That design fit
Paperclip's model — a fixed roster of persistent agents, each with a stable home
that kept `node_modules` and the build cache warm across tickets.

It does **not** fit the current model (Paperclip is tracking-only; coding is done
in per-work Claude sessions), and it produced concrete problems:

- **Drift** — long-lived worktrees fell hundreds of commits behind `main`, so
  their branches looked "unmerged" and rotted.
- **Opaque names** — `paperclip-backend-engineer-crm` tells you nothing about
  what's actually in it; you have to open it to find out.
- **Accumulated junk** — reusing one worktree across tickets left stale untracked
  files lying around (leftover AI-router and financial-settings files, etc.).
- **Collisions** — concurrent instances sharing a worktree switched its git HEAD
  mid-task, landing commits on the wrong branch.
- **No lifecycle** — a per-agent worktree is never "done," so nothing was ever
  retired. Cleanup on 2026-07-11 removed 12 of 16 worktrees and ~180 stale
  branches that had piled up this way.

## The rules

### 1. Location & naming

- All worktrees live under one parent dir: `~/crm-worktrees/<ticket>`.
- Name the worktree after the ticket (`orr-630`), never after an agent or tool.
- Do not scatter worktrees across `~/` with ad-hoc names.

### 2. Permanent worktrees (never remove in a cleanup)

| Worktree | Purpose |
|---|---|
| primary `main` checkout | the canonical working copy |
| `crm-docs` | dedicated documentation worktree |

### 3. One isolated worktree per active ticket

Always branch fresh off the latest `origin/main`:

```bash
git fetch origin
git worktree add -b feat/orr-xxx ~/crm-worktrees/orr-xxx origin/main
```

Never share a worktree between concurrent instances — if two sessions need to
work at once, each gets its own worktree.

### 4. Retire at merge, not months later

When a PR squash-merges, remove the worktree **and** delete its branch in the
same step:

```bash
git worktree remove ~/crm-worktrees/orr-xxx
git branch -D feat/orr-xxx
```

Local branches are disposable once merged — they're recoverable from `origin`
and the reflog. Don't let them accumulate.

### 5. Salvage before force-removing a dirty worktree

If a worktree has untracked or uncommitted work you're about to discard, save it
first:

```bash
# uncommitted (tracked) changes
git -C ~/crm-worktrees/orr-xxx diff > ~/salvage/orr-xxx.diff
# untracked files
tar czf ~/salvage/orr-xxx-untracked.tar.gz <paths>
```

Then `git worktree remove --force`.

## Keeping fresh worktrees cheap (build cache)

The one real cost of per-ticket worktrees is rebuilding `node_modules` and the
Next.js cache. Preferred approach: a **small pool of reusable slot worktrees**
(`~/crm-worktrees/slot-1`, `slot-2`, …) that keep their caches warm — rebase a
slot onto `origin/main` and check out the ticket branch, rather than creating a
brand-new worktree each time. (A pnpm shared store is a possible future
optimization but is not set up today.)

## Paperclip-era branches

Legacy `paperclip-*` branches and worktrees are deprecated
(Kimi/DeepSeek-generated, largely superseded by later work in `main`). Retire
them on sight rather than trying to merge them.
