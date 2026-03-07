---
trigger: always_on
---

# n8n-workflow 프로젝트 운영 가이드

이 프로젝트는 3대의 머신에서 **Antigravity**를 통해 협업 운영된다.
다른 머신에 작업을 요청할 때는 전달할 내용을 **프롬프트로 작성**해서 사용자에게 알려준다.

## 머신 구성

| 머신             | 역할                          | 비고                                   |
| ---------------- | ----------------------------- | -------------------------------------- |
| **PC (Windows)** | ComfyUI GPU 서버              | WoL 원격 기동, LAN 192.168.219.x       |
| **Mac Mini**     | n8n 서버, 이미지 서빙, 터널링 | 이 워크스페이스의 메인 운영 머신       |
| **MacBook**      | 주요 개발 머신                | 코드 수정·커밋 후 Mac Mini에 반영 요청 |

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

| 워크플로우             | Webhook 경로                 | 설명                                       |
| ---------------------- | ---------------------------- | ------------------------------------------ |
| GitLab MR → Slack 알림 | `/webhook/gitlab-mr-webhook` | MR 이벤트를 Slack 채널에 알림              |
| Figma 마크업 생성      | `/webhook/markup-generate`   | Kombai로 마크업 자동 생성                  |
| 마크업 고도화          | `/webhook/markup-refine`     | Claude로 마크업 컨벤션 적용                |
| GitHub 자동 배포       | `/webhook/github-deploy`     | GitHub webhook → 자동 배포                 |
| **AI 이미지 생성**     | `/webhook/ai-image-generate` | 동기 응답, ComfyUI 큐잉→폴링→저장→200 반환 |

### AI 이미지 파이프라인

- **트리거**:
  - 외부 Webhook 호출: `https://n8n.firejune.io/webhook/ai-image-generate`
  - HTTP Method: `POST`
- **수신 파라미터 (JSON 페이로드)**:
  - `prompt`: 생성할 이미지 가이드 (텍스트)
  - `preset`: 사용할 이미지 스타일 (`retro_hisat`, `gothic_niji`, `dark_noir`, `retro_vintage`, `kimhongdo`)
  - `seed`: (선택) 고정 시드값
  - `callback_url`: (선택) 완료 후 결과 전송 URL
  - `target_image`: (선택) 참조 이미지 URL — IPAdapter로 분위기/스타일 반영
  - `ip_weight`: (선택) IPAdapter 참조 강도 (0~1, 기본 0.7)
  - `custom_config`: (선택) 프리셋 대신 직접 설정 (checkpoint, loras, width, height, cfg, steps, sampler, scheduler, negative, isFlux)
- **실행 흐름**: 프리셋(또는 custom_config) 변환 → WoL + 헬스체크 → ComfyUI 큐잉 → 폴링 → 이미지 저장 → 200 응답
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

| 변수                                | 용도                   |
| ----------------------------------- | ---------------------- |
| `SLACK_BOT_TOKEN`                   | Slack Bot 인증         |
| `COMFYUI_HOST` / `COMFYUI_PORT`     | PC의 ComfyUI 주소      |
| `AI_IMAGES_DIR`                     | 이미지 저장 경로       |
| `AI_IMAGE_BASE_URL`                 | 이미지 서빙 베이스 URL |
| `WOL_MAC_ADDRESS` / `WOL_BROADCAST` | PC Wake-on-LAN         |

### 로그 위치

- stdout: `/Library/Logs/com.firejune.n8n.out.log`
- stderr: `/Library/Logs/com.firejune.n8n.err.log`

---

## PC (Windows) — 상세 역할

### ComfyUI 실행 엔진

- **빌드**: `python_embeded` 기반 ComfyUI Windows Standalone 빌드
- **실행 스크립트**:
  - `run_nvidia_gpu_fast_fp16_accumulation.bat`: 실제 실행 파일
  - `start_comfyui_silent.vbs`: 백그라운드 무음 실행을 위한 VBS 래퍼
- **가속 설정**:
  - `CUDA_VISIBLE_DEVICES=0,1`: 멀티 GPU 활용
  - `--fast fp16_accumulation`: 속도 최적화 옵션 적용

### 인프라 및 네트워크

- **API 접속**: `http://192.168.219.176:8188` (고정 IP)
- **외부 허용**: `--listen 0.0.0.0` 설정으로 Mac Mini 등 외부 접속 허용
- **자동 관리**:
  - Mac Mini에서 **Wake-on-LAN (WoL)**으로 원격 기동
  - Windows 로그인 시 `start_comfyui_silent.vbs` 자동 실행 설정 필요
  - `mac.txt`, `wolinfo.txt` 등을 통해 장치 및 네트워크 상태 관리
- **절전 방지**: 이미지 생성 시 시스템 절전 모드 진입 방지 로직 적용 가능 (별도 모니터링 스크립트)

### ComfyUI 모델 관리 (직접 API)

PC가 켜져있을 때 LAN에서 직접 호출 가능 (n8n 불필요):

- **모델 목록**: `GET http://192.168.219.176:8188/manager/models/list`
- **모델 설치**: HuggingFace에서 직접 다운로드
- **모델 저장 경로**:
  - 체크포인트: `ComfyUI/models/checkpoints/`
  - LoRA: `ComfyUI/models/loras/`
  - IPAdapter: `ComfyUI/models/xlabs/ipadapters/` (Flux) / `ComfyUI/models/ipadapter/` (SDXL)
  - CLIP Vision: `ComfyUI/models/clip_vision/`

---

## MacBook — 상세 역할

### 주요 개발 머신

- 코드 수정, 커밋, 푸시
- Mac Mini에 반영이 필요하면 프롬프트로 작업 요청

### ComfyUI 모델 관리 (PC 직접 호출)

PC가 켜져있으면 MacBook에서 LAN을 통해 직접 모델 확인/설치 가능:

```bash
# 모델 목록 조회
curl http://192.168.219.176:8188/manager/models/list

# HuggingFace에서 LoRA 다운로드 (PC쪽 에이전트에 요청)
curl -L "https://huggingface.co/{작성자}/{모델}/resolve/main/{파일}.safetensors" \
  -o "ComfyUI/models/loras/{파일}.safetensors"
```

### AI 이미지 생성 (n8n 경유)

```bash
# 프리셋 사용
curl --max-time 180 -X POST https://n8n.firejune.io/webhook/ai-image-generate \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"anime girl","preset":"retro_hisat"}'

# 커스텀 설정 (새 LoRA 설치 후 바로 사용)
curl --max-time 180 -X POST https://n8n.firejune.io/webhook/ai-image-generate \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"portrait","custom_config":{"checkpoint":"flux1-dev-fp8.safetensors","loras":[{"name":"새_lora.safetensors","strength":0.8}],"isFlux":true}}'

# 참조 이미지 사용 (IPAdapter)
curl --max-time 180 -X POST https://n8n.firejune.io/webhook/ai-image-generate \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"anime portrait","preset":"retro_hisat","target_image":"https://n8n.firejune.io/ai-images/기존이미지.png","ip_weight":0.7}'
```