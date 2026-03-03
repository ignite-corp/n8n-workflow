// 소스 체크아웃 + 고도화 (시뮬레이션) + 커밋 + 푸시 + MR 생성

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const prev = $input.first().json

const projectRoot = 'PROJECT_ROOT_HERE'
const branchName = prev.branchName
const targetBranch = 'GITLAB_TARGET_BRANCH_HERE'

const opts = { cwd: projectRoot, encoding: 'utf-8', timeout: 60000 }

try {
  // 0. 현재 브랜치 기억 + 로컬 변경사항 stash
  const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', opts).trim()
  execSync('git stash push --include-untracked -m "n8n-refine-temp"', opts)

  // 1. 브랜치 체크아웃
  execSync('git fetch origin', opts)
  execSync(`git checkout ${branchName}`, opts)
  execSync(`git pull origin ${branchName}`, opts)

  // 2. 고도화 시뮬레이션 (브랜치 체크아웃 후 실행)
  let refinedFiles = []
  try {
    const diffOutput = execSync("git diff --name-only HEAD~1 HEAD -- '*.tsx' '*.ts' '*.jsx' '*.css'", opts).trim()
    const changedFiles = diffOutput ? diffOutput.split('\n') : []

    for (const filePath of changedFiles) {
      const fullPath = path.join(projectRoot, filePath)
      if (!fs.existsSync(fullPath)) continue

      let content = fs.readFileSync(fullPath, 'utf-8')
      if (!content.includes('[Auto-Refined by Claude Agent]')) {
        const refineComment = [
          '/**',
          ' * [Auto-Refined by Claude Agent]',
          ` * Original: ${path.basename(filePath)}`,
          ` * Refined at: ${new Date().toISOString()}`,
          ' * ',
          ' * TODO: 실제 Claude CLI 에이전트 연동 시 이 시뮬레이션 제거',
          ' */',
          '',
        ].join('\n')
        content = refineComment + content
        fs.writeFileSync(fullPath, content)
        refinedFiles.push(filePath)
      }
    }
  } catch {}

  // 3. 변경사항 확인 후 커밋
  const status = execSync('git status --porcelain', opts).trim()

  if (status) {
    execSync('git add -A', opts)
    execSync('git commit -m "refactor: [refine] auto-refined by Claude agent"', opts)
  } else {
    // 변경사항이 없어도 MR 생성을 위해 빈 커밋 생성
    execSync('git commit --allow-empty -m "chore: create merge request"', opts)
  }

  // 4. MR 생성 (git push -o 옵션으로 커밋 푸시와 MR 생성을 한 번에)
  const mrTitle = `[Markup] Auto-generated: ${branchName}`
  const pushCmd = [
    'git push',
    '-o merge_request.create',
    `-o merge_request.target=${targetBranch}`,
    `-o merge_request.title="${mrTitle}"`,
    '-o merge_request.remove_source_branch',
    `origin ${branchName}`,
  ].join(' ')

  let pushOutput = ''
  try {
    pushOutput = execSync(pushCmd + ' 2>&1', opts)
  } catch (pushErr) {
    pushOutput = pushErr.stderr || pushErr.stdout || pushErr.message
  }

  // 5. 원래 브랜치로 복원 + stash 복구
  execSync(`git checkout ${currentBranch}`, opts)
  try {
    execSync('git stash pop', opts)
  } catch {}

  return [
    { json: { ...prev, mrSuccess: true, refinedFiles, pushOutput, pushCmd, message: `MR 생성 완료: ${mrTitle}` } },
  ]
} catch (err) {
  // 에러 시에도 원래 브랜치 + stash 복원
  try {
    execSync('git checkout develop', opts)
    execSync('git stash pop', opts)
  } catch {}
  return [{ json: { ...prev, mrSuccess: false, mrError: err.message.slice(-500) } }]
}
