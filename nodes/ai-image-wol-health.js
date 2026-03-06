// AI 이미지 — WoL + ComfyUI 헬스체크 통합 노드
// ComfyUI 서버가 꺼져있으면 WoL 매직 패킷으로 깨운 뒤 서비스가 올라올 때까지 대기
// 입력: $input.first().json (프리셋 변환 결과)
// 출력: 입력 데이터 그대로 패스스루

const dgram = require('dgram');
const http = require('http');

const input = $input.first().json;
const comfyBase = input.comfyBase; // e.g. "http://192.168.219.176:8188"
const WOL_MAC = 'WOL_MAC_ADDRESS_HERE';
const WOL_BROADCAST = 'WOL_BROADCAST_HERE';

// ─── 유틸 ──────────────────────────────────────────────────

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

/** WoL 매직 패킷 전송 (UDP 브로드캐스트, 포트 9) */
function sendWol() {
    return new Promise((resolve, reject) => {
        // MAC 주소 → 6바이트 버퍼
        const macBytes = Buffer.from(WOL_MAC.replace(/[:\-]/g, ''), 'hex');
        // 매직 패킷: FF x 6 + MAC x 16
        const packet = Buffer.alloc(102);
        for (let i = 0; i < 6; i++) packet[i] = 0xff;
        for (let i = 0; i < 16; i++) macBytes.copy(packet, 6 + i * 6);

        const socket = dgram.createSocket('udp4');
        socket.once('error', (err) => { socket.close(); reject(err); });
        socket.bind(() => {
            socket.setBroadcast(true);
            socket.send(packet, 0, packet.length, 9, WOL_BROADCAST, (err) => {
                socket.close();
                if (err) reject(err);
                else resolve();
            });
        });
    });
}

/** ms만큼 대기 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── 메인 로직 ─────────────────────────────────────────────

const MAX_WAIT_SEC = 120; // 최대 대기 시간 (2분)
const POLL_INTERVAL_SEC = 10; // 재시도 간격

// 1차 헬스체크
let healthy = await healthCheck();

if (!healthy) {
    // ComfyUI 꺼져있음 → WoL 전송
    console.log(`ComfyUI 응답 없음. WoL 매직 패킷 전송 → ${WOL_MAC} (${WOL_BROADCAST})`);
    await sendWol();

    // 부팅 대기 후 재시도
    const startTime = Date.now();
    const deadline = startTime + MAX_WAIT_SEC * 1000;

    while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL_SEC * 1000);
        healthy = await healthCheck();
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        if (healthy) {
            console.log(`ComfyUI 활성화 확인 (${elapsed}초 경과)`);
            break;
        }
        console.log(`ComfyUI 대기 중... (${elapsed}초 경과)`);
    }

    if (!healthy) {
        throw new Error(`ComfyUI가 ${MAX_WAIT_SEC}초 내에 응답하지 않았습니다. WoL 또는 ComfyUI 자동시작 설정을 확인하세요.`);
    }
} else {
    console.log('ComfyUI 정상 응답 — 바로 진행');
}

// 입력 데이터를 그대로 다음 노드로 전달
return [$input.first()];
