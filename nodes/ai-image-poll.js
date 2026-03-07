// AI 이미지 — ComfyUI 폴링 → 이미지 다운로드 → 로컬 저장
// 입력: $input.first().json (큐잉 응답 + 이전 단계 데이터)
// 출력: { imageUrl, localPath, filename, preset, prompt_text, seed }

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const prev = $('프리셋 변환').first().json;
const queueResp = $input.first().json;

const promptId = queueResp.prompt_id;
const comfyBase = prev.comfyBase;
const saveNodeId = prev.saveNodeId;
const preset = prev.preset;
const prompt_text = prev.prompt_text;
const seed = prev.seed;
const callback_url = prev.callback_url;

const ASSETS_DIR = 'AI_IMAGES_DIR_HERE';
const BASE_URL = 'AI_IMAGE_BASE_URL_HERE';

// ─── 유틸 ─────────────────────────────────────────────────
function httpGet(url) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        mod.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}: ${url}`));
                return;
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// ─── 1. 폴링 ─────────────────────────────────────────────
const POLL_INTERVAL = 5000;
const POLL_TIMEOUT = 120000;
let elapsed = 0;
let outputFilename = null;

while (elapsed < POLL_TIMEOUT) {
    await sleep(POLL_INTERVAL);
    elapsed += POLL_INTERVAL;

    const historyBuf = await httpGet(`${comfyBase}/history/${promptId}`);
    const history = JSON.parse(historyBuf.toString());

    if (history[promptId] && history[promptId].outputs) {
        const outputs = history[promptId].outputs;
        // SaveImage 노드의 출력에서 filename 추출
        for (const nodeKey of Object.keys(outputs)) {
            const nodeOut = outputs[nodeKey];
            if (nodeOut.images && nodeOut.images.length > 0) {
                outputFilename = nodeOut.images[0].filename;
                break;
            }
        }

        if (outputFilename) break;
    }
}

if (!outputFilename) {
    throw new Error(`ComfyUI 타임아웃: ${POLL_TIMEOUT / 1000}초 내에 이미지 생성이 완료되지 않았습니다.`);
}

// ─── 2. 이미지 다운로드 ───────────────────────────────────
const imageUrl = `${comfyBase}/view?filename=${encodeURIComponent(outputFilename)}`;
const imageBuf = await httpGet(imageUrl);

// ─── 3. 로컬 저장 ────────────────────────────────────────
const assetsDir = ASSETS_DIR;

fs.mkdirSync(assetsDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const ext = path.extname(outputFilename) || '.png';
const localFilename = `${preset}_${timestamp}${ext}`;
const localPath = path.join(assetsDir, localFilename);

fs.writeFileSync(localPath, imageBuf);

// ─── 4. 서빙 URL 생성 ────────────────────────────────────
const servingUrl = `${BASE_URL}/ai-images/${encodeURIComponent(localFilename)}`;

const result = {
    imageUrl: servingUrl,
    localPath,
    filename: localFilename,
    comfyFilename: outputFilename,
    preset,
    prompt: prompt_text,
    seed,
};

// ─── 5. 콜백 전송 (선택) ──────────────────────────────────
if (callback_url) {
    try {
        const postData = JSON.stringify(result);
        const cbUrl = new URL(callback_url);
        const cbMod = cbUrl.protocol === 'https:' ? https : http;
        await new Promise((resolve, reject) => {
            const req = cbMod.request({
                hostname: cbUrl.hostname,
                port: cbUrl.port,
                path: cbUrl.pathname + cbUrl.search,
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
                timeout: 10000,
            }, (res) => {
                res.resume();
                res.on('end', resolve);
            });
            req.on('error', reject);
            req.write(postData);
            req.end();
        });
    } catch (e) {
        // 콜백 실패해도 결과는 리턴
    }
}

return [{ json: result }];
