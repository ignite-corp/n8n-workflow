// 실패 시 쓰레드에 알림

const https = require('https')
const prev = $input.first().json

function slackPost(token, body) {
  return new Promise(resolve => {
    const data = JSON.stringify(body)
    const req = https.request(
      {
        hostname: 'slack.com',
        path: '/api/chat.postMessage',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      res => {
        let buf = ''
        res.on('data', c => (buf += c))
        res.on('end', () => {
          try {
            resolve(JSON.parse(buf))
          } catch {
            resolve(null)
          }
        })
      }
    )
    req.on('error', () => resolve(null))
    req.write(data)
    req.end()
  })
}

const errorMsg = prev.error || prev.kombaiError || 'Kombai 출력 파일 없음'

if (prev.threadTs && prev.slackBotToken) {
  await slackPost(prev.slackBotToken, {
    channel: prev.channelId,
    thread_ts: prev.threadTs,
    text: `:x: *마크업 생성 실패*\n\n\`\`\`${errorMsg}\`\`\``,
  })
}

return [{ json: { ...prev, status: 'failed', error: errorMsg } }]
