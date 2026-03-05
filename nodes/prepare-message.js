const body = $input.first().json.body
const staticData = $getWorkflowStaticData('global')
const objectKind = body.object_kind
const CHANNEL_DEFAULT = 'SLACK_CHANNEL_HERE'
const CHANNEL_SHIP = 'SLACK_CHANNEL_SHIP_HERE'
const TEAM_MENTION = 'SLACK_TEAM_MENTION_HERE'

function getChannel(labels) {
  const names = (labels || []).map((l) => (typeof l === 'string' ? l : l.title).toLowerCase())
  return names.some((n) => ['ask', 'show'].includes(n)) ? CHANNEL_DEFAULT : CHANNEL_SHIP
}

function mdToMrkdwn(md) {
  if (!md) return ''
  return md
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^###\s+(.+)$/gm, '*$1*')
    .replace(/^##\s+(.+)$/gm, '*$1*')
    .replace(/^#\s+(.+)$/gm, '*$1*')
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/~~(.+?)~~/g, '~$1~')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>')
    .replace(/^---$/gm, '────────────────────')
    .replace(/- \[x\]/gi, '☑')
    .replace(/- \[ \]/g, '☐')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function getUpdateDetails(body) {
  const changes = body.changes || {}
  const attrs = body.object_attributes
  const details = []

  if (changes.title) {
    details.push(`제목: ${changes.title.previous} → ${changes.title.current}`)
  }
  if (changes.description) {
    details.push('설명 변경')
  }
  if (changes.target_branch) {
    details.push(`대상 브랜치: \`${changes.target_branch.previous}\` → \`${changes.target_branch.current}\``)
  }
  if (changes.labels) {
    const prev = (changes.labels.previous || []).map((l) => l.title).join(', ') || '없음'
    const curr = (changes.labels.current || []).map((l) => l.title).join(', ') || '없음'
    details.push(`레이블: ${prev} → ${curr}`)
  }
  if (changes.assignees) {
    const curr = (changes.assignees.current || []).map((a) => a.name).join(', ') || '없음'
    details.push(`담당자: ${curr}`)
  }
  if (changes.reviewers) {
    const curr = (changes.reviewers.current || []).map((r) => r.name).join(', ') || '없음'
    details.push(`리뷰어: ${curr}`)
  }
  if (changes.milestone_id) {
    details.push('마일스톤 변경')
  }

  if (attrs.oldrev) {
    const lastCommit = attrs.last_commit
    if (lastCommit) {
      const msg = (lastCommit.title || lastCommit.message || '').split('\n')[0]
      details.push(`커밋: \`${msg}\``)
    } else {
      details.push('새 커밋 추가')
    }
  }

  return details.length > 0 ? details : ['내용 업데이트']
}

if (objectKind === 'merge_request') {
  const attrs = body.object_attributes
  const user = body.user
  const action = attrs.action
  const mrKey = `mr_${attrs.iid}`

  if (action === 'open') {
    const mrLabels = attrs.labels || []
    const labelText = mrLabels.map((l) => l.title).join(', ')
    const channel = getChannel(mrLabels)
    const lines = [
      `${TEAM_MENTION} ${attrs.title} <${attrs.url}|MR>입니다.`,
      '',
      `• *작성자:* ${user.name} (@${user.username})`,
      `• *브랜치:* \`${attrs.source_branch}\` → \`${attrs.target_branch}\``,
    ]
    if (labelText) lines.push(`• *라벨:* \`${labelText}\``)

    return [
      {
        json: {
          action: 'new_thread',
          channel,
          message: lines.join('\n'),
          description: mdToMrkdwn(attrs.description),
          mrKey,
          fallback: `${attrs.title} MR by ${user.name}`,
        },
      },
    ]
  }

  const threadTs = staticData[mrKey]
  const savedChannel = staticData[`${mrKey}_channel`] || CHANNEL_DEFAULT
  if (!threadTs) return [{ json: { action: 'ignore' } }]

  if (action === 'update') {
    const details = getUpdateDetails(body)
    return [
      {
        json: {
          action: 'reply',
          channel: savedChannel,
          message: `🔄 MR 업데이트\n${details.join('\n')}\nby ${user.name}`,
          threadTs,
          mrKey,
          fallback: `MR 업데이트 by ${user.name}`,
        },
      },
    ]
  }

  if (action === 'merge') {
    return [
      {
        json: {
          action: 'merge',
          channel: savedChannel,
          message: `✅ MR 머지 완료\nby ${user.name}`,
          threadTs,
          mrKey,
          fallback: `✅ MR 머지 완료 by ${user.name}`,
        },
      },
    ]
  }

  const actionLabels = {
    close: '🚫 MR 닫힘',
    reopen: '♻️ MR 재오픈',
    approved: '👍 MR 승인',
    unapproved: '👎 MR 승인 취소',
  }

  const header = actionLabels[action]
  if (!header) return [{ json: { action: 'ignore' } }]

  return [
    {
      json: {
        action: 'reply',
        channel: savedChannel,
        message: `${header}\nby ${user.name}`,
        threadTs,
        mrKey,
        fallback: `${header} by ${user.name}`,
      },
    },
  ]
}

if (objectKind === 'pipeline') {
  const pipeline = body.object_attributes
  const mr = body.merge_request

  if (!mr) return [{ json: { action: 'ignore' } }]

  const mrKey = `mr_${mr.iid}`
  const threadTs = staticData[mrKey]
  if (!threadTs) return [{ json: { action: 'ignore' } }]

  const statusLabels = {
    success: '✅ 파이프라인 성공',
    failed: '❌ 파이프라인 실패',
    canceled: '🚫 파이프라인 취소',
  }

  const status = statusLabels[pipeline.status]
  if (!status) return [{ json: { action: 'ignore' } }]

  const duration = pipeline.duration ? ` (${Math.round(pipeline.duration / 60)}분)` : ''
  const pipelineUrl = `${body.project.web_url}/-/pipelines/${pipeline.id}`

  const savedChannel = staticData[`${mrKey}_channel`] || CHANNEL_DEFAULT
  return [
    {
      json: {
        action: 'reply',
        channel: savedChannel,
        message: `${status}${duration}\n\`${pipeline.ref}\` • <${pipelineUrl}|#${pipeline.id}>`,
        threadTs,
        mrKey,
        fallback: status,
      },
    },
  ]
}

if (objectKind === 'note') {
  const note = body.object_attributes
  const user = body.user
  const mr = body.merge_request

  if (!mr || note.noteable_type !== 'MergeRequest') return [{ json: { action: 'ignore' } }]

  const mrKey = `mr_${mr.iid}`
  const threadTs = staticData[mrKey]
  if (!threadTs) return [{ json: { action: 'ignore' } }]

  const comment = mdToMrkdwn(note.note)
  const preview = comment.length > 200 ? comment.substring(0, 200) + '...' : comment

  const savedChannel = staticData[`${mrKey}_channel`] || CHANNEL_DEFAULT
  return [
    {
      json: {
        action: 'reply',
        channel: savedChannel,
        message: `💬 *${user.name}* <${note.url}|코멘트>\n${preview}`,
        threadTs,
        mrKey,
        fallback: `${user.name} 코멘트`,
      },
    },
  ]
}

return [{ json: { action: 'ignore' } }]
