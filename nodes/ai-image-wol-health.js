// AI 이미지 — ComfyUI 헬스체크 (WoL 없이 빠른 상태 확인)
// 입력: $input.first().json (프리셋 변환 결과)
// 출력: 입력 데이터 + pcOnline 플래그

const http = require('http');

const input = $input.first().json;
const comfyBase = input.comfyBase; // e.g. "http://192.168.219.176:8188"

/** ComfyUI 헬스체크 (GET /system_stats, 5초 타임아웃) */
function healthCheck() {
    return new Promise((resolve) => {
        const url = comfyBase + '/system_stats';
        const req = http.get(url, { timeout: 5000 }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve(res.statusCode === 200));
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
    });
}

const pcOnline = await healthCheck();
console.log(pcOnline ? 'ComfyUI 정상 응답 — 동기 처리' : 'ComfyUI 오프라인 — 비동기 처리');

return [{ json: { ...input, pcOnline } }];
