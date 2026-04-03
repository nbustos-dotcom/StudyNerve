import { API_BASE_URL } from './config.js'

const BASE = `${API_BASE_URL}/api`

function getToken() {
  return localStorage.getItem('mt_token')
}

async function req(method, path, body) {
  const token = getToken()
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 204) return null

  let data
  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (res.status === 401) {
    const detail = data?.detail || 'Session expired. Please log in again.'
    const message = Array.isArray(detail) ? detail[0]?.msg ?? String(detail) : String(detail)
    // Only treat as session expiry (clear + redirect) for authenticated routes.
    // Auth endpoints (/auth/login, /auth/register) return 401 for wrong
    // credentials — that is not an expired session, just a bad password.
    if (!path.startsWith('/auth/')) {
      localStorage.removeItem('mt_token')
      localStorage.removeItem('mt_user')
      window.location.href = '/login'
    }
    throw new Error(message)
  }

  if (!res.ok) {
    const detail = data?.detail || `HTTP ${res.status}`
    throw new Error(Array.isArray(detail) ? detail[0]?.msg ?? String(detail) : String(detail))
  }

  return data
}

export const api = {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  /** @param {{ email: string, password: string, name: string }} data */
  register: (data) => req('POST', '/auth/register', data),

  /** @param {{ email: string, password: string }} data */
  login: (data) => req('POST', '/auth/login', data),

  /** @returns {Promise<{ id, email, name, created_at }>} */
  getMe: () => req('GET', '/auth/me'),

  // ── User Settings ────────────────────────────────────────────────────────────
  /** @returns {Promise<{ llm_provider, llm_api_key_set, canvas_url, canvas_connected }>} */
  getSettings: () => req('GET', '/settings'),

  /** @param {{ provider: string, api_key?: string }} data */
  saveProvider: (data) => req('POST', '/settings/provider', data),

  /** @param {{ canvas_url: string, canvas_token: string }} data */
  saveCanvasSettings: (data) => req('POST', '/settings/canvas', data),

  // ── Health ──────────────────────────────────────────────────────────────────
  checkHealth: () => req('GET', '/health'),

  // ── Notes ───────────────────────────────────────────────────────────────────
  /** @returns {Promise<Array>} */
  getNotes: () => req('GET', '/notes'),

  /** @param {{ title: string, content: string, subject?: string }} data */
  createNote: (data) => req('POST', '/notes', data),

  deleteNote: (id) => req('DELETE', `/notes/${id}`),

  /** @returns {Promise<{ created: number }>} */
  extractTopics: (id) => req('POST', `/notes/${id}/extract-topics`),

  // ── Topics ──────────────────────────────────────────────────────────────────
  /** @param {number|null} noteId */
  getTopics: (noteId = null) =>
    req('GET', noteId != null ? `/topics?note_id=${noteId}` : '/topics'),

  // ── Quiz ────────────────────────────────────────────────────────────────────
  /**
   * @param {{ note_id: number, num_questions: number, difficulty?: number, question_types: string[] }} data
   * @returns {Promise<Array>}
   */
  generateQuiz: (data) => req('POST', '/quiz/generate', data),

  /**
   * @param {{ question_id: number, user_answer: string, time_taken_seconds?: number }} data
   * @returns {Promise<{ is_correct: boolean, correct_answer: string, explanation: string|null, attempt_id: number }>}
   */
  submitAnswer: (data) => req('POST', '/quiz/submit', data),

  startSession: () => req('POST', '/quiz/session/start'),
  endSession: (id) => req('POST', `/quiz/session/${id}/end`),

  // ── Stats ───────────────────────────────────────────────────────────────────
  /**
   * @returns {Promise<{ total_notes, total_questions, total_attempts, overall_accuracy, topic_accuracies }>}
   */
  getOverviewStats: () => req('GET', '/quiz/stats/overview'),

  /**
   * @returns {Promise<Array<{ topic_id, topic_name, total_attempts, correct_attempts, accuracy }>>}
   */
  getTopicStats: () => req('GET', '/quiz/stats/topics'),

  /**
   * @returns {Promise<Array<{ topic_id, topic_name, note_id, total_attempts, accuracy, recency_weight, frequency_factor, gap_score }>>}
   */
  getGaps: () => req('GET', '/quiz/gaps'),

  /**
   * @param {{ note_id: number, count: number }} data
   * @returns {Promise<Array>}
   */
  generateAdaptiveQuiz: (data) => req('POST', '/quiz/generate-adaptive', data),

  // ── Chat ────────────────────────────────────────────────────────────────────
  /**
   * @param {{ message: string, session_id?: string, note_id?: number, question_id?: number }} data
   * @returns {Promise<{ session_id: string, response: string, role: string }>}
   */
  chatSend: (data) => req('POST', '/chat/send', data),

  /**
   * @param {string} sessionId
   * @returns {Promise<Array<{ id, role, content, session_id, created_at }>>}
   */
  chatHistory: (sessionId) => req('GET', `/chat/history/${sessionId}`),

  /**
   * @returns {Promise<Array<{ session_id, preview, started_at, message_count, last_activity }>>}
   */
  chatSessions: () => req('GET', '/chat/sessions'),

  /**
   * Triggers background insight generation for a session.
   * @param {string} sessionId
   */
  endChatSession: (sessionId) => req('POST', `/chat/sessions/${sessionId}/end`),

  // ── Canvas ──────────────────────────────────────────────────────────────────
  /** @returns {Promise<{ connected: boolean, courses_visible?: number, reason?: string }>} */
  canvasStatus: () => req('GET', '/canvas/status'),

  /** @returns {Promise<Array<{ id, name, code }>>} */
  canvasCourses: () => req('GET', '/canvas/courses'),

  /** @param {number} courseId */
  canvasAssignments: (courseId) => req('GET', `/canvas/courses/${courseId}/assignments`),

  /** @param {number} days */
  canvasUpcoming: (days = 14) => req('GET', `/canvas/upcoming?days=${days}`),

  /**
   * Import one assignment as a note.
   * @param {number} assignmentId
   * @param {number} courseId
   */
  canvasImport: (assignmentId, courseId) =>
    req('POST', `/canvas/import/${assignmentId}?course_id=${courseId}`),

  /** Bulk sync all courses */
  canvasSync: () => req('POST', '/canvas/sync'),

  /** @param {{ canvas_url: string, canvas_token: string }} data */
  canvasSaveSettings: (data) => req('POST', '/canvas/settings', data),

  // ── Vision Board ─────────────────────────────────────────────────────────────
  /** @returns {Promise<Array>} list of VisionBoardSummary */
  visionBoards: () => req('GET', '/vision/boards'),

  /** @param {number} id @returns {Promise} VisionBoardDetail with nested steps */
  visionBoard: (id) => req('GET', `/vision/boards/${id}`),

  /**
   * @param {{ title?: string, description?: string, canvas_assignment_id?: number, canvas_course_id?: number }} data
   * @returns {Promise} VisionBoardDetail
   */
  visionCreate: (data) => req('POST', '/vision/create', data),

  /**
   * @param {number} stepId
   * @param {{ title?: string, description?: string, is_completed?: boolean, estimated_minutes?: number }} data
   */
  visionUpdateStep: (stepId, data) => req('PUT', `/vision/steps/${stepId}`, data),

  /**
   * @param {number} boardId
   * @param {{ title: string, description?: string, parent_step_id?: number, order_index?: number, estimated_minutes?: number }} data
   */
  visionAddStep: (boardId, data) => req('POST', `/vision/boards/${boardId}/add-step`, data),

  /** @param {number} stepId */
  visionDeleteStep: (stepId) => req('DELETE', `/vision/steps/${stepId}`),

  /**
   * @param {number} stepId
   * @param {string} question
   * @returns {Promise<{ step_id: number, question: string, answer: string }>}
   */
  visionAskStep: (stepId, question) => req('POST', `/vision/steps/${stepId}/ask`, { question }),

  /** @param {number} boardId @param {number[]} stepIds */
  visionReorder: (boardId, stepIds) => req('PUT', `/vision/boards/${boardId}/reorder`, { step_ids: stepIds }),
}
