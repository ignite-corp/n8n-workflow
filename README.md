# n8n Workflow

GitLab Merge Request / Pipeline 이벤트를 n8n Webhook으로 수신하여 팀 Slack 채널에 스레드 기반 알림을 보냅니다.

## 동작 방식

### 스레드 관리

- **새 MR 생성 (open)** → 채널에 새 스레드 생성 + Description을 스레드 답글로 첨부
- **이후 모든 이벤트** → 해당 MR 스레드에 답글로 추가

MR별 `thread_ts`를 n8n Static Data에 저장하여 같은 MR의 이벤트를 하나의 스레드로 묶습니다.

### 지원 이벤트

| 이벤트       | 동작        | Slack 표시                                      |
| ------------ | ----------- | ----------------------------------------------- |
| MR 생성      | 새 스레드   | `@fe3 {title} MR입니다.` + 작성자/브랜치/레이블 |
| MR 업데이트  | 스레드 답글 | 🔄 MR 업데이트 + 변경 디테일 (필드/커밋)        |
| MR 머지      | 스레드 답글 | ✅ MR 머지 완료                                 |
| MR 닫힘      | 스레드 답글 | 🚫 MR 닫힘                                      |
| MR 재오픈    | 스레드 답글 | ♻️ MR 재오픈                                    |
| MR 승인      | 스레드 답글 | 👍 MR 승인                                      |
| MR 승인 취소 | 스레드 답글 | 👎 MR 승인 취소                                 |
| 파이프라인   | 스레드 답글 | ✅/❌/🚫 + 파이프라인 링크                      |
| 코멘트       | 스레드 답글 | 💬 작성자 + 코멘트 링크 + 미리보기              |

### 노드 구조

```
GitLab Webhook → 메시지 준비 → 분기
                                ├─ [새 스레드] → 메인 전송 → ts 저장 → Description 확인 → Description 스레드
                                └─ [답글]     → 스레드 답글
```

### Description 변환

MR Description은 Markdown → Slack mrkdwn으로 자동 변환됩니다.

- `**bold**` → `*bold*`
- `~~strike~~` → `~strike~`
- `[text](url)` → `<url|text>`
- `- [ ]` / `- [x]` → ☐ / ☑
- HTML 주석(`<!-- -->`) 자동 제거

## 빠른 시작

```bash
cd scripts/n8n-workflow
cp .env.example .env
vi .env                 # SLACK_BOT_TOKEN, SLACK_CHANNEL 입력
./start.sh              # 빌드 + import + n8n 시작
```

n8n UI: http://localhost:5678

## 사전 준비

### 1. Slack 앱 생성 및 Bot Token 발급

1. https://api.slack.com/apps → **Create New App** → **From scratch**
2. **OAuth & Permissions** → Bot Token Scopes에 `chat:write` 추가
3. **Install to Workspace** → **Bot User OAuth Token** (`xoxb-...`) 복사
4. 알림 받을 채널에서 `/invite @앱이름` 으로 **봇을 채널에 초대**

> Incoming Webhook 추가와 Bot 초대는 다릅니다. Bot API 방식은 봇이 채널 멤버여야 합니다.

### 2. Slack 채널 ID 확인

채널명이 아닌 **채널 ID**를 사용합니다.

1. Slack에서 채널명 클릭
2. 팝업 하단의 채널 ID 복사 (`C`로 시작)

### 3. .env 설정

```bash
SLACK_BOT_TOKEN=xoxb-실제-봇-토큰
SLACK_CHANNEL=C04XXXXXXX
SLACK_TEAM_MENTION=@fe3              # 또는 <!subteam^SUBTEAM_ID> (실제 Slack 멘션)
```

### 4. GitLab Webhook 등록

1. GitLab 프로젝트 → **Settings** → **Webhooks**
2. URL: `http://<n8n-host>:5678/webhook/gitlab-mr-webhook`
3. Trigger:
   - **Merge request events** 체크
   - **Pipeline events** 체크
4. **Add webhook**

> 로컬 테스트 시 ngrok 사용: `ngrok http 5678`

### 5. Publish

n8n UI에서 워크플로우를 열고 우측 상단 **Publish** 클릭.
**수정 후에도 반드시 Publish를 다시 해야** Webhook에 반영됩니다.

## 파일 구조

```
scripts/n8n-workflow/
├── .env.example                  # 환경 변수 템플릿
├── .gitignore                    # .env, .n8n 제외
├── start.sh                      # 실행 스크립트
├── build-workflow.cjs            # .env 값 + .js 코드 → JSON 조합
├── gitlab-mr-slack-notify.json   # 워크플로우 템플릿 (편집하지 않음)
├── nodes/
│   ├── prepare-message.js        # 이벤트 분류 + 메시지 생성
│   └── save-thread-ts.js         # MR별 thread_ts 저장
└── README.md
```

## 코드 수정

> n8n UI에서 수정하면 재시작 시 덮어쓰기됩니다.
> **항상 `nodes/*.js` 파일을 수정**하고 n8n을 재시작하세요.

```bash
# 1. nodes/prepare-message.js 수정
# 2. n8n 재시작 (Ctrl+C → ./start.sh)
# 3. n8n UI에서 Publish
```

`build-workflow.cjs`가 `.js` 파일을 읽어서 워크플로우 JSON에 자동 주입합니다.

## 인프라 이전

로컬에서 검증 후 실제 n8n 서버로 이전할 때:

1. n8n UI에서 워크플로우 **⋮** → **Download** (JSON 다운로드)
2. 대상 n8n 서버에서 **Import from File**
3. Bot Token, 채널 ID 등은 대상 환경에 맞게 재설정
4. GitLab Webhook URL을 실제 n8n 도메인으로 변경

또는 `.n8n/workflow-resolved.json`을 직접 사용해도 됩니다.

## 트러블슈팅

| 증상                     | 원인                           | 해결                                  |
| ------------------------ | ------------------------------ | ------------------------------------- |
| GitLab에서 404           | 워크플로우 미발행              | n8n UI에서 Publish                    |
| `channel_not_found`      | 채널 ID 오류 또는 봇 미초대    | 채널 ID 확인 + `/invite @앱이름`      |
| `not_in_channel`         | 봇이 채널 멤버가 아님          | `/invite @앱이름`                     |
| `process is not defined` | Code 노드에서 process.env 사용 | 환경변수는 .env → build 방식으로 주입 |
| npm registry 오류        | 내부 nexus를 바라봄            | start.sh의 `--registry` 옵션으로 해결 |
| 재시작 시 계정 초기화    | .n8n 폴더 삭제됨               | .n8n 폴더를 삭제하지 말 것            |

