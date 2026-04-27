import { API_BASE_URL } from './config.js'

const BASE = `${API_BASE_URL}/api`

function getToken() {
  return localStorage.getItem('mt_token')
}

async function reqMultipart(method, path, formData) {
  const token = getToken()
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  // Do NOT set Content-Type — browser sets multipart/form-data + boundary automatically

  const url = `${BASE}${path}`
  console.log('[reqMultipart] url:', url)
  console.log('[reqMultipart] form fields:', [...formData.entries()].map(([k, v]) =>
    `${k}=${v instanceof File ? `File(${v.name}, ${v.size}B)` : v}`
  ))

  const res = await fetch(url, { method, headers, body: formData })

  if (res.status === 204) return null
  let data
  try { data = await res.json() } catch { data = null }

  if (res.status === 401) {
    const detail = data?.detail || 'Session expired. Please log in again.'
    const message = Array.isArray(detail) ? detail[0]?.msg ?? String(detail) : String(detail)
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

  /** Permanently delete the authenticated user and all their data. */
  deleteAccount: () => req('DELETE', '/auth/delete-account'),

  /** Erase all AI memory (StudentInsight rows) for the current user. */
  clearAllInsights: () => req('DELETE', '/profile/insights'),

  /** @returns {Promise<StudyUniverseData>} aggregated study history */
  studyUniverse: () => req('GET', '/profile/study-universe'),

  // ── User Settings ────────────────────────────────────────────────────────────
  /** @returns {Promise<{ llm_provider, llm_api_key_set, canvas_url, canvas_connected }>} */
  getSettings: () => req('GET', '/settings'),

  /** @param {{ provider: string, api_key?: string }} data */
  saveProvider: (data) => req('POST', '/settings/provider', data),

  /** @param {{ canvas_url: string, canvas_token: string }} data */
  saveCanvasSettings: (data) => req('POST', '/settings/canvas', data),

  // ── Health ──────────────────────────────────────────────────────────────────
  checkHealth: () => req('GET', '/health'),

  /**
   * Smoke-test every LLM provider. Sends the user's auth token so the backend
   * can test with the user's saved API key instead of env-var defaults.
   * @returns {Promise<{ user_provider, user_key_set, results: Array }>}
   */
  testProviders: () => req('GET', '/test-providers'),

  // ── Notes ───────────────────────────────────────────────────────────────────
  /** @returns {Promise<Array>} */
  getNotes: () => req('GET', '/notes'),

  /** @param {{ title: string, content: string, subject?: string }} data */
  createNote: (data) => req('POST', '/notes', data),

  /**
   * Upload a .txt or .pdf file and create a note from its extracted text.
   * @param {File} file
   * @param {{ title?: string, subject?: string }} opts
   */
  uploadNote: (file, { title, subject } = {}) => {
    const token = localStorage.getItem('mt_token')
    const fd = new FormData()
    fd.append('file', file)
    if (title) fd.append('title', title)
    if (subject) fd.append('subject', subject)
    return fetch(`${BASE}/notes/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    }).then(async (res) => {
      if (res.status === 401) {
        localStorage.removeItem('mt_token')
        localStorage.removeItem('mt_user')
        window.location.href = '/login'
        throw new Error('Session expired.')
      }
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const detail = data?.detail || `HTTP ${res.status}`
        throw new Error(Array.isArray(detail) ? detail[0]?.msg ?? String(detail) : String(detail))
      }
      return data
    })
  },

  deleteNote: (id) => req('DELETE', `/notes/${id}`),

  /** @returns {Promise<{ created: number }>} */
  extractTopics: (id) => req('POST', `/notes/${id}/extract-topics`),

  /** @returns {Promise<{ summary: string }>} */
  summarizeNote: (id) => req('POST', `/notes/${id}/summarize`),

  /** @returns {Promise<{ study_guide: string | null, title: string }>} */
  getNoteStudyGuide: (id) => req('GET', `/notes/${id}/study-guide`),

  /** @returns {Promise<{ study_guide: string, title: string }>} */
  noteStudyGuide: (id) => req('POST', `/notes/${id}/study-guide`),

  /** @param {string} content @returns {Promise<{ study_guide: string, title: string }>} */
  updateNoteStudyGuide: (id, content) => req('PUT', `/notes/${id}/study-guide`, { content }),

  /** @returns {Promise<{ id, title, content, subject, created_at }>} */
  getNote: (id) => req('GET', `/notes/${id}`),

  // ── Flashcards ───────────────────────────────────────────────────────────────
  /** @param {{ note_id: number, count?: number }} data @returns {Promise<Array>} */
  generateFlashcards: (data) => req('POST', '/flashcards/generate', data),

  /** @returns {Promise<Array>} grouped by note */
  getFlashcards: () => req('GET', '/flashcards'),

  /** @returns {Promise<Array>} ordered for study (least reviewed + hardest first) */
  studyFlashcards: () => req('GET', '/flashcards/study'),

  /** @param {number} id @param {{ difficulty: string }} data */
  reviewFlashcard: (id, data) => req('PUT', `/flashcards/${id}/review`, data),

  deleteFlashcard: (id) => req('DELETE', `/flashcards/${id}`),

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

  /** @param {{ note_id, note_title, score, total_questions, questions }} data */
  saveQuizHistory: (data) => req('POST', '/quiz/history', data),

  /** @returns {Promise<Array<{ id, note_id, note_title, score, total_questions, completed_at }>>} */
  getQuizHistory: () => req('GET', '/quiz/history'),

  /** @param {number} id @returns {Promise<{ id, note_title, score, total_questions, completed_at, questions }>} */
  getQuizHistoryDetail: (id) => req('GET', `/quiz/history/${id}`),

  /** @param {number} quizId @param {number} questionIndex @param {boolean} isFlagged */
  flagQuizQuestion: (quizId, questionIndex, isFlagged) =>
    req('PATCH', `/quiz/history/${quizId}/flag-question`, { question_index: questionIndex, is_flagged: isFlagged }),

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
   * @param {{ message: string, session_id?: string, note_id?: number, question_id?: number, file?: File }} data
   * @returns {Promise<{ session_id: string, response: string, role: string, file_name?: string }>}
   */
  chatSend: ({ message, session_id, note_id, question_id, file } = {}) => {
    const fd = new FormData()
    fd.append('message', message)
    if (session_id) fd.append('session_id', session_id)
    if (note_id != null) fd.append('note_id', String(note_id))
    if (question_id != null) fd.append('question_id', String(question_id))
    if (file) fd.append('file', file)
    return reqMultipart('POST', '/chat/send', fd)
  },

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
  deleteChatSession: (sessionId) => req('DELETE', `/chat/sessions/${sessionId}`),

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

  /** @returns {Promise<Array>} list of BoardSummary */
  visionBoards: () => req('GET', '/vision/boards'),

  /** @param {{ title: string }} data @returns {Promise} BoardDetail */
  visionCreate: (data) => req('POST', '/vision/boards', data),

  /** @param {number} id @returns {Promise} BoardDetail with all nodes */
  visionBoard: (id) => req('GET', `/vision/boards/${id}`),

  /** @param {number} id */
  visionDeleteBoard: (id) => req('DELETE', `/vision/boards/${id}`),

  /**
   * @param {number} boardId
   * @param {{ title: string, x?: number, y?: number, parent_step_id?: number, description?: string }} data
   * @returns {Promise} NodeResponse
   */
  visionCreateNode: (boardId, data) => req('POST', `/vision/boards/${boardId}/nodes`, data),

  /**
   * @param {number} nodeId
   * @param {{ title?: string, description?: string, x?: number, y?: number, is_completed?: boolean }} data
   * @returns {Promise} NodeResponse
   */
  visionUpdateNode: (nodeId, data) => req('PUT', `/vision/nodes/${nodeId}`, data),

  /** @param {number} nodeId */
  visionDeleteNode: (nodeId) => req('DELETE', `/vision/nodes/${nodeId}`),

  /**
   * Update just x,y — used for drag moves.
   * @param {number} nodeId @param {number} x @param {number} y
   */
  visionMoveNode: (nodeId, x, y) => req('PUT', `/vision/nodes/${nodeId}/position`, { x, y }),

  /**
   * Connect two nodes (sets parent).
   * @param {number} boardId @param {number} fromId @param {number} toId
   */
  visionConnect: (boardId, fromId, toId) => req('POST', `/vision/boards/${boardId}/connect`, { from_id: fromId, to_id: toId }),

  /**
   * Remove a connection between two nodes.
   * @param {number} boardId @param {number} fromId @param {number} toId
   */
  visionDisconnect: (boardId, fromId, toId) => req('DELETE', `/vision/boards/${boardId}/disconnect`, { from_id: fromId, to_id: toId }),

  /**
   * Generate a full visual mind map from a project description.
   * @param {number} boardId @param {string} description @returns {Promise<AiVisionResponse>}
   */
  visionAiVision: (boardId, description) => req('POST', `/vision/boards/${boardId}/ai-vision`, { description }),

  /** AI: suggest ordering/grouping. @returns {Promise<AiOrganizeResponse>} */
  visionAiOrganize: (boardId) => req('POST', `/vision/boards/${boardId}/ai-organize`),

  /**
   * AI: break a node into sub-tasks.
   * @param {number} boardId @param {number} nodeId @returns {Promise<AiBreakdownResponse>}
   */
  visionAiBreakdown: (boardId, nodeId) => req('POST', `/vision/boards/${boardId}/ai-breakdown`, { node_id: nodeId }),

  /**
   * Tutor Q&A about a node.
   * @param {number} nodeId @param {string} question
   */
  visionAskNode: (nodeId, question) => req('POST', `/vision/nodes/${nodeId}/ask`, { question }),
}
