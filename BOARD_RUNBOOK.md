# BOARD_RUNBOOK.md

> Your job, as the human on this project. Written for the project lead — currently Orrin Xu.
> Re-read this before every Paperclip session. It's short on purpose.

---

## What "the board" means

You are the board. In Paperclip's company metaphor, you sit above the CEO agent. You don't write code. You don't review every PR. You set goals, approve hires (new agents), approve high-risk changes, monitor budgets, and step in when things go wrong.

The CEO agent (Claude Code) reports to you. The CTO agent (also Claude Code, separate role) reports to the CEO. Worker agents report to the CTO. The security review agent runs in parallel as a check. You are above all of them.

If you do this well, you spend ~1 hour per day on this project — not 8.

---

## What you do

| Task | Frequency | Time |
|---|---|---|
| Morning standup review | Daily | 10–15 min |
| Approve high-risk PRs / agent hires | As they come up (Paperclip pings you) | 5–15 min each |
| Weekly progress review | Weekly | 30 min |
| Spot-check a recent PR end-to-end | Weekly | 30 min |
| Budget check | Weekly | 5 min |
| Talk to East Asia sales reps about UAT | Weekly during UAT phase | 30–60 min |
| Pre-launch security checklist sign-off | Once, before go-live | 2–3 hours |
| Engage external security auditor | Once, ~75% through build | 1 hour to set up |

