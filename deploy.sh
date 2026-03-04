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
echo "워크플로우 import 중... (변경분만, staticData 보존)"

HASH_DIR="$N8N_DATA/.deploy-hashes"
DB_FILE="$N8N_DATA/.n8n/database.sqlite"
mkdir -p "$HASH_DIR"

for wf in "$N8N_DATA"/*-resolved.json; do
  if [ -f "$wf" ]; then
    WF_BASENAME="$(basename "$wf")"
    WF_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$wf','utf8')).id)")

    # 해시 비교
    NEW_HASH=$(md5 -q "$wf" 2>/dev/null || md5sum "$wf" | cut -d' ' -f1)
    OLD_HASH=$(cat "$HASH_DIR/$WF_BASENAME.md5" 2>/dev/null || true)

    if [ "$NEW_HASH" = "$OLD_HASH" ]; then
      echo "  ⏭ $WF_BASENAME (변경 없음)"
      continue
    fi

    # staticData 백업
    STATIC_DATA=""
    if [ -f "$DB_FILE" ]; then
      STATIC_DATA=$(sqlite3 "$DB_FILE" "SELECT staticData FROM workflow_entity WHERE id='$WF_ID';" 2>/dev/null)
    fi

    # import
    echo "  → $WF_BASENAME"
    $N8N import:workflow --input="$wf"

    # staticData 복원
    if [ -n "$STATIC_DATA" ] && [ "$STATIC_DATA" != '{"global":{}}' ]; then
      sqlite3 "$DB_FILE" "UPDATE workflow_entity SET staticData='$STATIC_DATA' WHERE id='$WF_ID';" 2>/dev/null
      echo "    ↳ staticData 복원 완료"
    fi

    # 해시 저장
    echo "$NEW_HASH" > "$HASH_DIR/$WF_BASENAME.md5"
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
