# Nodwin CRM REST API — Agent Integration Guide

Connect an AI agent (NanoClaw, OpenClaw, Hermes, a script, a Zapier…) to the CRM
so it can **read your deals, contacts, and accounts on your behalf**. This is how
you get "ask my CRM from Telegram" or "drop an RFP and file it" workflows.

> **Status:** v1 is **read-only** (search + fetch). Write endpoints (create/update,
> log activities) land in a later phase. Base URL below is **staging**.

---

## 1. The one thing to understand about security

An API token **is you**. Every call an agent makes with your token runs **as your
user**, under the exact same row-level permissions you have in the web app — you
see only the deals you can see, and confidential deals stay hidden. A token can't
do anything you can't. Treat it like a password:

- Anyone with your token can read what you can read. **Don't paste it in shared chats.**
- Lost it? **Revoke it** (below) and generate a new one — revocation is instant.
- Tokens are stored **hashed**; we can't show you a token again after creation, so copy it when it's shown.

---

## 2. Get a token

1. Log in to the CRM.
2. **Settings → API tokens** (also in the sidebar user menu).
3. Give it a name you'll recognise (e.g. `NanoClaw – Telegram`) → **Generate**.
4. **Copy the token now** — it's shown once. It looks like `nodpat_XXXXXXXX…`.

To revoke: same screen → **Revoke** next to the token.

---

## 3. Base URL & authentication

| | |
|---|---|
| **Base URL (staging)** | `https://nodwin-crm-staging.orrinxu.com/api/v1` |
| **Auth header** | `Authorization: Bearer <your-token>` |

Every request needs that header. That's the whole auth story — no OAuth dance, no session.

**Quick test** (should return your user id):
```bash
curl -s https://nodwin-crm-staging.orrinxu.com/api/v1/me \
  -H "Authorization: Bearer $NODWIN_CRM_TOKEN"
# → {"id":"…","role":"…","source":"mcp"}
```

---

## 4. Endpoints (v1, read-only)

| Method & path | What it returns |
|---|---|
| `GET /me` | Your user id + role — a token health check. |
| `GET /opportunities?scope=all\|mine` | Opportunities you can see (`mine` = only ones you own). |
| `GET /opportunities/{id}` | One opportunity (404 if not found / not visible to you). |
| `GET /contacts?query=&accountId=&ownerId=` | Contacts, filtered by name/email/phone (`query`) and/or account/owner. |
| `GET /contacts/{id}` | One contact. |
| `GET /accounts?query=&industry=&ownerId=` | Accounts, filtered by name (`query`), industry, owner. |
| `GET /accounts/{id}` | One account. |

**Examples:**
```bash
BASE=https://nodwin-crm-staging.orrinxu.com/api/v1
H="Authorization: Bearer $NODWIN_CRM_TOKEN"

# Find an account by name
curl -s "$BASE/accounts?query=acme" -H "$H"

# Find a contact
curl -s "$BASE/contacts?query=priya" -H "$H"

# My open pipeline
curl -s "$BASE/opportunities?scope=mine" -H "$H"
```

**Status codes:** `200` OK · `401` missing/invalid/revoked token · `403` you lack
access · `404` not found/not visible · `400` bad query · `503` API not configured
(server-side; tell an admin).

---

## 5. Wire it into NanoClaw

NanoClaw runs each agent turn in a container and exposes integrations as tools.
Because our API is plain REST (not yet MCP), the lowest-effort integration is to
give the container the token and let the agent call the API with its existing
`Bash`/`curl` tool. **No image rebuild required.**

**Step 1 — add the token to `~/server/nanoclaw/.env`:**
```
NODWIN_CRM_TOKEN=nodpat_XXXXXXXX…
NODWIN_CRM_BASE_URL=https://nodwin-crm-staging.orrinxu.com/api/v1
```

**Step 2 — pass it into the container.** In `src/container-runner.ts`, alongside
the existing Salesforce env block, add the CRM vars to the passthrough:
```ts
const crmEnv = readEnvFile(['NODWIN_CRM_TOKEN', 'NODWIN_CRM_BASE_URL']);
for (const key of ['NODWIN_CRM_TOKEN', 'NODWIN_CRM_BASE_URL'] as const) {
  const val = process.env[key] || crmEnv[key];
  if (val) args.push('-e', `${key}=${val}`);
}
```

**Step 3 — tell the agent it can use it.** Add to `groups/global/CLAUDE.md`:
```md
## Nodwin CRM (read-only API)
You can query the Nodwin CRM. Use `Bash`/`curl` with the bearer token in
`$NODWIN_CRM_TOKEN` against `$NODWIN_CRM_BASE_URL`:
  curl -s "$NODWIN_CRM_BASE_URL/accounts?query=<name>" -H "Authorization: Bearer $NODWIN_CRM_TOKEN"
Endpoints: /me, /opportunities(?scope=mine), /opportunities/{id},
/contacts(?query=), /contacts/{id}, /accounts(?query=), /accounts/{id}.
Results are scoped to the token owner — never assume access beyond what returns.
```

**Step 4 — rebuild the host + restart:**
```bash
cd ~/server/nanoclaw && npm run build && systemctl --user restart nanoclaw
```

**Step 5 — record the customization** so it survives upstream updates: append a
section to `~/server/nanoclaw/.nanoclaw-migrations/source-customizations.md`
describing the `.env` keys and the `container-runner.ts` passthrough (mirror the
Salesforce entry).

### Cleaner upgrade path (when the CRM adds an MCP endpoint)
NanoClaw natively supports remote HTTP MCP. Once the CRM exposes `/api/mcp`, drop
the curl approach and register it as a first-class tool in
`container/agent-runner/src/index.ts` (mirror the `add-parallel` skill):
```ts
mcpServers['nodwin_crm'] = {
  type: 'http',
  url: process.env.NODWIN_CRM_MCP_URL || '',
  headers: { Authorization: `Bearer ${process.env.NODWIN_CRM_TOKEN || ''}` },
};
// + add 'mcp__nodwin_crm__*' to allowedTools, rebuild the image.
```

---

## 6. Other agents / tools

Anything that can make an HTTP request with a header works the same way:

- **A script / cron:** `curl` as above; parse the JSON.
- **OpenClaw / Hermes / custom agent:** register an HTTP tool pointing at the base
  URL with the `Authorization: Bearer` header, or (if it supports remote MCP) wait
  for the MCP endpoint.
- **Zapier / n8n:** an HTTP request node with the bearer header.

The contract is identical for all of them: **base URL + `Authorization: Bearer <token>`.**

---

## 7. Notes & limits

- **Read-only for now.** Creating/updating records (e.g. "file this RFP as a new
  deal") is a later phase.
- **Rate:** be reasonable; there's no hard limit yet, but that may change.
- **One token per integration** is good hygiene — you can revoke one without
  breaking the others, and `last used` on the tokens screen tells you what's active.
- **Prod:** this guide points at staging. The production base URL and a note on the
  rotated signing secret will be added when prod is stood up.
