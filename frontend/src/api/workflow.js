import { API_BASE_URL } from './config.js'

const BASE = `${API_BASE_URL}/api/workflow`

async function req(method, path, body) {
  const token = localStorage.getItem('mt_token')
  const opts = {
    method,
    headers: { Authorization: `Bearer ${token}` },
  }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(`${BASE}${path}`, opts)
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

export const wf = {
  listNodes:   (boardId)        => req('GET',  `/boards/${boardId}/nodes`),
  createNode:  (body)           => req('POST', '/nodes', body),
  plan:        (visionBoardId)  => req('POST', '/plan',  { vision_board_id: visionBoardId }),
  execute:     (workflowRunId)  => req('POST', '/execute', { workflow_run_id: workflowRunId }),
  getRun:      (runId)          => req('GET',  `/runs/${runId}`),
}
