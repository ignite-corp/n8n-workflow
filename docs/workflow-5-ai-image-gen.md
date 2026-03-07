# Workflow 5: AI 이미지 생성 파이프라인

## 개요
외부 webhook → ComfyUI(Windows PC) 이미지 생성 → Mac Mini 저장 → 터널 URL 서빙

## 플로우

```
POST /webhook/ai-image-generate
  → 프리셋 변환 (Code)
  → WoL + 헬스체크 (Code: 꺼져있으면 WoL → 대기 → 재시도)
  → ComfyUI 큐잉 (POST /prompt)
  → 폴링 & 저장 (GET /history → GET /view → 로컬 저장)
  → 콜백 전송 (선택)
  → Respond to Webhook: 200 { imageUrl, filename, preset, prompt, seed }

GET /ai-images/:filename
  → 로컬 이미지 바이너리 응답
```

> 동기식 응답 — 이미지 생성 완료 후 결과를 HTTP 200으로 반환 (최대 ~70초 대기)

## Webhook 요청 형식

```json
{
  "prompt": "이미지 생성 프롬프트 텍스트",
  "preset": "retro_hisat",
  "seed": 42,
  "callback_url": "(선택) 완료 후 콜백 URL",
  "target_image": "(선택) 참조 이미지 URL — IPAdapter로 스타일/분위기 반영",
  "ip_weight": 0.7,
  "custom_config": "(선택) 프리셋 대신 직접 설정 — 아래 참고"
}
```

> - `target_image`가 없으면 기존 txt2img와 동일. `ip_weight`는 참조 강도 (0~1, 기본 0.7)
> - `custom_config`가 있으면 `preset`을 무시하고 직접 설정 사용

### custom_config 형식

프리셋 없이 체크포인트/LoRA/설정을 직접 지정:

```json
{
  "prompt": "dark fantasy castle",
  "custom_config": {
    "checkpoint": "flux1-dev-fp8.safetensors",
    "loras": [
      { "name": "my_lora.safetensors", "strength": 0.8 }
    ],
    "width": 960, "height": 1280,
    "cfg": 3.5, "steps": 25,
    "sampler": "euler", "scheduler": "sgm_uniform",
    "negative": "",
    "isFlux": true
  }
}
```

> 생략된 필드는 Flux 기본값 적용 (960×1280, cfg 3.5, 25 steps, euler)

## 프리셋

| ID | 체크포인트 | LoRA | 해상도 |
|---|---|---|---|
| `retro_hisat` | flux1-dev-fp8 | xjie-retro-high-saturation-anime (0.8) | 960×1280 |
| `gothic_niji` | flux1-dev-fp8 | MoriiMee_Gothic_Niji_Style_FLUX (0.85) | 960×1280 |
| `dark_noir` | flux1-dev-fp8 | dark_fantasy_flux(0.6) + MoXinV1(0.35) | 960×1280 |
| `retro_vintage` | flux1-dev-fp8 | dark_fantasy_flux(0.5) + RetroAnimeFluxV1(0.65) | 960×1280 |
| `kimhongdo` | sd_xl_turbo_1.0_fp16 | KimHongDo_a1_ZIT (1.0) | 576×1024 |

- Flux 계열: cfg=3.5, steps=25, euler, sgm_uniform
- kimhongdo: cfg=1.5, steps=6, euler_ancestral, normal, 트리거워드 `khd_a1, ` 자동 추가

## 환경변수

| 변수 | 설명 |
|---|---|
| `COMFYUI_HOST` | ComfyUI 서버 IP (기본: 192.168.219.176) |
| `COMFYUI_PORT` | ComfyUI API 포트 (기본: 8188) |
| `AI_IMAGES_DIR` | 이미지 저장 경로 (기본: ~/ai-images) |
| `AI_IMAGE_BASE_URL` | 이미지 서빙 베이스 URL |
| `WOL_MAC_ADDRESS` | ComfyUI PC의 MAC 주소 (WoL용) |
| `WOL_BROADCAST` | 브로드캐스트 주소 (기본: 192.168.219.255) |

