#!/bin/bash
# 워크플로우 빌드 + 핫 리로드 (n8n 재시작 없이)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
N8N_DATA="$SCRIPT_DIR/.n8n"
ENV_FILE="$SCRIPT_DIR/.env"

set -a
source "$ENV_FILE"
set +a

export N8N_USER_FOLDER="$N8N_DATA"

NPM_REGISTRY="https://registry.npmjs.org"
N8N_VERSION="2.9.2"
N8N="npx --registry=$NPM_REGISTRY n8n@$N8N_VERSION"

echo "빌드 중..."
node "$SCRIPT_DIR/build-workflow.cjs"

echo ""
echo "워크플로우 import 중... (n8n 재시작 불필요)"
for wf in "$N8N_DATA"/*-resolved.json; do
  if [ -f "$wf" ]; then
    echo "  → $(basename "$wf")"
    $N8N import:workflow --input="$wf"
  fi
done

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
echo "배포 완료! 웹훅 즉시 적용됨."
