#!/usr/bin/env bash
# scripts/ship-pr.sh
#
# Safe PR shipper for concurrent multi-agent merges
# -------------------------------------------------
# Encodes the one true merge sequence so every contributor (human or agent,
# and every SSH Claude instance) ships identically and can't repeat the
# "blocked merge reported as success, branch deleted anyway" failure.
#
# The sequence, with guards at each step:
#   1. rebase onto origin/<base> if the branch is behind (branch-protection
#      requires up-to-date-with-base before a squash merge);
#   2. verify the PR head == local HEAD (stale-head guard);
#   3. wait for CI to go green;
#   4. re-check we didn't fall behind during CI (a concurrent merge);
#   5. squash-merge, then CONFIRM the PR state is actually MERGED before
#      touching anything — a concurrent merge can block ours and `gh pr merge`
#      still exits 0 with only an "admin privileges" hint;
#   6. only then delete the remote branch, mirror <base> to the backup remote,
#      and watch the deploy.
# Steps 1-5 loop (bounded) so a losing merge race just rebases and retries.
#
# Usage:
#   scripts/ship-pr.sh [<pr-number>] [--no-deploy] [--no-mirror]
#     <pr-number>   PR to ship (default: the PR for the current branch)
#     --no-deploy   skip the post-merge deploy watch
#     --no-mirror   skip mirroring <base> to the backup remote
#
# Preconditions: run from the repo with the PR's feature branch checked out,
# working tree clean, `gh` authenticated.
#
# Config (env overrides):
#   SHIP_BASE (main) · SHIP_MIRROR_REMOTE (nodwin) · SHIP_DEPLOY_WORKFLOW
#   (deploy.yml) · SHIP_STAGING_URL · SHIP_MAX_RETRIES (4) · SHIP_CI_POLL (20)

set -euo pipefail

BASE_BRANCH="${SHIP_BASE:-main}"
MIRROR_REMOTE="${SHIP_MIRROR_REMOTE:-nodwin}"
DEPLOY_WORKFLOW="${SHIP_DEPLOY_WORKFLOW:-deploy.yml}"
STAGING_URL="${SHIP_STAGING_URL:-https://nodwin-crm-staging.orrinxu.com/login}"
MAX_RETRIES="${SHIP_MAX_RETRIES:-4}"
CI_POLL="${SHIP_CI_POLL:-20}"

DO_DEPLOY=1
DO_MIRROR=1
PR=""

log() { printf '\033[36m▸ %s\033[0m\n' "$*" >&2; }
die() { printf '\033[31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

for a in "$@"; do
  case "$a" in
    --no-deploy) DO_DEPLOY=0 ;;
    --no-mirror) DO_MIRROR=0 ;;
    -h|--help) sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) die "unknown flag: $a" ;;
    *) PR="$a" ;;
  esac
done

command -v gh >/dev/null 2>&1 || die "gh CLI not installed"
git rev-parse --git-dir >/dev/null 2>&1 || die "not inside a git repo"
[ -z "$(git status --porcelain)" ] || die "working tree not clean — commit or stash first"

BRANCH="$(git branch --show-current)"
[ -n "$BRANCH" ] || die "detached HEAD — check out the PR's feature branch first"
[ "$BRANCH" != "$BASE_BRANCH" ] || die "you're on $BASE_BRANCH — check out the PR's feature branch"

if [ -z "$PR" ]; then
  PR="$(gh pr view --json number -q .number 2>/dev/null || true)"
  [ -n "$PR" ] || die "no PR number given and none open for branch '$BRANCH'"
fi
log "shipping PR #$PR (branch '$BRANCH' → $BASE_BRANCH)"

# --- attempt loop: sync → verify → CI → merge, retrying across merge races ---
attempt=0
while :; do
  attempt=$((attempt + 1))
  [ "$attempt" -le "$MAX_RETRIES" ] || \
    die "still couldn't merge after $MAX_RETRIES attempts — another merger keeps racing; retry later or coordinate"

  git fetch origin -q
  if [ "$(git rev-list --count "HEAD..origin/$BASE_BRANCH")" != "0" ]; then
    log "behind origin/$BASE_BRANCH — rebasing"
    if ! git rebase "origin/$BASE_BRANCH"; then
      git rebase --abort >/dev/null 2>&1 || true
      die "rebase onto origin/$BASE_BRANCH conflicted (often CHANGELOG.md) — resolve manually, push, then re-run"
    fi
    git push --force-with-lease
    log "rebased + force-pushed (CI will re-run)"
  fi

  local_head="$(git rev-parse HEAD)"
  pr_head="$(gh pr view "$PR" --json headRefOid -q .headRefOid)"
  [ "$pr_head" = "$local_head" ] || \
    die "PR #$PR head ($pr_head) != local HEAD ($local_head) — push your branch, or check you're on the right PR"

  log "waiting for CI…"
  set +e
  gh pr checks "$PR" --watch --interval "$CI_POLL" >/dev/null 2>&1
  rc=$?
  set -e
  [ "$rc" -eq 0 ] || die "CI is not green (gh exit $rc) — inspect: gh pr checks $PR"
  log "CI green"

  # A merge may have landed while CI ran — re-sync before merging.
  git fetch origin -q
  if [ "$(git rev-list --count "HEAD..origin/$BASE_BRANCH")" != "0" ]; then
    log "fell behind during CI — re-syncing"
    continue
  fi

  log "merging (squash)…"
  gh pr merge "$PR" --squash >/dev/null 2>&1 || true
  state="$(gh pr view "$PR" --json state -q .state)"
  if [ "$state" = "MERGED" ]; then
    log "PR #$PR is MERGED ✓"
    break
  fi
  log "merge did not complete (state=$state) — a concurrent merge blocked it; re-syncing and retrying"
done

# --- post-merge: safe now that MERGED is confirmed ---
git push origin --delete "$BRANCH" >/dev/null 2>&1 || log "remote branch already gone"
git fetch origin -q
log "origin/$BASE_BRANCH now at $(git rev-parse --short "origin/$BASE_BRANCH")"

if [ "$DO_MIRROR" = "1" ] && git remote get-url "$MIRROR_REMOTE" >/dev/null 2>&1; then
  log "mirroring $BASE_BRANCH → $MIRROR_REMOTE"
  git push "$MIRROR_REMOTE" "origin/$BASE_BRANCH:refs/heads/$BASE_BRANCH" >/dev/null 2>&1 \
    && log "mirrored to $MIRROR_REMOTE" || log "mirror push failed (non-fatal — do it manually)"
fi

if [ "$DO_DEPLOY" = "1" ]; then
  sleep 5
  run="$(gh run list --workflow="$DEPLOY_WORKFLOW" --branch="$BASE_BRANCH" --limit=1 --json databaseId -q '.[0].databaseId' 2>/dev/null || true)"
  if [ -n "$run" ]; then
    log "watching deploy run $run…"
    if gh run watch "$run" --exit-status --interval "$CI_POLL" >/dev/null 2>&1; then
      log "deploy succeeded"
      [ -n "$STAGING_URL" ] && log "staging $STAGING_URL → HTTP $(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$STAGING_URL")"
    else
      log "deploy did NOT succeed — inspect: gh run view $run"
    fi
  else
    log "no '$DEPLOY_WORKFLOW' run found on $BASE_BRANCH yet"
  fi
fi

log "done — PR #$PR shipped"
