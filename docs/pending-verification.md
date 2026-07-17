# Pending Manual Verification

> Deferred manual/at-scale checks for work that shipped and passed CI, but whose
> behaviour can't be fully observed yet (usually because the environment lacks
> enough data or a real integration). Each item links a Paperclip ticket so the
> reminder is tracked, not just documented.
>
> When you verify an item, tick its checklist, note the result, and close the
> linked ticket.

---

## ORR-755 — List pagination at scale

- **Shipped:** 2026-07-17 (PR #342, merged to `main`, deployed to staging).
- **Tracking ticket:** ORR-762.
- **Why deferred:** server-driven pagination + the bounded kanban board only become
  observable past certain row counts. Staging did not have enough records to
  exercise them; seeding synthetic data was declined, so this is a manual re-check
  once the CRM is populated with real data.

### What to check once the CRM is populated

| # | Behaviour | Threshold | Where |
|---|-----------|-----------|-------|
| 1 | Table pagination footer (`1–25 of N`) + Prev/Next; a 2nd page appears | **> 25 rows** in a list | `/opportunities` (Table), `/accounts`, `/contacts` |
| 2 | Board note "Showing the N most recently updated of M deals" appears, and per-stage **column totals stay accurate over the full scope** (not just the fetched cards) | **> 500 deals** in one scope | `/opportunities` (Board) |
| 3 | List totals/counts and board column totals stay **correct** (the core fix — the old code silently truncated at PostgREST's 1000-row cap) | **> 1000 rows** | `/opportunities`, `/accounts`, `/contacts` |

Also confirm, across multiple pages:

- Server-side **search** (deal name **or** account name for opportunities), **stage**
  and **owner** filters, and **column sort** return correct results — not just a
  filter over the current page.
- **Saved views** round-trip (apply restores the filter/sort; save captures the
  current one).
- The **Board ⇄ Table** toggle and the scope chips (My / All / Closing This Month)
  and entity chips still compose correctly.

### Checklist

- [ ] 1 — table pagination verified past 25 rows
- [ ] 2 — board bounded-fetch note + accurate column totals verified past 500 deals
- [ ] 3 — totals/counts correct past 1000 rows
- [ ] Search / filter / sort correct across pages
- [ ] Saved views round-trip
- [ ] Close ORR-762
