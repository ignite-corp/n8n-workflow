// Kombai Runner 실행 + 완료 대기
// spawn으로 프로세스 실행, close 이벤트로 완료 감지
// 10초마다 await로 이벤트 루프 yield → Task Runner heartbeat 응답 유지

const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const https = require('https')

const prev = $input.first().json
const pocDir = prev.pocDir
const TIMEOUT_MS = 1800000 // 30분

// ─── Slack 쓰레드 알림 헬퍼 ─────────────────────────────────────────
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

function postThread(text) {
  if (!prev.threadTs || !prev.slackBotToken) return Promise.resolve()
  return slackPost(prev.slackBotToken, {
    channel: prev.channelId,
    thread_ts: prev.threadTs,
    text,
  }).catch(() => {})
}

// ─── Kombai 실행 시작 알림 ──────────────────────────────────────────
await postThread(':gear: Kombai 마크업 생성을 시작합니다...')

// kombai-poc .env에서 환경변수 로드
const envVars = { PATH: '/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin', HOME: '/Users/firejune' }
try {
  fs.readFileSync(path.join(pocDir, '.env'), 'utf-8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .forEach(l => {
      const [k, ...rest] = l.split('=')
      envVars[k.trim()] = rest.join('=').trim()
    })
} catch {}

const child = spawn('pnpm', ['dev'], {
  cwd: pocDir,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...envVars, KOMBAI_EXIT_AFTER: 'true', KOMBAI_AUTO_RUN: 'true' },
})

let stdout = ''
let stderr = ''
child.stdout.on('data', d => {
  stdout += d.toString().slice(-2000)
})
child.stderr.on('data', d => {
  stderr += d.toString().slice(-2000)
})

// 완료 플래그
let done = false
let exitCode = null
let processError = ''

child.on('close', code => {
  done = true
  exitCode = code
})
child.on('error', err => {
  done = true
  exitCode = -1
  processError = err.message
})

// 10초마다 yield하면서 완료 대기 (heartbeat 호환)
const startTime = Date.now()
let lastNotifyMin = 0

while (!done) {
  if (Date.now() - startTime > TIMEOUT_MS) {
    try {
      child.kill('SIGTERM')
    } catch {}
    await postThread(`:warning: Kombai 타임아웃 (${TIMEOUT_MS / 60000}분)`)
    return [
      {
        json: {
          ...prev,
          kombaiSuccess: false,
          kombaiOutput: stdout.slice(-500),
          kombaiError: `타임아웃 (${TIMEOUT_MS / 60000}분)`,
        },
      },
    ]
  }

  // 이벤트 루프에 yield → heartbeat 응답 가능
  await new Promise(r => setTimeout(r, 10000))

  // 5분마다 진행 상태 알림
  const elapsedMin = Math.floor((Date.now() - startTime) / 60000)
  if (elapsedMin > 0 && elapsedMin % 5 === 0 && elapsedMin !== lastNotifyMin) {
    lastNotifyMin = elapsedMin
    postThread(`:hourglass_flowing_sand: Kombai 실행 중... (${elapsedMin}분 경과)`)
  }
}

const success = exitCode === 0

// 완료 알림
if (success) {
  await postThread(':white_check_mark: Kombai 마크업 생성 완료! 파일을 수집합니다...')
} else {
  await postThread(`:warning: Kombai 프로세스가 비정상 종료되었습니다 (exit: ${exitCode})`)
}

return [
  {
    json: {
      ...prev,
      kombaiSuccess: success,
      kombaiOutput: stdout.slice(-500),
      kombaiError: success ? '' : stderr.slice(-500) || processError,
      exitCode,
    },
  },
]
