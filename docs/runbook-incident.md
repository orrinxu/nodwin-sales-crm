# Incident Response Runbook

> Placeholder — content to be written before East Asia launch per §8.4 of the [SOW](SOW.md) / [security checklist](security.md#84-pre-launch-security-checklist).
>
> **Owner:** Tech Writer
> **Deadline:** Before East Asia go-live (per §13, Acceptance Criterion 14)

## Scope

This runbook covers incident response procedures for the Nodwin CRM, including:

- Service degradation / outage
- Security incident (suspected data breach, RLS misconfiguration, compromised credentials)
- AI cost runaway
- Inbound email forgery suspicion
- Slack / Drive / Gmail API quota exhaustion
- Salesforce migration sync failure during parallel run

## Pre-Launch Requirements

Per the [Pre-Launch Security Checklist](security.md#84-pre-launch-security-checklist) (§8.4):

- [ ] On-call rotation defined and published
- [ ] Escalation contacts documented
- [ ] Alert channels configured (`#crm-alerts`, PagerDuty or equivalent)
- [ ] Backup and restore procedure documented and tested
- [ ] Data deletion / offboarding procedure documented
- [ ] GDPR / DPDP / regional privacy procedures documented

## Severity Levels

| Severity | Definition | Response Time |
|---|---|---|
| Critical | Data breach, service unavailable, data loss | Immediate (< 1 hour) |
| High | Feature broken for multiple users, AI cost spike | Within 4 hours |
| Medium | Single-user issue, cosmetic bug | Within 24 hours |
| Low | Question, feature request | Next business day |

## Response Procedures

*To be filled in during Foundation phase per §10.1.*
