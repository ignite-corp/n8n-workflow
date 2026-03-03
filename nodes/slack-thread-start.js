// 쓰레드 부모 메시지를 Slack 채널에 post하고 threadTs를 캡처

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

const result = await slackPost(prev.slackBotToken, {
  channel: prev.channelId,
  text: prev.slackMessage,
})

const threadTs = result?.ok !== false ? result?.ts || null : null

return [
  {
    json: {
      ...prev,
      threadTs,
    },
  },
]
