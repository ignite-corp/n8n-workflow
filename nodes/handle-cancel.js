// /cancel 명령 처리 — 진행 중인 작업을 취소 마킹
const body = $input.first().json.body
const staticData = $getWorkflowStaticData('global')

const text = (body.text || '').trim()

// /cancel job-123456 또는 /cancel (마지막 작업 취소)
let jobId = text || staticData['lastJobId']

if (!jobId) {
  return [{ json: { message: '❌ 취소할 작업이 없습니다.' } }]
}

const job = staticData[jobId]
if (!job) {
  return [{ json: { message: `❌ 작업을 찾을 수 없습니다: \`${jobId}\`` } }]
}

if (job.status === 'cancelled') {
  return [{ json: { message: `⚠️ 이미 취소된 작업입니다: \`${jobId}\`` } }]
}

if (job.status === 'completed') {
  return [{ json: { message: `⚠️ 이미 완료된 작업입니다: \`${jobId}\`` } }]
}

// 취소 마킹
job.status = 'cancelled'
job.cancelledAt = new Date().toISOString()
staticData[jobId] = job

return [{ json: { message: `✅ 작업이 취소되었습니다: \`${jobId}\`\n• 브랜치: \`${job.branchName}\`` } }]
