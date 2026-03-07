# n8n-workflow 프로젝트 운영 가이드

이 프로젝트는 3대의 머신에서 **Antigravity**를 통해 협업 운영된다.
다른 머신에 작업을 요청할 때는 전달할 내용을 **프롬프트로 작성**해서 사용자에게 알려준다.

## 머신 구성

| 머신 | 역할 | 비고 |
|---|---|---|
| **PC (Windows)** | ComfyUI GPU 서버 | WoL 원격 기동, LAN 192.168.219.x |
| **Mac Mini** | n8n 서버, 이미지 서빙, 터널링 | 이 워크스페이스의 메인 운영 머신 |
| **MacBook** | 주요 개발 머신 | 코드 수정·커밋 후 Mac Mini에 반영 요청 |

---

## Mac Mini — 상세 역할

### n8n 워크플로우 엔진
- **서비스**: `io.firejune.n8n` (launchd)
- **포트**: 5678
- **시작 스크립트**: `start.sh` → 빌드 → DB 마이그레이션 → import → 활성화 → 시작
- **빌드**: `build-workflow.cjs`가 템플릿 JSON + `nodes/*.js` 코드를 조합하여 `.n8n/*-resolved.json` 생성
- **배포**: 해시 비교 후 변경된 워크플로우만 `n8n import:workflow`로 반영, staticData 보존
- **재시작**: `launchctl kickstart -k gui/$(id -u)/io.firejune.n8n` (워크플로우 `/restart-n8n` 참고)

### 운영 중인 워크플로우
| 워크플로우 | Webhook 경로 | 설명 |
|---|---|---|
| GitLab MR → Slack 알림 | `/webhook/gitlab-mr-webhook` | MR 이벤트를 Slack 채널에 알림 |
| Figma 마크업 생성 | `/webhook/markup-generate` | Kombai로 마크업 자동 생성 |
| 마크업 고도화 | `/webhook/markup-refine` | Claude로 마크업 컨벤션 적용 |
| GitHub 자동 배포 | `/webhook/github-deploy` | GitHub webhook → 자동 배포 |
| **AI 이미지 생성** | `/webhook/ai-image-generate` | 동기 응답, ComfyUI 큐잉→폴링→저장→200 반환 |

### AI 이미지 파이프라인
- **흐름**: Webhook → 프리셋 변환 → WoL+헬스체크 → ComfyUI 큐잉 → 폴링 & 로컬 저장 → HTTP 200 응답
- **이미지 저장**: `~/ai-images/`
- **이미지 서빙**: `scripts/ai-image-server.js` (포트 3456), 별도 프로세스
- **프리셋**: `retro_hisat`, `gothic_niji`, `dark_noir`, `retro_vintage`, `kimhongdo`
- **상세 문서**: `docs/workflow-5-ai-image-gen.md`

### Cloudflare 터널
- **서비스**: `io.firejune.cloudflared-n8n` (launchd)
- **외부 URL**: `https://n8n.firejune.io`
- n8n webhook과 이미지 서빙을 외부에 노출

### OpenClaw (개인 비서)
- 사용자의 개인 비서로 동작하는 AI 에이전트
- **Antigravity에 명령 프롬프트를 대신 전달**할 수 있음
- n8n 등 서비스의 **종료·재시작 권한** 보유
- Mac Mini에서 별도 서비스로 상시 운영 중

### 환경변수 (`.env`)
| 변수 | 용도 |
|---|---|
| `SLACK_BOT_TOKEN` | Slack Bot 인증 |
| `COMFYUI_HOST` / `COMFYUI_PORT` | PC의 ComfyUI 주소 |
| `AI_IMAGES_DIR` | 이미지 저장 경로 |
| `AI_IMAGE_BASE_URL` | 이미지 서빙 베이스 URL |
| `WOL_MAC_ADDRESS` / `WOL_BROADCAST` | PC Wake-on-LAN |

### 로그 위치
- stdout: `/Library/Logs/com.firejune.n8n.out.log`
- stderr: `/Library/Logs/com.firejune.n8n.err.log`

---

## PC (Windows) — 상세 역할

### ComfyUI
- Flux dev / SDXL 기반 이미지 생성
- API: `http://192.168.219.176:8188`
- Mac Mini에서 WoL로 원격 기동 (꺼져있을 때 자동)
- Windows 부팅 시 ComfyUI 자동 시작 설정 필요

---

## MacBook — 상세 역할

### 주요 개발 머신
- 코드 수정, 커밋, 푸시
- Mac Mini에 반영이 필요하면 프롬프트로 작업 요청
