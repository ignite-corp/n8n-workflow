const { execSync } = require('child_process')
const path = require('path')

const body = $input.first().json.body || $input.first().json
const ref = body.ref || ''
const branch = ref.replace('refs/heads/', '')

// main 브랜치 push만 처리
if (branch !== 'main') {
  return [{ json: { action: 'skip', reason: `브랜치 무시: ${branch}` } }]
}

const pusher = body.pusher ? body.pusher.name : 'unknown'
const commits = body.commits || []
const commitMessages = commits.map(c => c.message).join(', ')

const SCRIPT_DIR = '/Users/firejune/Workspace/n8n-workflow'
const opts = { cwd: SCRIPT_DIR, encoding: 'utf-8', timeout: 30000 }

try {
  // git pull
  const pullResult = execSync('git pull origin main --quiet 2>&1', opts).trim()

  // 변경된 파일 확인 (직전 커밋 기준)
  const changedFiles = execSync(
    `git diff --name-only HEAD~${commits.length || 1} HEAD`,
    opts
  ).trim().split('\n').filter(Boolean)

  // start.sh 변경 여부 → restart 필요
  const needsRestart = changedFiles.some(f =>
    f === 'start.sh' || f === '.env' || f === 'build-workflow.cjs'
  )

  if (needsRestart) {
    // self restart: 백그라운드에서 restart 스크립트 실행
    execSync(
      'nohup bash -c "sleep 2 && kill $(lsof -ti :5678) && sleep 3 && bash start.sh" > .n8n/restart.log 2>&1 &',
      opts
    )
    return [{
      json: {
        action: 'restart',
        pusher,
        commits: commitMessages,
        changedFiles,
        message: 'n8n restart 예약됨 (2초 후)',
      },
    }]
  }

  // 핫 리로드: deploy.sh 실행 (워크플로우만 갱신, restart 불필요)
  const deployResult = execSync('bash deploy.sh 2>&1', opts)

  return [{
    json: {
      action: 'hot-reload',
      pusher,
      commits: commitMessages,
      changedFiles,
      deployResult: deployResult.slice(-500),
      message: '핫 리로드 완료',
    },
  }]
} catch (err) {
  return [{
    json: {
      action: 'error',
      error: err.message.slice(-500),
    },
  }]
}
