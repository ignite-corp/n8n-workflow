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

# 워크플로우 관련 데이터만 초기화 (어드민 계정 보존)
N8N_DB="$N8N_DATA/.n8n/database.sqlite"
if [ -f "$N8N_DB" ]; then
  echo "워크플로우 데이터 초기화 중... (계정 정보 유지)"
  sqlite3 "$N8N_DB" "DELETE FROM workflow_entity; DELETE FROM execution_entity; DELETE FROM webhook_entity;" 2>/dev/null || true
fi

# n8n-nodes-base 캐시 초기화 (corruption 방지)
if [ -d "$N8N_DATA/.n8n/nodes" ]; then
  echo "노드 캐시 초기화 중..."
  rm -rf "$N8N_DATA/.n8n/nodes"
fi

echo "워크플로우 빌드 중..."
node "$SCRIPT_DIR/build-workflow.cjs"

echo ""
echo "워크플로우 import 중... (기존 워크플로우는 덮어쓰기)"

# 모든 resolved 워크플로우 import
for wf in "$N8N_DATA"/*-resolved.json; do
  if [ -f "$wf" ]; then
    echo "  → $(basename "$wf")"
    $N8N import:workflow --input="$wf"
  fi
done

echo "워크플로우 import 완료!"

echo ""
echo "워크플로우 활성화 중..."
for wf in "$N8N_DATA"/*-resolved.json; do
  if [ -f "$wf" ]; then
    WF_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$wf','utf8')).id)")
    echo "  → ID $WF_ID 활성화"
    $N8N update:workflow --id="$WF_ID" --active=true 2>/dev/null || echo "    ⚠ 활성화 실패 (이미 활성?)"
  fi
done

echo ""
echo "n8n 시작: http://localhost:$N8N_PORT"
echo ""
echo "Webhook URLs:"
echo "  GitLab MR 알림:    http://localhost:$N8N_PORT/webhook/gitlab-mr-webhook"
echo "  마크업 생성:       http://localhost:$N8N_PORT/webhook/markup-generate"
echo "  마크업 고도화:     http://localhost:$N8N_PORT/webhook/markup-refine"
echo ""

$N8N start
