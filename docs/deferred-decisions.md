# Deferred decisions

Decisions consciously deferred (not forgotten). Each has a resolved-enough default
so work can proceed; this file records what still needs a real answer, from whom,
and what it blocks. Pair with the SOW section it came from.

---

## D4 — Multi-currency milestones / FX (cash-flow milestones)

**Status:** deferred — v1 inherits the opportunity currency; a mixed-currency deal
is **out of scope**. The working-capital derivation asserts a single currency
across all of a deal's milestones and throws otherwise.

**Needs:** the group FX decision — how the CRM converts between currencies for a
consolidated view (per SOW §2.2 non-goal 10, FX-consolidation is finance's job
today). Until an FX rate source + conversion policy is agreed, cross-currency sums
are refused rather than silently mis-added.

**Blocks:** deals whose client pays in one currency and vendors are paid in another
(a real case for cross-border sponsorships). Escalate to the FX gate before
building it. See SOW §4.14 (D4).

---

## D5 — Definition of `closed_won` (revenue recognition + handoff trigger)

**Status:** open — **needs a company/finance answer.** Does a deal become
`closed_won` on **contract signing**, on **email confirmation**, or at **start of
work**? Indian law allows revenue recognition at start-of-work, so the "right"
trigger may differ by entity.

**Needs:** a per-entity (or group) policy statement. This is *not* about the
cash-flow-milestone table or the derivation (those don't depend on when
`closed_won` fires) — it affects **revenue recognition** and the **auto-generated
P&L sheet / Handoff trigger** (SOW §5 item 14).

**Blocks:** the Handoff module's trigger + any revenue-recognition-date logic. The
milestone data model and derivation can ship without it. See SOW §4.14 (D5).

---

## D3 — Financing-cost method (finance sign-off)

**Status:** default in place (the integral method), **pending finance confirmation.**
Configurable at **Admin → Finance** (`cost_of_cash_settings.financing_cost_method`:
`integral` | `peak_duration`). A `// TODO(finance)` marks the calc.

**Needs:** finance to confirm the integral method (financed balance × monthly rate,
summed over months) vs. a simpler peak × duration. The integral method is correct
for multi-period deals where a single peak×duration over-/under-states the cost.

**Blocks:** nothing (parameterised) — but the numbers shouldn't be quoted to
clients as final until finance signs off. See SOW §4.14 (D3).

---

## D6 — Deduction base (finance sign-off)

**Status:** default `costOfCash ÷ revenue` (matches the sheet), **may change per
finance.** Configurable at **Admin → Finance** (`cost_of_cash_settings.deduction_base`:
`revenue` | `profit`).

**Needs:** finance to confirm revenue vs. profit as the denominator for the project
% deduction. See SOW §4.14 (D6).
