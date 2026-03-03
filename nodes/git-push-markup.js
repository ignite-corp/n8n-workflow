// Git 브랜치 생성 + 커밋 + 푸시
// 현재 작업 중인 변경사항을 stash하고, 깨끗한 상태에서 브랜치 생성
// Kombai가 생성/수정한 파일만 커밋

const { execSync } = require('child_process')
const https = require('https')
const prev = $input.first().json

const projectRoot = prev.projectRoot
const branchName = prev.branchName
const figmaUrl = prev.figmaUrl
const prompt = prev.prompt
const files = prev.files || []

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

if (files.length === 0) {
  await postThread(':x: 커밋할 파일이 없습니다.')
  return [{ json: { ...prev, gitSuccess: false, gitError: '커밋할 파일 없음' } }]
}

try {
  const opts = { cwd: projectRoot, encoding: 'utf-8', timeout: 60000 }

  // 현재 브랜치 기억
  const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', opts).trim()

  // 기존 변경사항 stash (Kombai 생성 파일 포함)
  execSync('git stash push --include-untracked -m "n8n-markup-temp"', opts)

  // 깨끗한 상태에서 새 브랜치 생성
  try {
    execSync(`git checkout -b ${branchName}`, opts)
  } catch {
    execSync(`git branch -D ${branchName}`, opts)
    execSync(`git checkout -b ${branchName}`, opts)
  }

  // stash 복원
  try {
    execSync('git stash pop', opts)
  } catch {}

  // Kombai가 생성/수정한 파일만 git add
  for (const file of files) {
    execSync(`git add "${file.relativePath}"`, opts)
  }

  // 커밋
  const commitMsg = `feat: auto-generated markup from Figma

Figma: ${figmaUrl}
Prompt: ${prompt}
Files: ${files.map(f => f.relativePath).join(', ')}`

  execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, opts)
  execSync(`git push -u origin ${branchName}`, opts)

  const fileList = files.map(f => `  • \`${f.relativePath}\``).join('\n')
  await postThread(`:tada: *Git 푸시 완료!*\n\n• *브랜치:* \`${branchName}\`\n• *파일 ${files.length}개:*\n${fileList}`)

  // 원래 브랜치로 복원
  execSync(`git checkout ${currentBranch}`, opts)

  return [{ json: { ...prev, gitSuccess: true, message: `${branchName} 푸시 완료` } }]
} catch (err) {
  try {
    const opts = { cwd: projectRoot, encoding: 'utf-8', timeout: 10000 }
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', opts).trim()
    if (currentBranch !== 'develop') {
      execSync('git checkout develop', opts)
    }
  } catch {}

  await postThread(`:x: *Git 푸시 실패*\n\n\`\`\`${err.message.slice(-300)}\`\`\``)
  return [{ json: { ...prev, gitSuccess: false, gitError: err.message.slice(-500) } }]
}
