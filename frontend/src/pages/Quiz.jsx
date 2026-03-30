import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'

// ── Helpers ───────────────────────────────────────────────────────────────────

function Spinner({ size = 'md' }) {
  const cls = size === 'lg' ? 'w-10 h-10' : size === 'sm' ? 'w-4 h-4' : 'w-6 h-6'
  return (
    <svg className={`animate-spin ${cls} text-indigo-400`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

function parseOptions(optionsStr) {
  if (!optionsStr) return null
  try {
    return JSON.parse(optionsStr)
  } catch {
    return null
  }
}

function optionStyle(key, selectedAnswer, result) {
  if (!result) {
    return selectedAnswer === key
      ? 'bg-indigo-500/15 border-indigo-500/60 text-indigo-200'
      : 'border-[#1e1e2e] hover:border-slate-500 hover:bg-white/5 text-slate-300'
  }
  if (key === result.correct_answer)
    return 'bg-emerald-500/10 border-emerald-500/60 text-emerald-300'
  if (key === selectedAnswer && !result.is_correct)
    return 'bg-red-500/10 border-red-500/50 text-red-300'
  return 'border-[#1e1e2e] text-slate-600 opacity-40'
}

// ── Main component ────────────────────────────────────────────────────────────

const PHASES = { CONFIGURE: 'configure', GENERATING: 'generating', ACTIVE: 'active', SUMMARY: 'summary' }

export default function Quiz() {
  const [phase, setPhase] = useState(PHASES.CONFIGURE)
  const [notes, setNotes] = useState([])
  const [config, setConfig] = useState({
    note_id: '',
    num_questions: 5,
    question_types: ['mcq', 'short_answer'],
  })
  const [generateError, setGenerateError] = useState(null)

  // Active quiz state
  const [questions, setQuestions] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState('')
  const [shortAnswer, setShortAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [currentResult, setCurrentResult] = useState(null) // AnswerResult
  const [results, setResults] = useState([]) // all AnswerResults
  const [sessionId, setSessionId] = useState(null)
  const questionStartTime = useRef(null)

  useEffect(() => {
    api.getNotes().then(setNotes).catch(console.error)
  }, [])

  function toggleType(type) {
    setConfig((c) => {
      const has = c.question_types.includes(type)
      if (has && c.question_types.length === 1) return c // keep at least one
      return {
        ...c,
        question_types: has
          ? c.question_types.filter((t) => t !== type)
          : [...c.question_types, type],
      }
    })
  }

  async function handleGenerate() {
    if (!config.note_id) return
    setGenerateError(null)
    setPhase(PHASES.GENERATING)

    try {
      const [qs, session] = await Promise.all([
        api.generateQuiz({
          note_id: Number(config.note_id),
          num_questions: config.num_questions,
          question_types: config.question_types,
        }),
        api.startSession(),
      ])

      if (!qs || qs.length === 0) throw new Error('No questions were generated')

      setQuestions(qs)
      setSessionId(session.id)
      setCurrentIdx(0)
      setResults([])
      setCurrentResult(null)
      setSelectedAnswer('')
      setShortAnswer('')
      questionStartTime.current = Date.now()
      setPhase(PHASES.ACTIVE)
    } catch (e) {
      setGenerateError(e.message)
      setPhase(PHASES.CONFIGURE)
    }
  }

  async function submitAnswer(answer) {
    if (submitting || !answer.trim()) return
    setSubmitting(true)
    const timeTaken = questionStartTime.current
      ? Math.round((Date.now() - questionStartTime.current) / 1000)
      : null

    try {
      const result = await api.submitAnswer({
        question_id: questions[currentIdx].id,
        user_answer: answer.trim(),
        time_taken_seconds: timeTaken,
      })
      setCurrentResult(result)
      setResults((prev) => [...prev, { question: questions[currentIdx], result, answer }])
    } catch (e) {
      console.error('Submit failed:', e)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleNext() {
    const isLast = currentIdx === questions.length - 1
    if (isLast) {
      // End session
      if (sessionId) {
        try { await api.endSession(sessionId) } catch {}
      }
      setPhase(PHASES.SUMMARY)
    } else {
      setCurrentIdx((i) => i + 1)
      setSelectedAnswer('')
      setShortAnswer('')
      setCurrentResult(null)
      questionStartTime.current = Date.now()
    }
  }

  function handleReset() {
    setPhase(PHASES.CONFIGURE)
    setQuestions([])
    setResults([])
    setCurrentIdx(0)
    setCurrentResult(null)
    setSelectedAnswer('')
    setShortAnswer('')
    setSessionId(null)
    setGenerateError(null)
  }

  // ── Render phases ──────────────────────────────────────────────────────────

  if (phase === PHASES.CONFIGURE) {
    return <ConfigureView
      notes={notes}
      config={config}
      setConfig={setConfig}
      toggleType={toggleType}
      onGenerate={handleGenerate}
      error={generateError}
    />
  }

  if (phase === PHASES.GENERATING) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center px-8">
        <Spinner size="lg" />
        <p className="text-slate-200 font-medium mt-5">Generating questions…</p>
        <p className="text-slate-500 text-sm mt-1">This can take 10–30 seconds with Ollama</p>
      </div>
    )
  }

  if (phase === PHASES.ACTIVE) {
    const question = questions[currentIdx]
    const options = parseOptions(question.options)
    const isAnswered = currentResult !== null
    const isLast = currentIdx === questions.length - 1
    const isMcq = question.type === 'mcq'

    return (
      <div className="p-8 max-w-2xl mx-auto">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex justify-between text-xs text-slate-500 mb-2">
            <span>Question {currentIdx + 1} of {questions.length}</span>
            <span className="capitalize text-slate-600">{question.type.replace('_', ' ')} · difficulty {question.difficulty}/5</span>
          </div>
          <div className="h-1 bg-[#1e1e2e] rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all"
              style={{ width: `${((currentIdx + (isAnswered ? 1 : 0)) / questions.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Question */}
        <div className="card p-6 mb-5">
          <p className="text-slate-100 text-base leading-relaxed">{question.content}</p>
        </div>

        {/* MCQ Options */}
        {isMcq && options && (
          <div className="space-y-2 mb-5">
            {Object.entries(options).map(([key, value]) => (
              <button
                key={key}
                disabled={isAnswered || submitting}
                onClick={() => {
                  setSelectedAnswer(key)
                  submitAnswer(key)
                }}
                className={`w-full text-left flex items-start gap-3 px-4 py-3 rounded-xl border text-sm transition-colors ${optionStyle(
                  key, selectedAnswer, currentResult
                )}`}
              >
                <span className="font-mono font-semibold flex-shrink-0 mt-0.5">{key}.</span>
                <span>{value}</span>
              </button>
            ))}
          </div>
        )}

        {/* Short answer */}
        {!isMcq && (
          <div className="mb-5">
            <textarea
              className="input resize-none"
              rows={4}
              placeholder="Type your answer…"
              value={shortAnswer}
              onChange={(e) => setShortAnswer(e.target.value)}
              disabled={isAnswered}
            />
            {!isAnswered && (
              <div className="flex justify-end mt-2">
                <button
                  className="btn-primary"
                  disabled={!shortAnswer.trim() || submitting}
                  onClick={() => submitAnswer(shortAnswer)}
                >
                  {submitting ? <span className="flex items-center gap-2"><Spinner size="sm" /> Evaluating…</span> : 'Submit Answer'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Feedback */}
        {isAnswered && (
          <div className={`card p-4 mb-5 border ${
            currentResult.is_correct ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {currentResult.is_correct ? (
                <>
                  <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 8l4 4 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-sm font-medium text-emerald-400">Correct</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 text-red-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                  </svg>
                  <span className="text-sm font-medium text-red-400">Incorrect</span>
                  <span className="text-xs text-slate-500 ml-1">
                    · correct answer: <span className="text-slate-300">{currentResult.correct_answer}</span>
                  </span>
                </>
              )}
            </div>
            {currentResult.explanation && (
              <p className="text-xs text-slate-400 leading-relaxed">{currentResult.explanation}</p>
            )}
          </div>
        )}

        {/* Next */}
        {isAnswered && (
          <div className="flex justify-end">
            <button className="btn-primary" onClick={handleNext}>
              {isLast ? 'Finish Quiz' : 'Next Question →'}
            </button>
          </div>
        )}
      </div>
    )
  }

  if (phase === PHASES.SUMMARY) {
    const correct = results.filter((r) => r.result.is_correct).length
    const total = results.length
    const pct = Math.round((correct / total) * 100)
    const scoreColor = pct >= 70 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-red-400'

    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-slate-500 text-sm mb-1">Quiz complete</p>
          <p className={`text-5xl font-bold mb-2 ${scoreColor}`}>{pct}%</p>
          <p className="text-slate-400 text-sm">{correct} of {total} correct</p>
        </div>

        <div className="space-y-3 mb-8">
          {results.map(({ question, result, answer }, i) => (
            <div key={i} className={`card p-4 border ${result.is_correct ? 'border-emerald-500/20' : 'border-red-500/20'}`}>
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 flex-shrink-0 ${result.is_correct ? 'text-emerald-400' : 'text-red-400'}`}>
                  {result.is_correct ? '✓' : '✗'}
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-slate-300 leading-snug">{question.content}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Your answer: <span className="text-slate-400">{answer}</span>
                    {!result.is_correct && (
                      <> · Correct: <span className="text-emerald-400">{result.correct_answer}</span></>
                    )}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-center">
          <button className="btn-primary" onClick={handleReset}>Try Another Quiz</button>
        </div>
      </div>
    )
  }

  return null
}

// ── Configure view ────────────────────────────────────────────────────────────

function ConfigureView({ notes, config, setConfig, toggleType, onGenerate, error }) {
  const canGenerate = config.note_id && config.question_types.length > 0

  return (
    <div className="p-8 max-w-xl mx-auto">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-slate-100">Quiz</h1>
        <p className="text-sm text-slate-500 mt-1">Generate questions from your notes with AI</p>
      </div>

      <div className="card p-6 space-y-6">
        <div>
          <label className="label">Note *</label>
          <select
            className="input"
            value={config.note_id}
            onChange={(e) => setConfig((c) => ({ ...c, note_id: e.target.value }))}
          >
            <option value="">Select a note…</option>
            {notes.map((n) => (
              <option key={n.id} value={n.id}>{n.title}{n.subject ? ` — ${n.subject}` : ''}</option>
            ))}
          </select>
          {notes.length === 0 && (
            <p className="text-xs text-slate-500 mt-1.5">No notes yet. Add one on the Notes page first.</p>
          )}
        </div>

        <div>
          <label className="label">Number of questions</label>
          <div className="flex gap-2">
            {[5, 10, 15].map((n) => (
              <button
                key={n}
                onClick={() => setConfig((c) => ({ ...c, num_questions: n }))}
                className={`flex-1 py-2 rounded-lg text-sm border transition-colors ${
                  config.num_questions === n
                    ? 'bg-indigo-500/15 border-indigo-500/50 text-indigo-300'
                    : 'border-[#1e1e2e] text-slate-400 hover:border-slate-500 hover:text-slate-200'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Question types</label>
          <div className="flex gap-2">
            {[
              { id: 'mcq', label: 'Multiple choice' },
              { id: 'short_answer', label: 'Short answer' },
            ].map(({ id, label }) => {
              const active = config.question_types.includes(id)
              return (
                <button
                  key={id}
                  onClick={() => toggleType(id)}
                  className={`flex-1 py-2 rounded-lg text-sm border transition-colors ${
                    active
                      ? 'bg-indigo-500/15 border-indigo-500/50 text-indigo-300'
                      : 'border-[#1e1e2e] text-slate-400 hover:border-slate-500 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button className="btn-primary w-full py-2.5" disabled={!canGenerate} onClick={onGenerate}>
          Generate Quiz
        </button>
      </div>
    </div>
  )
}
