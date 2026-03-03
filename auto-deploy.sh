#!/bin/bash
# GitHub 소스 변경 감지 → 자동 pull + n8n restart
# LaunchAgent에서 주기적으로 실행

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$SCRIPT_DIR/.n8n/auto-deploy.log"
LOCK_FILE="/tmp/n8n-auto-deploy.lock"
BRANCH="main"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"; }

# 중복 실행 방지
if [ -f "$LOCK_FILE" ]; then
  PID=$(cat "$LOCK_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    exit 0
  fi
fi
echo $$ > "$LOCK_FILE"
trap "rm -f $LOCK_FILE" EXIT

cd "$SCRIPT_DIR" || exit 1

# remote 변경 확인
git fetch origin "$BRANCH" --quiet 2>/dev/null

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0
fi

# 변경 감지
log "변경 감지: $LOCAL → $REMOTE"
log "$(git log --oneline $LOCAL..$REMOTE)"

# pull
if ! git pull origin "$BRANCH" --quiet 2>>"$LOG_FILE"; then
  log "ERROR: git pull 실패"
  exit 1
fi

log "pull 완료"

# 실행 중인 n8n 종료
N8N_PID=$(lsof -ti :5678 2>/dev/null | head -1)
if [ -n "$N8N_PID" ]; then
  log "n8n 종료 중... (PID: $N8N_PID)"
  kill "$N8N_PID" 2>/dev/null
  sleep 3
  # 강제 종료
  kill -9 "$N8N_PID" 2>/dev/null || true
  sleep 1
fi

# n8n 재시작
log "n8n 재시작 중..."
nohup bash "$SCRIPT_DIR/start.sh" >> "$LOG_FILE" 2>&1 &
log "n8n 재시작 완료 (PID: $!)"
