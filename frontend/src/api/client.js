const BASE = '/api'

async function req(method, path, body) {
  const opts = {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }

  const res = await fetch(`${BASE}${path}`, opts)

  if (res.status === 204) return null

  let data
  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (!res.ok) {
    const detail = data?.detail || `HTTP ${res.status}`
    throw new Error(Array.isArray(detail) ? detail[0]?.msg ?? String(detail) : String(detail))
  }

  return data
}

export const api = {
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
}
