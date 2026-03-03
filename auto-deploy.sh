#!/bin/bash
# n8n self-restart 스크립트
# GitHub deploy webhook에서 호출됨

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$SCRIPT_DIR/.n8n/restart.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"; }

log "restart 시작"

# n8n 종료 대기
sleep 2

# 5678 포트 사용 프로세스 종료
PID=$(lsof -ti :5678 2>/dev/null | head -1)
if [ -n "$PID" ]; then
  log "n8n 종료 중 (PID: $PID)"
  kill "$PID" 2>/dev/null
  sleep 3
  kill -9 "$PID" 2>/dev/null || true
  sleep 1
fi

# n8n 재시작
log "n8n 재시작 중..."
nohup bash "$SCRIPT_DIR/start.sh" >> "$LOG_FILE" 2>&1 &
log "n8n 재시작 완료 (PID: $!)"
