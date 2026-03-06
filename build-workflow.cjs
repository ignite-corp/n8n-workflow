const fs = require('fs')
const path = require('path')

const dir = __dirname
const outDir = path.join(dir, '.n8n')
const nodesDir = path.join(dir, 'nodes')

// ─── 환경변수 ──────────────────────────────────────────────────────

const env = {
  SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
  SLACK_CHANNEL: process.env.SLACK_CHANNEL || 'fe3-dm',
  SLACK_CHANNEL_SHIP: process.env.SLACK_CHANNEL_SHIP || process.env.SLACK_CHANNEL || 'fe3-dm',
  SLACK_TEAM_MENTION: process.env.SLACK_TEAM_MENTION || '@fe3',
  PROJECT_ROOT: path.resolve(dir, process.env.PROJECT_ROOT || '../..'),
  GITLAB_TARGET_BRANCH: process.env.GITLAB_TARGET_BRANCH || 'develop',
  // AI 이미지 생성
  COMFYUI_HOST: process.env.COMFYUI_HOST || '192.168.219.176',
  COMFYUI_PORT: process.env.COMFYUI_PORT || '8188',
  AI_IMAGES_DIR: process.env.AI_IMAGES_DIR || '~/ai-images',
  AI_IMAGE_BASE_URL: process.env.AI_IMAGE_BASE_URL || process.env.WEBHOOK_URL || 'http://localhost:5678',
  // WoL
  WOL_MAC_ADDRESS: process.env.WOL_MAC_ADDRESS || '',
  WOL_BROADCAST: process.env.WOL_BROADCAST || '255.255.255.255',
}

// KOMBAI_POC_DIR은 PROJECT_ROOT 기준 상대경로
env.KOMBAI_POC_DIR = path.resolve(env.PROJECT_ROOT, process.env.KOMBAI_POC_DIR || './scripts/kombai-poc')

if (!env.SLACK_BOT_TOKEN) {
  console.error('오류: SLACK_BOT_TOKEN 환경변수가 없습니다.')
  process.exit(1)
}

// ─── 코드 파일 맵 ──────────────────────────────────────────────────

const codeFiles = {
  // 기존 GitLab → Slack 알림
  __PREPARE_MESSAGE_CODE__: fs.readFileSync(path.join(nodesDir, 'prepare-message.js'), 'utf8'),
  __SAVE_THREAD_TS_CODE__: fs.readFileSync(path.join(nodesDir, 'save-thread-ts.js'), 'utf8'),
  // 마크업 생성
  __PARSE_SLACK_COMMAND_CODE__: fs.readFileSync(path.join(nodesDir, 'parse-slack-command.js'), 'utf8'),
  __RUN_KOMBAI_CODE__: fs.readFileSync(path.join(nodesDir, 'run-kombai.js'), 'utf8'),
  __WAIT_KOMBAI_DONE_CODE__: fs.readFileSync(path.join(nodesDir, 'wait-kombai-done.js'), 'utf8'),
  __GIT_PUSH_MARKUP_CODE__: fs.readFileSync(path.join(nodesDir, 'git-push-markup.js'), 'utf8'),
  __CHECK_CANCEL_CODE__: fs.readFileSync(path.join(nodesDir, 'check-cancel.js'), 'utf8'),
  __HANDLE_CANCEL_CODE__: fs.readFileSync(path.join(nodesDir, 'handle-cancel.js'), 'utf8'),
  __SLACK_THREAD_START_CODE__: fs.readFileSync(path.join(nodesDir, 'slack-thread-start.js'), 'utf8'),
  __NOTIFY_FAILURE_CODE__: fs.readFileSync(path.join(nodesDir, 'notify-failure.js'), 'utf8'),
  // 마크업 고도화
  __FILTER_GITLAB_PUSH_CODE__: fs.readFileSync(path.join(nodesDir, 'filter-gitlab-push.js'), 'utf8'),
  __SIMULATE_CLAUDE_REFINE_CODE__: fs.readFileSync(path.join(nodesDir, 'simulate-claude-refine.js'), 'utf8'),
  __GIT_REFINE_AND_MR_CODE__: fs.readFileSync(path.join(nodesDir, 'git-refine-and-mr.js'), 'utf8'),
  // GitHub 자동 배포
  __GITHUB_DEPLOY_CODE__: fs.readFileSync(path.join(nodesDir, 'github-deploy.js'), 'utf8'),
  // AI 이미지 생성
  __AI_IMAGE_BUILD_PROMPT_CODE__: fs.readFileSync(path.join(nodesDir, 'ai-image-build-prompt.js'), 'utf8'),
  __AI_IMAGE_POLL_CODE__: fs.readFileSync(path.join(nodesDir, 'ai-image-poll.js'), 'utf8'),
  __AI_IMAGE_SERVE_CODE__: fs.readFileSync(path.join(nodesDir, 'ai-image-serve.js'), 'utf8'),
  __AI_IMAGE_WOL_HEALTH_CODE__: fs.readFileSync(path.join(nodesDir, 'ai-image-wol-health.js'), 'utf8'),
}

