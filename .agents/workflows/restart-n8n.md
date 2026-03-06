---
description: n8n 서비스 재시작 (launchd)
---

# n8n 서비스 재시작

n8n은 launchd 서비스(`io.firejune.n8n`)로 등록되어 있음.
**절대 `kill`로 프로세스를 직접 죽이지 말 것!** 반드시 launchctl을 사용.

## 재시작
// turbo
```bash
launchctl kickstart -k gui/$(id -u)/io.firejune.n8n
```

## 로그 확인
// turbo
```bash
tail -30 /Users/firejune/Workspace/n8n-workflow/.n8n/n8n.log
```

## 서비스 상태 확인
// turbo
```bash
launchctl print gui/$(id -u)/io.firejune.n8n 2>&1 | head -5
```

## 참고
- plist 위치: `~/Library/LaunchAgents/io.firejune.n8n.plist`
- `KeepAlive: false` — kill해도 자동 재시작 안 됨, 부팅 시에만 자동 시작
- Cloudflare 터널도 별도 서비스: `io.firejune.cloudflared-n8n`
