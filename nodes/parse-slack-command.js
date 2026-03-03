// Slack Slash Command 페이로드에서 Figma URL + 프롬프트 추출
// tasks.json을 생성하여 Kombai runner에 전달

const body = $input.first().json.body
const staticData = $getWorkflowStaticData('global')
const path = require('path')
const fs = require('fs')
const pocDir = 'KOMBAI_POC_DIR_HERE'
const projectRoot = 'PROJECT_ROOT_HERE'

// Slack slash command 또는 수동 트리거에서 데이터 추출
let figmaUrl = ''
let prompt = ''
let userName = 'n8n-bot'
let channelId = 'SLACK_CHANNEL_HERE'

if (body.text) {
  const text = body.text.trim()
  const urlMatch = text.match(/(https?:\/\/[^\s]+figma[^\s]+)/)
  figmaUrl = urlMatch ? urlMatch[1] : ''
  let remaining = urlMatch ? text.replace(urlMatch[0], '').trim() : text

  // 접두어 정리
  remaining = remaining.replace(/\s+/g, ' ').trim()

  prompt = remaining
  userName = body.user_name || 'slack-user'
  channelId = body.channel_id || 'SLACK_CHANNEL_HERE'
} else {
  figmaUrl = body.figmaUrl || ''
  prompt = body.prompt || ''
  userName = body.userName || 'n8n-bot'
}

if (!figmaUrl) {
  return [{ json: { error: 'Figma URL이 필요합니다.', success: false } }]
}

// Figma URL에서 노드 정보 추출
const figmaMatch = figmaUrl.match(/figma\.com\/(?:design|file)\/([^/]+)\/[^?]*\?.*node-id=([^&]+)/)
const fileId = figmaMatch ? figmaMatch[1] : 'unknown'
const nodeId = figmaMatch ? figmaMatch[2].replace('-', ':') : 'unknown'

// 브랜치명 생성 (날짜 + 시분 + 노드ID로 유니크하게)
const now = new Date()
const timestamp = now.toISOString().slice(0, 10).replace(/-/g, '')
const timeSuffix = now.toISOString().slice(11, 16).replace(':', '')
const branchName = `markup/auto-${timestamp}-${timeSuffix}-${nodeId.replace(':', '-')}`

// 작업 ID
const jobId = `job-${Date.now()}`

// tasks.json 생성 (Kombai runner가 읽을 파일)
const tasksConfig = {
  tasks: [
    {
      id: jobId,
      figmaUrl,
      prompt: prompt || 'Convert to React component with TypeScript and Emotion',
    },
  ],
  config: {
    timeoutMs: 300000,
    workspaceDir: projectRoot,
  },
}

const tasksPath = path.join(pocDir, 'tasks.json')
fs.writeFileSync(tasksPath, JSON.stringify(tasksConfig, null, 2))

// 진행 중인 작업 등록 (취소 확인용)
staticData[jobId] = { status: 'running', branchName, figmaUrl, userName, createdAt: new Date().toISOString() }
staticData['lastJobId'] = jobId

// Ack 응답용 포맷된 메시지 생성
const promptLines = (prompt || '(기본 프롬프트)').split(' - ').filter(Boolean)
const promptFormatted =
  promptLines.length > 1 ? promptLines.map(l => l.trim()).join('\n  ') : prompt || '(기본 프롬프트)'

const slackMessage = [
  ':rocket: *마크업 생성 작업을 시작합니다!*',
  '',
  `• *Figma:* ${figmaUrl}`,
  `• *요청:*`,
  `  ${promptFormatted}`,
  `• *브랜치:* \`${branchName}\``,
  `• *작업 ID:* \`${jobId}\``,
  '',
  `취소하려면: \`/cancel ${jobId}\``,
].join('\n')

return [
  {
    json: {
      success: true,
      jobId,
      figmaUrl,
      prompt,
      userName,
      channelId,
      slackBotToken: 'SLACK_BOT_TOKEN_HERE',
      branchName,
      fileId,
      nodeId,
      pocDir,
      projectRoot,
      tasksPath,
      slackMessage,
    },
  },
]