// ─── MR Description 생성 ───────────────────────────────────────────

const mrDescription = [
  '## 📝 변경 사항\\n\\n- [x] 기능 추가\\n- [ ] 디자인 수정\\n\\n',
  '## 🔍 상세 설명\\n\\n',
  'Figma 디자인에서 자동 생성된 마크업입니다.\\n',
  '- Kombai로 초기 마크업 생성\\n',
  '- Claude 에이전트로 사내 컨벤션 적용 고도화\\n\\n',
  '## ⚠️ 주의사항\\n\\n',
  '자동 생성된 코드이므로 반드시 리뷰 후 머지해주세요.\\n\\n',
  '/assign me',
].join('')

// ─── 빌드 함수 ─────────────────────────────────────────────────────

function buildWorkflow(templateFile, outputFile, extraReplacements = {}) {
  const template = JSON.parse(fs.readFileSync(path.join(dir, templateFile), 'utf8'))

  // Code 노드에 JS 코드 주입
  for (const node of template.nodes) {
    if (node.parameters && node.parameters.jsCode) {
      const placeholder = node.parameters.jsCode
      if (codeFiles[placeholder]) {
        node.parameters.jsCode = codeFiles[placeholder]
      }
    }
  }

  let json = JSON.stringify(template, null, 2)
  json = json.replace(/SLACK_BOT_TOKEN_HERE/g, env.SLACK_BOT_TOKEN)
  json = json.replace(/SLACK_CHANNEL_HERE/g, env.SLACK_CHANNEL)
  json = json.replace(/SLACK_CHANNEL_SHIP_HERE/g, env.SLACK_CHANNEL_SHIP)
  json = json.replace(/SLACK_TEAM_MENTION_HERE/g, env.SLACK_TEAM_MENTION)
  json = json.replace(/KOMBAI_POC_DIR_HERE/g, env.KOMBAI_POC_DIR)
  json = json.replace(/PROJECT_ROOT_HERE/g, env.PROJECT_ROOT)
  json = json.replace(/GITLAB_TARGET_BRANCH_HERE/g, env.GITLAB_TARGET_BRANCH)
  // AI 이미지 생성
  json = json.replace(/COMFYUI_HOST_HERE/g, env.COMFYUI_HOST)
  json = json.replace(/COMFYUI_PORT_HERE/g, env.COMFYUI_PORT)
  json = json.replace(/AI_IMAGES_DIR_HERE/g, env.AI_IMAGES_DIR)
  json = json.replace(/AI_IMAGE_BASE_URL_HERE/g, env.AI_IMAGE_BASE_URL.replace(/\/$/, ''))
  // WoL
  json = json.replace(/WOL_MAC_ADDRESS_HERE/g, env.WOL_MAC_ADDRESS)
  json = json.replace(/WOL_BROADCAST_HERE/g, env.WOL_BROADCAST)

  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, outputFile)
  fs.writeFileSync(outFile, json)
  console.log(`  ✓ ${outputFile}`)
  return outFile
}

// ─── 빌드 실행 ─────────────────────────────────────────────────────

console.log('워크플로우 빌드 시작...\n')

// 1. GitLab MR → Slack 알림 (기존)
buildWorkflow('gitlab-mr-slack-notify.json', 'workflow-resolved.json')

// 2. Figma 마크업 생성 → GitLab 푸시
buildWorkflow('figma-markup-generate.json', 'markup-generate-resolved.json')

// 3. 마크업 고도화 → MR 생성
buildWorkflow('figma-markup-refine.json', 'markup-refine-resolved.json')

// 4. GitHub 자동 배포
buildWorkflow('github-deploy.json', 'deploy-resolved.json')

// 5. AI 이미지 생성
buildWorkflow('ai-image-gen.json', 'ai-image-resolved.json')

console.log('\n워크플로우 빌드 완료!')
