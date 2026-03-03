// 취소 확인 — Kombai 실행 전에 해당 작업이 취소되었는지 확인
const staticData = $getWorkflowStaticData('global')
const prev = $input.first().json
const jobId = prev.jobId

const job = staticData[jobId]
const cancelled = job && job.status === 'cancelled'

return [{ json: { ...prev, cancelled } }]
