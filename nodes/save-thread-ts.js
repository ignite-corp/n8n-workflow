const staticData = $getWorkflowStaticData('global')
const prevData = $('메시지 준비').first().json
const response = $input.first().json

if (response.ok && response.ts) {
  staticData[prevData.mrKey] = response.ts
}

return [
  {
    json: {
      channel: prevData.channel,
      threadTs: response.ts,
      description: prevData.description,
    },
  },
]
