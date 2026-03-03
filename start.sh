#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
N8N_DATA="$SCRIPT_DIR/.n8n"
ENV_FILE="$SCRIPT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "오류: .env 파일이 없습니다."
  echo "  cp .env.example .env 후 값을 입력하세요."
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

if [ -z "$SLACK_BOT_TOKEN" ] || [ "$SLACK_BOT_TOKEN" = "xoxb-your-bot-token-here" ]; then
  echo "오류: .env에 SLACK_BOT_TOKEN을 입력하세요."
  exit 1
fi

export N8N_USER_FOLDER="$N8N_DATA"
export GENERIC_TIMEZONE="Asia/Seoul"
export TZ="Asia/Seoul"
export N8N_PORT="${N8N_PORT:-5678}"
export WEBHOOK_URL="${WEBHOOK_URL:-http://localhost:$N8N_PORT/}"

NPM_REGISTRY="https://registry.npmjs.org"
N8N_VERSION="2.9.2"
N8N="npx --registry=$NPM_REGISTRY n8n@$N8N_VERSION"

# n8n-nodes-base 캐시 초기화 (corruption 방지)
if [ -d "$N8N_DATA/.n8n/nodes" ]; then
  echo "노드 캐시 초기화 중..."
  rm -rf "$N8N_DATA/.n8n/nodes"
fi

echo "워크플로우 빌드 중..."
node "$SCRIPT_DIR/build-workflow.cjs"

# ─── 1단계: n8n을 한 번 띄워서 DB 마이그레이션 완료 ─────────────────
echo ""
echo "n8n DB 초기화 중..."
$N8N start &
N8N_PID=$!

MAX_WAIT=60
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
  if curl -s -o /dev/null -w '' "http://localhost:$N8N_PORT/healthz" 2>/dev/null; then
    break
  fi
  sleep 2
  WAITED=$((WAITED + 2))
done

if [ $WAITED -ge $MAX_WAIT ]; then
  echo "오류: n8n이 ${MAX_WAIT}초 내에 시작되지 않았습니다."
  kill $N8N_PID 2>/dev/null
  exit 1
fi

# n8n 중지 (DB 마이그레이션만 완료)
kill $N8N_PID 2>/dev/null
wait $N8N_PID 2>/dev/null || true
sleep 1
echo "DB 초기화 완료"

# ─── 2단계: 워크플로우 import (n8n 중지 상태에서) ─────────────────────
echo ""
echo "워크플로우 import 중..."

for wf in "$N8N_DATA"/*-resolved.json; do
  if [ -f "$wf" ]; then
    echo "  → $(basename "$wf")"
    $N8N import:workflow --input="$wf"
  fi
done

echo "워크플로우 import 완료!"

# ─── 3단계: 활성화할 워크플로우 active=true 설정 ───────────────────────
echo ""
echo "워크플로우 활성화 설정 중... (Slack 알림 + Deploy)"
for WF_NAME in "workflow-resolved.json" "deploy-resolved.json"; do
  WF_FILE="$N8N_DATA/$WF_NAME"
  if [ -f "$WF_FILE" ]; then
    WF_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$WF_FILE','utf8')).id)")
    WF_LABEL=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$WF_FILE','utf8')).name)")
    echo "  → ID $WF_ID ($WF_LABEL)"
    $N8N update:workflow --id="$WF_ID" --active=true 2>/dev/null || true
  fi
done

# ─── 4단계: n8n 시작 (active 워크플로우 자동 활성화) ──────────────────
echo ""
echo "n8n 시작: http://localhost:$N8N_PORT"
echo ""
echo "Webhook URLs:"
echo "  GitLab MR 알림:    http://localhost:$N8N_PORT/webhook/gitlab-mr-webhook"
echo "  마크업 생성:       http://localhost:$N8N_PORT/webhook/markup-generate"
echo "  마크업 고도화:     http://localhost:$N8N_PORT/webhook/markup-refine"
echo "  GitHub 배포:       http://localhost:$N8N_PORT/webhook/github-deploy"
echo ""

$N8N start
