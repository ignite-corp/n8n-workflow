// AI 이미지 — 이미지 서빙 (GET webhook에서 호출)
// GET /ai-image/:filename 요청 처리
// 로컬 저장된 이미지를 바이너리로 응답

const fs = require('fs');
const path = require('path');

const ASSETS_DIR = 'AI_IMAGES_DIR_HERE';

const assetsDir = ASSETS_DIR;

// URL path에서 filename 추출
const reqPath = $input.first().json.params?.filename
    || $input.first().json.query?.filename
    || '';

const filename = decodeURIComponent(path.basename(reqPath));

if (!filename) {
    return [{
        json: { error: 'filename이 필요합니다.' },
    }];
}

const filePath = path.join(assetsDir, filename);

// 경로 순회 방지
if (!filePath.startsWith(assetsDir)) {
    return [{
        json: { error: '잘못된 경로입니다.' },
    }];
}

if (!fs.existsSync(filePath)) {
    return [{
        json: { error: `파일을 찾을 수 없습니다: ${filename}` },
    }];
}

const imageBuf = fs.readFileSync(filePath);
const ext = path.extname(filename).toLowerCase();
const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const contentType = mimeMap[ext] || 'application/octet-stream';

return [{
    json: {
        headers: { 'Content-Type': contentType },
        body: imageBuf.toString('base64'),
        isBase64: true,
    },
}];