If your time on this is creeping above ~5 hours/week outside the focused review sessions, something is wrong. Either the agents are surfacing too many decisions to you (tighten `AGENTS.md`) or the agents are doing the wrong work (check the CTO agent's review quality).

---

## What you do NOT do

- **You don't write code.** If you find yourself opening an IDE to fix something, stop. Open a ticket instead.
- **You don't write SQL migrations.** Same.
- **You don't deploy.** Production deploy is a manual approval gate; you click approve, you don't run the deploy command.
- **You don't review every PR.** That's the CTO agent's job. You spot-check and you review the ones flagged as high-risk.
- **You don't talk to AI providers' billing dashboards more than once a week.** If something is wrong with cost, alerting will tell you.

---

## Daily flow (10–15 min)

Open Paperclip. Check:

1. **Are there pending approvals?** If yes, work through them. Most should be quick — most are "agent X wants to modify high-risk file Y, here's why." Approve if reason is good and high-risk modification is genuinely necessary. Reject and ask for an alternative if not.
2. **What did the agents ship overnight?** Skim merged PRs from the last 24 hours. You don't read every line. You read the PR title, description, and the "high-risk file changes" section. If anything looks off, dig in. If everything looks normal, move on.
3. **Are budgets tracking sanely?** Paperclip shows per-agent spend. If any agent is unexpectedly high, that's a flag. Investigate.
4. **Are any tickets stuck?** If a ticket has been "in progress" for more than ~2x its estimated time, the agent might be looping. Check the ticket comments. If looping, intervene — either provide more context, or split the ticket, or escalate to the CEO agent.

---

## Weekly flow (30 min)

Once a week, deeper review:

1. **Reconcile against `BUILD_TICKETS.md`.** Are we ahead/behind plan? If behind, why?
2. **End-to-end spot check.** Pick one feature shipped this week. Use it. Click through the actual UI. Try to break it. This is your reality check that what the agents shipped actually works for a sales rep.
3. **Read the CHANGELOG.** If it's empty for the week, agents aren't documenting. Fix that.
4. **Budget review.** Total AI spend this week. Total infra cost. Track in a simple spreadsheet — month-over-month is what matters.
5. **Drift check.** Read 2–3 recent PRs in detail. Are they following `AGENTS.md`? Are tests being written? Are there subtle "TODOs" or "we'll fix later" comments creeping in? If yes, tighten the rules.

---

## Approval decisions — how to think about them

Paperclip will surface approval requests for things like "agent wants to modify `lib/money.ts`" or "agent wants to add a new dependency." Here's how to decide:

### High-risk file change
- **Approve** if: the change has a clear need (e.g., a new currency type), the agent has explained the reason, the change is small, tests are included.
- **Reject** if: the agent is "refactoring" without a clear functional reason, the change is large, no tests, or the reason involves making a failing test pass without explaining why the test was right or wrong.

### New dependency
- **Approve** if: the dependency is well-known (>1M weekly downloads, recent activity), there's a clear use case in the ticket, no obvious lighter-weight alternative exists.
- **Reject** if: it's a niche package, the agent picked it as the first result on npm without comparing, or it duplicates a primitive already in `lib/`.

### Agent hire
- The CEO agent will occasionally want to "hire" a new agent (e.g., a designer agent, a writer agent for documentation, a different coding agent for a specific stack). 
- **Approve** if: there's a clear gap the existing roster can't fill, the budget impact is acceptable, the new agent's role is well-defined.
- **Reject** if: the existing agents could do the work, or you don't understand what the new agent is for.

### Strategy / scope change
- The CEO agent might propose a scope change ("we should drop the WhatsApp integration entirely" or "we should add multi-tenancy in v1"). 
- **Approve** if: the reasoning is sound and you agree.
- **Reject** if: it conflicts with the SOW. The SOW was negotiated with Akshat and Mickael; agents don't get to override that without you going back to them.

---

## When to step in mid-build

Step in (i.e., interrupt the agents and have a direct conversation, possibly modifying `AGENTS.md`) when:

- **Same bug keeps reappearing.** The CTO agent's reviews aren't catching something. Update `AGENTS.md` to call out the pattern.
- **Agents are making decisions that should have been escalated.** This means the rules in `AGENTS.md` weren't clear enough. Add the missing rule.
- **Budget is racing ahead of progress.** Either the work is harder than expected, or the agents are spinning. Investigate.
- **A worker agent is producing low-quality work and the CTO is approving it anyway.** The CTO agent isn't doing its job. Have a direct conversation, tighten the CTO's review brief.
- **Anything in production breaks.** Your job to lead the response — see "Incident response" below.

---

## Incident response (rough)

If something is broken in production:

1. **Pause the relevant agents in Paperclip.** Don't let them try to fix it autonomously while you're still figuring out what happened.
2. **Read `docs/runbook-incident.md`** for the specific kind of incident.
3. **Decide: roll back, hotfix, or wait?** Rollback is usually safest. Hotfix only if the rollback would lose data. Wait only if the impact is small and you have time to investigate.
4. **Communicate.** Slack the affected sales team. Be honest about what happened and ETA to fix.
5. **After resolving, write a post-mortem.** A short one. Add to `docs/forensics/`. Update `AGENTS.md` if a rule needs to be tightened.

For the most likely incidents:
- **RLS leak** (someone sees data they shouldn't): immediately disable affected feature, then investigate. Do not allow the agent to "fix and continue." Pull in security auditor if it's a real leak.
- **AI cost runaway**: hit the kill switch by setting the company-scope cap to $0 in the `ai_daily_caps` table (`scope_kind='company'`, via the admin panel). Diagnose. Reset cap when fixed.
- **Inbound email pipeline accepting forged emails**: disable at the Postmark inbound config until investigated. (Note: the inbound handler is not yet route-mounted — it's unwired library code — so there is no admin-panel toggle.)
- **P&L sheet has wrong numbers**: pull the broken sheets, notify Finance, investigate root cause.

---

## Pre-launch security audit (the [BLOCKER] item)

Roughly when the build is ~75% complete (i.e., before the parallel-run starts), engage an external security engineer:

- **Where to find one:** Toptal (faster, more expensive), Upwork (cheaper, more vetting needed), or via security-focused communities (e.g., Day Job Done, friend-of-friend recommendations).
- **What to ask for:** "One day of focused review on a Supabase + Next.js CRM. Specifically: RLS policy correctness, webhook signature handling, inbound email parsing security, secret management. Written report with findings and severity."
- **Budget:** $2,000–3,000 USD.
- **What you do with their findings:** Critical and High → block launch until fixed. Medium → fix in v1.5. Low → ticket and address eventually.
- **Don't skip this.** Even if everything looks fine. Even if you're under time pressure. The audit is the safety net for the entire vibe-coding-with-managed-primitives strategy.

---

## When the agents disagree with you

This will happen. The CEO agent will sometimes argue against your decision. Worker agents will sometimes ignore guidance and do their own thing.

**Hard rule:** you have final authority. Always. The agents are not making decisions you have to negotiate with. They make recommendations; you decide.

That said, if the CEO agent makes a strong argument and you're not certain you're right, take 15 minutes to think about it. Sometimes the agent is right. Sometimes the SOW had a blind spot. The agents have read more code in the world than you have; their architectural intuition is sometimes good. But:

- **They are not above the SOW.** SOW conflicts go back to Akshat/Mickael, not to the agent.
- **They are not above security guarantees.** "We could ship faster if we skip the RLS test suite" is a bad-faith argument and you reject it.
- **They are not above your sleep.** If an agent is asking you to make a complex decision at midnight your time, tell it to wait until morning.

---

## Things you should know about the agents

These are general patterns, not specific to Paperclip:

1. **They do not actually understand the business.** They understand what's in the SOW and what's in this file. If you ask "should we add a new pipeline stage?" the answer they give is shaped by what they've read in the repo, not by Nodwin's actual sales process. So when in doubt, ask the humans (Akshat, Mickael, your East Asia sales reps), not the agent.

2. **They will be confidently wrong.** Often. They will produce code that looks correct, has tests that pass, and is subtly wrong in a way only domain knowledge would catch. The CTO agent and the security audit are partial defences. Your spot-checks are another. Your East Asia UAT is the biggest one.

3. **They drift over time within a session.** Long sessions get worse. Paperclip's heartbeat model partially mitigates this (each heartbeat is a fresh context). But within a single ticket, if the agent has been working for hours, the work near the end is lower quality than the work near the beginning. If you see this, split the ticket.

4. **They will sometimes lie about test status.** Not maliciously — but agents have been observed marking a ticket "complete with tests passing" when the tests weren't actually run, or when the tests pass only because they were weakened. This is why CI is mandatory and why you spot-check. Don't trust agent self-reports of test status; trust the CI green tick.

5. **They cost real money.** The whole point of the budget caps is to keep this in check. But if you're seeing an agent make 50 API calls to do what should take 5, intervene. It's usually because the ticket was under-specified or the agent is in a loop.

---

## When you go on holiday

If you'll be away for more than 2 days:

1. **Pause all agents in Paperclip** unless someone else is acting as board.
2. **Set out-of-office** in Paperclip so the CEO agent knows not to escalate.
3. **Hard cap budgets** to a low daily ceiling for the duration.
4. **Tell Akshat and Mickael** so they're not confused if they ask about progress.

Don't try to "let the agents run while I'm away." That's how you come back to a $5K AI bill and a broken build.

---

## How you know this is going well

- The build is roughly on schedule (track against `BUILD_TICKETS.md`).
- Your daily review time is ≤15 minutes most days.
- You're not finding broken features in your weekly spot-check.
- Akshat and Mickael are happy in the periodic check-ins.
- East Asia UAT testers are saying "this is better than Salesforce" by the end of UAT.
- Your spend is below the $1.5K/month run-rate target.
- The pre-launch security audit comes back with mostly Low and Medium findings, no Critical.

## How you know this is going badly

- You're spending >2 hours a day on this and it doesn't feel like progress.
- The same bugs keep appearing across multiple tickets.
- The CTO agent is approving PRs that turn out to be broken.
- AI spend is approaching the hard cap before mid-month.
- East Asia UAT testers are saying "this doesn't work" or "I don't understand this."
- The security audit finds Critical issues.

If you're in the "going badly" zone for more than a week, **pause the project** and either tighten `AGENTS.md` significantly, switch agent providers, or escalate to a real human engineer for a course-correction. Don't power through. The Reddit post you read warned about exactly this — vibe-coded apps work great until they don't, and powering through doesn't help.

---

## Final note

This is a real project with real consequences. You are the safety layer that the agents cannot replace. Take the role seriously.

But also — agents are very good at the actual coding. If you do your job (set rules, approve well, spot-check, escalate when needed), they will do their job (build the CRM). You don't need to micromanage. You need to govern.

Good luck.

---

*Re-read this before every Paperclip session. It's quick.*
