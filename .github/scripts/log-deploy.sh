#!/usr/bin/env bash
# Usage: log-deploy.sh <APP_ID> <STATUS> [MESSAGE] [ARTIFACT_URL]
# Writes one row to DEPLOY_LOGS via Supabase REST (service_role).
# Never fails the job: logging problems are reported as warnings only.
set -u

APP_ID="$1"
STATUS="$2"
MESSAGE="${3:-}"
ARTIFACT_URL="${4:-}"

case "$STATUS" in
  success|failure|cancelled|started|triggered) ;;
  *) STATUS="failure" ;;
esac

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "::warning::SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set, skipping DEPLOY_LOGS"
  exit 0
fi

RUN_URL="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"

payload=$(jq -n \
  --argjson app "$APP_ID" \
  --arg status "$STATUS" \
  --arg sha "${GITHUB_SHA:-}" \
  --arg ref "${GITHUB_REF_NAME:-}" \
  --arg run "$RUN_URL" \
  --arg artifact "$ARTIFACT_URL" \
  --arg msg "$MESSAGE" \
  '{APP_ID:$app, STATUS:$status, GIT_SHA:$sha, GIT_REF:$ref, WORKFLOW_RUN_URL:$run,
    ARTIFACT_URL:(if $artifact == "" then null else $artifact end),
    MESSAGE:(if $msg == "" then null else $msg end)}')

code=$(curl -sS -o /tmp/deploy_log_resp -w '%{http_code}' \
  -X POST "${SUPABASE_URL%/}/rest/v1/DEPLOY_LOGS" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "$payload") || code="curl-error"

if [ "$code" != "201" ]; then
  echo "::warning::DEPLOY_LOGS insert failed ($code): $(cat /tmp/deploy_log_resp 2>/dev/null)"
fi
exit 0
