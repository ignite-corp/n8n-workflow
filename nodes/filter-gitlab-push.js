// GitLab Push Webhook에서 markup/auto-* 브랜치만 필터링
// 봇 커밋(고도화 커밋)은 무한루프 방지를 위해 제외

const body = $input.first().json.body
const ref = body.ref || '' // refs/heads/markup/auto-...
const userName = body.user_name || ''
const commits = body.commits || []

// 브랜치명 추출
const branchMatch = ref.match(/^refs\/heads\/(.+)$/)
const branchName = branchMatch ? branchMatch[1] : ''

// markup/auto-* 브랜치만 허용
if (!branchName.startsWith('markup/auto-')) {
  return [{ json: { action: 'skip', reason: `브랜치 필터: ${branchName}` } }]
}

// n8n-bot 커밋은 무시 (고도화 커밋의 무한루프 방지)
const lastCommit = commits[commits.length - 1]
if (lastCommit && lastCommit.author && lastCommit.author.name === 'n8n-bot') {
  return [{ json: { action: 'skip', reason: '봇 커밋 무시' } }]
}

// TODO: 실제 고도화 로직 추가 시 [refine] 중복 체크 복원

const projectUrl = body.project ? body.project.web_url : ''
const projectPath = body.project ? body.project.path_with_namespace : ''

return [
  {
    json: {
      action: 'refine',
      branchName,
      projectUrl,
      projectPath,
      userName,
      lastCommitMessage: lastCommit ? lastCommit.message : '',
      commitCount: commits.length,
    },
  },
]
