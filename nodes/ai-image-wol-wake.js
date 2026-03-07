// AI 이미지 — WoL 매직 패킷 전송 + ComfyUI 준비 대기
// PC OFF 분기에서만 실행됨
// 입력: $input.first().json (헬스체크 결과)
// 출력: 입력 데이터 그대로 패스스루

const dgram = require('dgram');
const http = require('http');

const input = $input.first().json;
const comfyBase = input.comfyBase;
const WOL_MAC = 'WOL_MAC_ADDRESS_HERE';
const WOL_BROADCAST = 'WOL_BROADCAST_HERE';

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
        const macBytes = Buffer.from(WOL_MAC.replace(/[:\-]/g, ''), 'hex');
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

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── WoL + 대기 ────────────────────────────────────────────
const MAX_WAIT_SEC = 120;
const POLL_INTERVAL_SEC = 10;

console.log(`WoL 매직 패킷 전송 → ${WOL_MAC} (${WOL_BROADCAST})`);
await sendWol();

const startTime = Date.now();
const deadline = startTime + MAX_WAIT_SEC * 1000;
let healthy = false;

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
    throw new Error(`ComfyUI가 ${MAX_WAIT_SEC}초 내에 응답하지 않았습니다.`);
}

return [$input.first()];
