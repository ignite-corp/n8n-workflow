// AI 이미지 정적 파일 서버
// 생성형 AI 이미지를 HTTP로 서빙
// 포트: 3456

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.AI_IMAGE_SERVER_PORT || 3456;
const ASSETS_DIR = (process.env.AI_IMAGES_DIR || '~/ai-images')
    .replace(/^~/, process.env.HOME || '/tmp');

const MIME = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
};

const server = http.createServer((req, res) => {
    // GET만 허용
    if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }

    // URL에서 filename 추출 (path의 마지막 세그먼트)
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const filename = path.basename(urlPath);

    if (!filename || filename === '/') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'filename required' }));
        return;
    }

    const filePath = path.join(ASSETS_DIR, filename);

    // 경로 순회 방지
    if (!filePath.startsWith(ASSETS_DIR)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden' }));
        return;
    }

    if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Not found: ${filename}` }));
        return;
    }

    const ext = path.extname(filename).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';

    const stat = fs.statSync(filePath);
    res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stat.size,
        'Cache-Control': 'public, max-age=86400',
    });
    fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
    console.log(`AI image server running on port ${PORT}`);
    console.log(`Serving from: ${ASSETS_DIR}`);
});
