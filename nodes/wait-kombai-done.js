// Kombai 완료 후 변경 파일 수집 + 쓰레드 보고
// git diff + untracked 파일 모두 감지

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const https = require('https')

const prev = $input.first().json
const projectRoot = prev.projectRoot

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

const opts = { cwd: projectRoot, encoding: 'utf-8', timeout: 5000 }

// ─── 변경/추가 파일 감지 ────────────────────────────────────────────
let changedFiles = []
let untrackedFiles = []

try {
  const diffOutput = execSync('git diff --name-only', opts).trim()
  if (diffOutput) {
    changedFiles = diffOutput.split('\n').filter(f => f.length > 0)
  }

  const untrackedOutput = execSync('git ls-files --others --exclude-standard', opts).trim()
  if (untrackedOutput) {
    untrackedFiles = untrackedOutput.split('\n').filter(f => f.length > 0 && /\.(tsx?|jsx?|css)$/.test(f))
  }
} catch (err) {
  await postThread(`:x: 파일 수집 실패\n\n\`\`\`${err.message.slice(-300)}\`\`\``)
  return [
    {
      json: {
        ...prev,
        success: false,
        error: `파일 수집 실패: ${err.message}`,
        files: [],
      },
    },
  ]
}

const allChangedFiles = [...new Set([...changedFiles, ...untrackedFiles])]

if (allChangedFiles.length === 0) {
  await postThread(':warning: 변경된 파일이 없습니다.')
  return [
    {
      json: {
        ...prev,
        success: false,
        error: '변경된 파일 없음',
        files: [],
      },
    },
  ]
}

// ─── 파일 정보 수집 ─────────────────────────────────────────────────
const files = []
for (const relPath of allChangedFiles) {
  try {
    const absPath = path.resolve(projectRoot, relPath)
    const stat = fs.statSync(absPath)
    if (stat.isFile() && /\.(tsx?|jsx?|css)$/.test(relPath)) {
      files.push({
        name: path.basename(relPath),
        path: absPath,
        relativePath: relPath,
        content: fs.readFileSync(absPath, 'utf-8'),
        size: stat.size,
        isNew: untrackedFiles.includes(relPath),
      })
    }
  } catch {}
}

// ─── diff 요약 생성 + 쓰레드 보고 ──────────────────────────────────
let diffStat = ''
try {
  if (changedFiles.length > 0) {
    diffStat = execSync('git diff --stat', opts).trim()
  }
} catch {}

const fileList = files
  .map(f => `  ${f.isNew ? ':new:' : ':pencil2:'} \`${f.relativePath}\` (${(f.size / 1024).toFixed(1)}KB)`)
  .join('\n')

const reportLines = [':white_check_mark: *Kombai 마크업 생성 완료!*', '', `*변경 파일 ${files.length}개:*`, fileList]

if (diffStat) {
  reportLines.push('', '*변경 요약:*', `\`\`\`${diffStat}\`\`\``)
}

await postThread(reportLines.join('\n'))

return [
  {
    json: {
      ...prev,
      success: true,
      files,
      changedFiles: allChangedFiles,
    },
  },
]
