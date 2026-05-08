#!/usr/bin/env bash
set -euo pipefail

ISSUE_ID=""
STATUS=""
COMMENT=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --issue-id) ISSUE_ID="$2"; shift 2 ;;
    --status) STATUS="$2"; shift 2 ;;
    --comment) COMMENT="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$ISSUE_ID" ]]; then
  echo "Usage: $0 --issue-id <id> [--status <status>] [--comment <comment>]"
  exit 1
fi

BODY="{\"issueId\":\"$ISSUE_ID\""
if [[ -n "$STATUS" ]]; then
  BODY+=",\"status\":\"$STATUS\""
fi
if [[ -n "$COMMENT" ]]; then
  # Escape comment for JSON
  ESCAPED_COMMENT=$(printf '%s' "$COMMENT" | jq -Rs '.[:-1]')
  BODY+=",\"comment\":$ESCAPED_COMMENT"
fi
BODY+="}"

curl -s -X PATCH "$PAPERCLIP_API_URL/api/issues/$ISSUE_ID" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -d "$BODY" | jq .