## 사용법

### 기본 — curl

```bash
# 이미지 생성 (동기 — 완료까지 대기 후 200 응답)
curl --max-time 180 -X POST https://n8n.firejune.io/webhook/ai-image-generate \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"a cute anime girl in a cozy cafe, warm lighting","preset":"retro_hisat"}'

# 참조 이미지 사용 (IPAdapter — 분위기/스타일 반영)
curl --max-time 180 -X POST https://n8n.firejune.io/webhook/ai-image-generate \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"anime portrait in warm tones","preset":"retro_hisat","target_image":"https://n8n.firejune.io/ai-images/기존이미지.png","ip_weight":0.7}'

# 응답 예시:
# {"imageUrl":"https://n8n.firejune.io/ai-images/retro_hisat_2026-...","filename":"retro_hisat_2026-...","preset":"retro_hisat","prompt":"...","seed":12345}
```

> 생성에 약 **70초** 소요 (Flux dev, 25 steps, RTX 4070 Ti 기준). `--max-time 180` 권장.

### 콜백 패턴 — 결과 자동 수신

생성 완료 시 지정한 URL로 결과가 POST됨:

```bash
curl -X POST https://n8n.firejune.io/webhook/ai-image-generate \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt":"dark fantasy castle in moonlight",
    "preset":"dark_noir",
    "seed": 12345,
    "callback_url":"https://your-app.example.com/api/image-complete"
  }'
```

콜백 body:
```json
{
  "imageUrl": "https://n8n.firejune.io/ai-images/dark_noir_2026-...",
  "filename": "dark_noir_2026-...",
  "preset": "dark_noir",
  "prompt": "dark fantasy castle in moonlight",
  "seed": 12345
}
```

### JavaScript (fetch)

```js
const res = await fetch('https://n8n.firejune.io/webhook/ai-image-generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'retro anime style sunset over ocean',
    preset: 'retro_vintage',
    callback_url: 'https://my-app.com/hook'  // 선택
  })
});
const data = await res.json();
console.log(data.imageUrl); // 완료 후 200 응답
```

### Python

```python
import requests

res = requests.post('https://n8n.firejune.io/webhook/ai-image-generate', json={
    'prompt': 'traditional korean painting of a mountain',
    'preset': 'kimhongdo',
    'seed': 777
}, timeout=180)
print(res.json()['imageUrl'])  # 완료 후 200 응답 (~10초, kimhongdo는 6 steps)
```

### 프리셋 선택 가이드

| 프리셋 | 분위기 | 속도 |
|---|---|---|
| `retro_hisat` | 레트로 고채도 애니메이션 | ~70초 |
| `gothic_niji` | 고딕 니지 스타일 | ~70초 |
| `dark_noir` | 다크 판타지 느와르 | ~70초 |
| `retro_vintage` | 레트로 빈티지 애니 | ~70초 |
| `kimhongdo` | 김홍도 한국화 풍 | ~10초 |

### 주의사항

- ComfyUI PC가 꺼져있으면 **WoL로 자동 기동** (최대 2분 대기)
- Windows PC의 BIOS에서 **WoL 활성화**, 네트워크 어댑터에서 **매직 패킷 허용** 설정 필요
- ComfyUI가 Windows 부팅 시 **자동 시작**되도록 설정 필요 (로그인 없이)
- Mac과 Windows가 **같은 LAN**에 있어야 함 (192.168.219.x)
- 이미지는 `~/ai-images/`에 누적 저장됨 — 주기적으로 정리 필요
- `seed`를 생략하면 랜덤값 사용

## 향후 개선
- 폴링 → WebSocket(`ws://192.168.219.176:8188/ws`) 전환
- ComfyUI 워크플로우 끝에 webhook 콜백 노드 추가

