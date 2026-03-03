# Mac Mini 서버 셋업 가이드

n8n + Cloudflare Tunnel을 Mac Mini에서 상시 운영하기 위한 가이드.

## 1. 기본 환경 준비

```bash
# Homebrew 설치 (없으면)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Node.js, cloudflared 설치 (sqlite3는 macOS 기본 내장)
brew install node cloudflare/cloudflare/cloudflared
```

## 2. 프로젝트 클론 및 설정

```bash
cd ~/Workspace  # 또는 원하는 디렉토리
git clone https://github.com/firejune/n8n-workflow.git
cd n8n-workflow

# .env 파일 생성
cp .env.example .env  # 없으면 직접 만들기
```

`.env` 파일 내용:

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_CHANNEL=C094UJQ7UBG
N8N_PORT=5678
WEBHOOK_URL=https://n8n.firejune.io/
NODE_FUNCTION_ALLOW_BUILTIN=fs,path,child_process,https
N8N_RUNNERS_TASK_TIMEOUT=1800
N8N_RUNNERS_HEARTBEAT_INTERVAL=120
EXECUTIONS_TIMEOUT=3600
EXECUTIONS_TIMEOUT_MAX=7200
KOMBAI_POC_DIR=./scripts/kombai-poc
PROJECT_ROOT=../..
GITLAB_TARGET_BRANCH=develop
```

## 3. n8n 서비스 등록 (launchd)

n8n을 시스템 시작 시 자동 실행되도록 등록.

```bash
# plist 파일 생성
sudo tee /Library/LaunchDaemons/com.firejune.n8n.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.firejune.n8n</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/Users/firejune/Workspace/n8n-workflow/start.sh</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/firejune/Workspace/n8n-workflow</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>StandardOutPath</key>
    <string>/Library/Logs/com.firejune.n8n.out.log</string>
    <key>StandardErrorPath</key>
    <string>/Library/Logs/com.firejune.n8n.err.log</string>
</dict>
</plist>
EOF

# 서비스 등록 및 시작
sudo launchctl bootstrap system /Library/LaunchDaemons/com.firejune.n8n.plist
```

> `ProgramArguments`의 `start.sh` 경로를 실제 클론 경로에 맞게 수정할 것.

## 4. Cloudflare Tunnel 설정

Cloudflare Zero Trust 대시보드에서 터널을 기존 머신에서 Mac Mini로 이전.

### 터널 토큰 확인 방법

기존 머신의 plist에서 확인:

```bash
cat /Library/LaunchDaemons/com.cloudflare.cloudflared.plist | grep -A1 token
```

또는 [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → **Networks** → **Tunnels** → 터널 선택 → **Configure** → **Install and run a connector** 탭에서 복사.

### 방법 A: 같은 터널 토큰 재사용 (권장)

```bash
# cloudflared 서비스 등록 (기존 토큰 사용)
sudo cloudflared service install <TUNNEL_TOKEN>
```

이 명령이 자동으로:

- `/Library/LaunchDaemons/com.cloudflare.cloudflared.plist` 생성
- launchd에 서비스 등록
- 부팅 시 자동 시작

### 방법 B: Cloudflare 대시보드에서 재설정

1. [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) 접속
2. **Networks** → **Tunnels** → 기존 터널 선택
3. **Configure** → **Install and run a connector** 탭에서 Mac Mini용 설치 명령 복사
4. Mac Mini에서 해당 명령 실행

### 터널 Public Hostname 확인

터널 설정에서 `n8n.firejune.io` → `http://localhost:5678` 매핑이 되어있는지 확인.

## 5. 서비스 관리 명령어

```bash
# ── n8n ──
# 상태 확인
sudo launchctl print system/com.firejune.n8n

# 중지
sudo launchctl bootout system/com.firejune.n8n

# 시작
sudo launchctl bootstrap system /Library/LaunchDaemons/com.firejune.n8n.plist

# 로그 확인
tail -f /Library/Logs/com.firejune.n8n.out.log
tail -f /Library/Logs/com.firejune.n8n.err.log

# ── Cloudflare Tunnel ──
# 상태 확인
sudo launchctl print system/com.cloudflare.cloudflared

# 중지/시작
sudo launchctl bootout system/com.cloudflare.cloudflared
sudo launchctl bootstrap system /Library/LaunchDaemons/com.cloudflare.cloudflared.plist

# 로그 확인
tail -f /Library/Logs/com.cloudflare.cloudflared.err.log
```

## 6. 워크플로우 업데이트 (배포)

```bash
cd ~/Workspace/n8n-workflow
git pull
./deploy.sh  # n8n 재시작 없이 워크플로우 핫 리로드
```

## 7. Mac Mini 추가 설정

### 자동 로그인 (재부팅 후 서비스 유지)

**System Settings** → **Users & Groups** → **Automatic login** 활성화

> launchd 데몬(`/Library/LaunchDaemons/`)은 로그인 없이도 실행되므로 필수는 아님.
> 단, LaunchAgents(`~/Library/LaunchAgents/`)를 사용하는 경우엔 자동 로그인 필요.

### 잠자기 방지

```bash
# 잠자기 완전 비활성화
sudo pmset -a sleep 0 displaysleep 0 disksleep 0

# 전원 복구 시 자동 부팅
sudo pmset -a autorestart 1
```

### SSH 원격 접속 (선택)

**System Settings** → **General** → **Sharing** → **Remote Login** 활성화

```bash
# 다른 머신에서 접속
ssh firejune@<mac-mini-ip>
```

## 체크리스트

- [ ] Homebrew, Node.js, cloudflared 설치
- [ ] 프로젝트 클론 및 `.env` 설정
- [ ] n8n launchd 서비스 등록
- [ ] Cloudflare Tunnel 연결 (`n8n.firejune.io` → `localhost:5678`)
- [ ] `https://n8n.firejune.io` 접속 확인
- [ ] 잠자기 방지 설정
- [ ] 전원 복구 시 자동 부팅 설정
