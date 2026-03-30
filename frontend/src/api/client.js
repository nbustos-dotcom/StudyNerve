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
}
