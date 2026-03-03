// Claude CLI 에이전트 고도화 시뮬레이션
// 실제 Claude CLI가 준비되면 이 노드를 교체
//
// 현재는 원본 파일에 주석과 간단한 구조 개선만 추가하여
// "고도화가 일어난 것처럼" 시뮬레이션

const fs = require('fs')
const path = require('path')

const prev = $input.first().json
const projectRoot = 'PROJECT_ROOT_HERE'
const branchName = prev.branchName

// 프로젝트 루트에서 해당 브랜치의 변경된 파일 찾기
// (git diff로 이전 커밋 대비 변경 파일 목록)
const { execSync } = require('child_process')

let changedFiles = []
try {
  const diffOutput = execSync(`git diff --name-only HEAD~1 HEAD -- '*.tsx' '*.ts' '*.jsx' '*.css'`, {
    cwd: projectRoot,
    encoding: 'utf-8',
  }).trim()
  changedFiles = diffOutput ? diffOutput.split('\n') : []
} catch (err) {
  // 변경 파일 탐지 실패 시 빈 배열
}

// 각 파일에 시뮬레이션 주석 추가
const refinedFiles = []
for (const filePath of changedFiles) {
  const fullPath = path.join(projectRoot, filePath)
  if (!fs.existsSync(fullPath)) continue

  let content = fs.readFileSync(fullPath, 'utf-8')

  // 시뮬레이션: 파일 상단에 고도화 주석 추가
  const refineComment = [
    '/**',
    ' * [Auto-Refined by Claude Agent]',
    ` * Original: ${path.basename(filePath)}`,
    ` * Refined at: ${new Date().toISOString()}`,
    ' * ',
    ' * TODO: 실제 Claude CLI 에이전트 연동 시 이 시뮬레이션 제거',
    ' * - 사내 컨벤션 적용',
    ' * - Emotion styled-components 패턴 적용',
    ' * - 접근성(a11y) 개선',
    ' * - 불필요한 인라인 스타일 제거',
    ' */',
    '',
  ].join('\n')

  // 이미 고도화 주석이 있으면 스킵
  if (!content.includes('[Auto-Refined by Claude Agent]')) {
    content = refineComment + content
    fs.writeFileSync(fullPath, content)
    refinedFiles.push(filePath)
  }
}

return [
  {
    json: {
      ...prev,
      success: true,
      refinedFiles,
      refinedCount: refinedFiles.length,
      simulated: true,
      message: `${refinedFiles.length}개 파일 고도화 시뮬레이션 완료`,
    },
  },
]
