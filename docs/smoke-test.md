# Pre-Deploy Smoke Test: 3-Check Procedure

> Owner: Tech Writer
> Last updated: 2026-06-05
> Applies to: Local preview deployments (`infra/local-preview/`)

---

## Purpose

Prevent the class of failure documented in [ORR-448 RCA](forensics/ORR-448-RCA.md): a deploy that
reports "done" but serves stale code, wrong branch, or broken schema.

Run this procedure **after** pulling changes and **before** declaring a deploy complete.

---

## The 3 Checks + Restart

### Check 1: Branch guard

Assert the checked-out branch is `main`.

```bash
CURRENT=$(git branch --show-current)
if [ "$CURRENT" != "main" ]; then
  echo "FATAL: on branch '$CURRENT', expected 'main'"
  exit 1
fi
```

**If this fails:** you are on a feature branch. Either merge it to `main` and pull, or
switch to `main` (`git checkout main && git pull origin main`).

---

### Check 2: Schema check

Verify that Supabase migrations are applied and expected tables exist.

```bash
# Option A — if supabase is linked
supabase db push   # (--linked is optional; matches the db:migrate script / deploy.sh)

# Option B — verify table existence directly
psql "$SUPABASE_DB_URL" -c "
  SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'contacts'
  ) AS contacts_exists,
  EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'opportunities'
  ) AS opportunities_exists;
"
```

The query should return `true` for both `contacts_exists` and `opportunities_exists`.

**If this fails:** run `pnpm db:migrate` against the target Supabase instance. If the
instance is not linked, run `supabase link --project-ref <project-id>` first.

---

### Check 3: Route health check

Curl a route inside `(crm)/` and confirm it returns HTTP 200 (not 500).

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3030/contacts
# Expected: 200
```

The PM2 preview serves on port `3030` (as shown above). If your setup differs, use the port the app is actually serving on (see the `PORT` env var or PM2 config).

**If this fails (returns 500):** the app may be missing a dependency (sidebar layout,
theme provider, etc.) or the schema is not applied. Check the app logs:
`pm2 logs nodwin-crm-local-preview --lines 20`.

---

### Step 4: Process restart

After passing all 3 checks, restart the process so it picks up the newly pulled code:

```bash
pm2 restart nodwin-crm-local-preview
```

Re-run **Check 3** after the restart to confirm the fresh process serves correctly.

---

## Full script

The checks above can be combined into a single script. The canonical implementation
lives at `infra/local-preview/deploy.sh`. If you are running the smoke test manually,
execute the checks in order:

```bash
# 1. Branch
git branch --show-current | grep -q main || { echo "Wrong branch"; exit 1; }

# 2. Schema
supabase db push 2>/dev/null || {
  echo "Schema check failed — run pnpm db:migrate";
  exit 1;
}

# 3. Route
curl -sf http://localhost:3030/contacts > /dev/null || {
  echo "Route health check failed";
  exit 1;
}

# 4. Restart
pm2 restart nodwin-crm-local-preview

# 5. Verify after restart
sleep 2
curl -sf http://localhost:3030/contacts > /dev/null || {
  echo "Post-restart health check failed";
  exit 1;
}

echo "All checks passed."
```

---

## Verification checklist

- [ ] Check 1: `git branch --show-current` returns `main`
- [ ] Check 2: `contacts` and `opportunities` tables exist in the target DB
- [ ] Check 3: `GET /contacts` returns HTTP 200
- [ ] Step 4: PM2 restarted
- [ ] Post-restart: `GET /contacts` still returns HTTP 200

---

## Related documents

- [Incident Response Runbook](runbook-incident.md) — escalation if a check fails
- [ORR-448 RCA](forensics/ORR-448-RCA.md) — root cause analysis that motivated this procedure
- [Deploy Script](../infra/local-preview/deploy.sh) — canonical automation of this procedure
- [Local Preview README](../infra/local-preview/README.md) — setup prerequisites
