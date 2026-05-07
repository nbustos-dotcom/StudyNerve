import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import MarkdownRenderer from '../components/MarkdownRenderer'
import NeuralNetIcon from '../components/NeuralNetIcon'
import Spinner from '../components/Spinner'

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

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function scoreColor(pct) {
  return pct >= 70 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-red-400'
}

function timeColor(secs) {
  if (secs == null) return 'text-slate-600'
  if (secs < 20) return 'text-emerald-400'
  if (secs < 60) return 'text-amber-400'
  return 'text-red-400'
}

// ── Main component ────────────────────────────────────────────────────────────

const PHASES = { CONFIGURE: 'configure', GENERATING: 'generating', ACTIVE: 'active', SUMMARY: 'summary', REVIEW: 'review' }
const QUIZ_STORAGE_KEY = 'studynerve_quiz_progress'

export default function Quiz() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState(PHASES.CONFIGURE)
  const [notes, setNotes] = useState([])
  const [mode, setMode] = useState('standard') // 'standard' | 'adaptive'
  const [config, setConfig] = useState({
    note_id: '',
    num_questions: 10,
    question_types: [],
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
  const [savedProgress, setSavedProgress] = useState(null)

  // History state
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [reviewItem, setReviewItem] = useState(null)

  // Flag state for current quiz results
  const [lastQuizId, setLastQuizId] = useState(null)
  const [flaggedQuestions, setFlaggedQuestions] = useState(new Set())
  const [flagging, setFlagging] = useState(null)
  const [streak, setStreak] = useState(0)

  useEffect(() => {
    api.getNotes().then(setNotes).catch(console.error)
    api.getQuizHistory()
      .then(setHistory)
      .catch(console.error)
      .finally(() => setHistoryLoading(false))
    try {
      const saved = localStorage.getItem(QUIZ_STORAGE_KEY)
      if (saved) setSavedProgress(JSON.parse(saved))
    } catch {}
  }, [])

  useEffect(() => {
    if (phase === PHASES.ACTIVE && questions.length > 0) {
      localStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify({ questions, currentIdx, results, sessionId }))
    }
  }, [phase, currentIdx, results, questions, sessionId])

  // Keyboard shortcuts during active quiz
  useEffect(() => {
    if (phase !== PHASES.ACTIVE) return
    function onKey(e) {
      const question = questions[currentIdx]
      if (!question) return
      const isMcq = question.type === 'mcq'
      const isAnswered = currentResult !== null
      const opts = parseOptions(question.options)

      if (isAnswered) {
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          handleNext()
        }
        return
      }
      if (submitting) return

      if (isMcq && opts) {
        const optKeys = Object.keys(opts)
        const map = { a: 0, b: 1, c: 2, d: 3, '1': 0, '2': 1, '3': 2, '4': 3 }
        const idx = map[e.key.toLowerCase()] ?? map[e.key]
        if (idx != null && idx < optKeys.length) {
          e.preventDefault()
          const key = optKeys[idx]
          setSelectedAnswer(key)
          submitAnswer(key)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, questions, currentIdx, currentResult, submitting, results]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleType(type) {
    setGenerateError(null)
    setConfig((c) => {
      const has = c.question_types.includes(type)
      return {
        ...c,
        question_types: has
          ? c.question_types.filter((t) => t !== type)
          : [...c.question_types, type],
      }
    })
  }

  function handleResume() {
    if (!savedProgress) return
    setQuestions(savedProgress.questions)
    setCurrentIdx(savedProgress.currentIdx)
    setResults(savedProgress.results)
    setSessionId(savedProgress.sessionId)
    setSelectedAnswer('')
    setShortAnswer('')
    setCurrentResult(null)
    questionStartTime.current = Date.now()
    setSavedProgress(null)
    setPhase(PHASES.ACTIVE)
  }

  function dismissResume() {
    localStorage.removeItem(QUIZ_STORAGE_KEY)
    setSavedProgress(null)
  }

  async function handleGenerate() {
    if (!config.note_id) return
    if (mode === 'standard' && config.question_types.length === 0) {
      setGenerateError('Pick a question type first.')
      return
    }
    setGenerateError(null)
    setPhase(PHASES.GENERATING)

    try {
      const quizPromise = mode === 'adaptive'
        ? api.generateAdaptiveQuiz({ note_id: Number(config.note_id), count: config.num_questions })
        : api.generateQuiz({
            note_id: Number(config.note_id),
            num_questions: config.num_questions,
            question_types: config.question_types,
          })

      const [qs, session] = await Promise.all([quizPromise, api.startSession()])

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
      setResults((prev) => [...prev, { question: questions[currentIdx], result, answer, timeTaken }])
      setStreak((prev) => (result.is_correct ? prev + 1 : 0))
    } catch (e) {
      console.error('Submit failed:', e)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleFlagQuestion(questionIndex) {
    if (!lastQuizId || flagging !== null) return
    const willFlag = !flaggedQuestions.has(questionIndex)
    setFlagging(questionIndex)
    try {
      await api.flagQuizQuestion(lastQuizId, questionIndex, willFlag)
      setFlaggedQuestions((prev) => {
        const next = new Set(prev)
        if (willFlag) next.add(questionIndex)
        else next.delete(questionIndex)
        return next
      })
    } catch (e) {
      console.error('Failed to flag question:', e)
    } finally {
      setFlagging(null)
    }
  }

  async function handleNext(finalResults) {
    // finalResults is passed explicitly to avoid stale closure on the last question
    const allResults = finalResults ?? results
    const isLast = currentIdx === questions.length - 1
    if (isLast) {
      localStorage.removeItem(QUIZ_STORAGE_KEY)
      setSavedProgress(null)

      // Save history before ending session
      try {
        const noteId = questions[0]?.note_id
        const noteObj = notes.find((n) => n.id === noteId)
        const saved = await api.saveQuizHistory({
          note_id: noteId || null,
          note_title: noteObj?.title || 'Unknown Note',
          score: allResults.filter((r) => r.result.is_correct).length,
          total_questions: allResults.length,
          questions: allResults.map(({ question, result, answer }) => ({
            question_id: question.id,
            content: question.content,
            type: question.type,
            options: question.options || null,
            user_answer: answer,
            correct_answer: result.correct_answer,
            is_correct: result.is_correct,
            explanation: result.explanation || null,
            is_flagged: false,
          })),
        })
        setHistory((prev) => [saved, ...prev])
        setLastQuizId(saved.id)
        setFlaggedQuestions(new Set())
      } catch (e) {
        console.error('Failed to save quiz history:', e)
      }

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
    localStorage.removeItem(QUIZ_STORAGE_KEY)
    setSavedProgress(null)
    setPhase(PHASES.CONFIGURE)
    setQuestions([])
    setResults([])
    setCurrentIdx(0)
    setCurrentResult(null)
    setSelectedAnswer('')
    setShortAnswer('')
    setSessionId(null)
    setGenerateError(null)
    setLastQuizId(null)
    setFlaggedQuestions(new Set())
    setFlagging(null)
    setStreak(0)
  }

  async function practiceWeakTopic(noteId) {
    localStorage.removeItem(QUIZ_STORAGE_KEY)
    setSavedProgress(null)
    setQuestions([])
    setResults([])
    setCurrentIdx(0)
    setCurrentResult(null)
    setSelectedAnswer('')
    setShortAnswer('')
    setSessionId(null)
    setGenerateError(null)
    setLastQuizId(null)
    setFlaggedQuestions(new Set())
    setFlagging(null)
    setStreak(0)
    setConfig({ note_id: String(noteId), num_questions: 10, question_types: [] })
    setMode('adaptive')
    setPhase(PHASES.GENERATING)
    try {
      const [qs, session] = await Promise.all([
        api.generateAdaptiveQuiz({ note_id: noteId, count: 10 }),
        api.startSession(),
      ])
      if (!qs || qs.length === 0) throw new Error('No questions generated')
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

  function openReview(item) {
    setReviewItem(item)
    setPhase(PHASES.REVIEW)
  }

  async function handleOpenReview(summary) {
    try {
      const detail = await api.getQuizHistoryDetail(summary.id)
      openReview(detail)
    } catch (e) {
      console.error('Failed to load quiz detail:', e)
    }
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
      mode={mode}
      setMode={setMode}
      savedProgress={savedProgress}
      onResume={handleResume}
      onDismissResume={dismissResume}
      history={history}
      historyLoading={historyLoading}
      onOpenReview={handleOpenReview}
    />
  }

  if (phase === PHASES.GENERATING) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center px-8 fade-in-up">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6" style={{ background: 'rgba(var(--indigo-500-rgb),0.1)', border: '1px solid rgba(var(--indigo-500-rgb),0.2)' }}>
          <Spinner size="lg" />
        </div>
        <p className="text-slate-200 font-semibold text-lg">Generating questions…</p>
        <p className="text-slate-500 text-sm mt-2">This can take 10–30 seconds with Ollama</p>
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
      <div className="p-4 sm:p-8 max-w-2xl mx-auto fade-in-up">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex justify-between text-xs text-slate-500 mb-2">
            <span>Question {currentIdx + 1} of {questions.length}</span>
            <div className="flex items-center gap-3">
              {streak >= 2 && (
                <span className="text-amber-400 font-medium">🔥 {streak}</span>
              )}
              <span className="capitalize text-slate-600">{question.type.replace('_', ' ')} · difficulty {question.difficulty}/5</span>
            </div>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${((currentIdx + (isAnswered ? 1 : 0)) / questions.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Question */}
        <div className="card-solid p-7 mb-6" style={{ boxShadow: '0 4px 32px rgba(0,0,0,0.3)' }}>
          <div className="text-base leading-relaxed">
            <MarkdownRenderer>{question.content}</MarkdownRenderer>
          </div>
        </div>

        {/* MCQ Options */}
        {isMcq && options && (
          <div className="space-y-3 mb-5">
            {Object.entries(options).map(([key, value]) => (
              <button
                key={key}
                disabled={isAnswered || submitting}
                onClick={() => {
                  setSelectedAnswer(key)
                  submitAnswer(key)
                }}
                className={`w-full text-left flex items-start gap-4 px-5 py-4 min-h-[60px] rounded-xl border transition-all duration-200 ${optionStyle(
                  key, selectedAnswer, currentResult
                )}`}
                style={selectedAnswer === key && !currentResult ? { boxShadow: '0 0 0 2px rgba(var(--indigo-500-rgb),0.5)' } : {}}
              >
                <span className="font-mono font-bold text-sm flex-shrink-0 mt-0.5 w-5">{key}.</span>
                <span className="text-sm leading-relaxed">{value}</span>
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
              placeholder="Type your answer… (Enter to submit)"
              value={shortAnswer}
              onChange={(e) => setShortAnswer(e.target.value)}
              disabled={isAnswered}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !isAnswered && !submitting && shortAnswer.trim()) {
                  e.preventDefault()
                  submitAnswer(shortAnswer)
                }
              }}
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
              <div className="mt-1">
                <MarkdownRenderer size="sm">{currentResult.explanation}</MarkdownRenderer>
              </div>
            )}
            {!currentResult.is_correct && (
              <button
                className="mt-3 flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                onClick={() =>
                  navigate(
                    `/chat?question_id=${question.id}&q=${encodeURIComponent(question.content)}`
                  )
                }
              >
                <NeuralNetIcon size={14} idPrefix="quiz-ask" />
                Ask Tutor About This
              </button>
            )}
          </div>
        )}

        {/* Next */}
        {isAnswered && (
          <div className="flex justify-end">
            <button
              className="btn-primary"
              onClick={() => handleNext(isLast ? results : undefined)}
            >
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
    const color = scoreColor(pct)

    const slowest = results.reduce((max, r) =>
      (r.timeTaken ?? 0) > (max?.timeTaken ?? 0) ? r : max, null)

    const topicAcc = {}
    results.forEach(({ question, result }) => {
      const key = question.topic_id
      const name = question.topic_name || 'This topic'
      if (!topicAcc[key]) topicAcc[key] = { name, noteId: question.note_id, correct: 0, total: 0 }
      topicAcc[key].total++
      if (result.is_correct) topicAcc[key].correct++
    })
    const weakTopics = Object.values(topicAcc)
      .map((t) => ({ ...t, pct: Math.round((t.correct / t.total) * 100) }))
      .filter((t) => t.pct < 100)
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 2)

    return (
      <div className="p-4 sm:p-8 max-w-2xl mx-auto fade-in-up">
        <div className="text-center mb-10">
          <p className="text-white/30 text-sm mb-2 uppercase tracking-widest font-medium">Quiz Complete</p>
          <p className={`text-6xl font-bold mb-3 ${color}`}>{pct}%</p>
          <p className="text-slate-400 text-sm">{correct} of {total} correct</p>
        </div>

        {slowest?.timeTaken > 20 && (
          <div className="mb-5 px-4 py-3 rounded-xl flex items-center gap-3"
            style={{ background: 'rgba(var(--indigo-500-rgb),0.06)', border: '1px solid rgba(var(--indigo-500-rgb),0.15)' }}>
            <span className="text-base flex-shrink-0">⏱</span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-indigo-300/60 font-medium uppercase tracking-wider">Took longest</p>
              <p className="text-xs text-slate-400 mt-0.5 truncate">{slowest.question.content}</p>
            </div>
            <span className={`flex-shrink-0 text-sm font-semibold tabular-nums ${timeColor(slowest.timeTaken)}`}>{slowest.timeTaken}s</span>
          </div>
        )}

        <div className="space-y-3 mb-8">
          {results.map(({ question, result, answer, timeTaken }, i) => {
            const isFlagged = flaggedQuestions.has(i)
            return (
              <div
                key={i}
                className="card p-4"
                style={{
                  borderLeft: `3px solid ${result.is_correct ? 'rgba(52,211,153,0.6)' : 'rgba(248,113,113,0.6)'}`,
                  animation: `fade-in-up 0.35s ease-out ${i * 40}ms both`,
                }}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${result.is_correct ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                    {result.is_correct ? '✓' : '✗'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-300 leading-snug">{question.content}</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <p className="text-xs text-slate-500">
                        Your answer: <span className="text-slate-400">{answer}</span>
                        {!result.is_correct && (
                          <> · Correct: <span className="text-emerald-400">{result.correct_answer}</span></>
                        )}
                      </p>
                      {timeTaken != null && (
                        <span className={`text-xs tabular-nums ${timeColor(timeTaken)}`}>{timeTaken}s</span>
                      )}
                    </div>
                    {lastQuizId && (
                      <button
                        onClick={() => handleFlagQuestion(i)}
                        disabled={flagging !== null}
                        className={`mt-2 flex items-center gap-1 text-xs transition-colors ${
                          isFlagged
                            ? 'text-amber-400 hover:text-amber-300'
                            : 'text-slate-600 hover:text-slate-400'
                        }`}
                      >
                        <svg className="w-3 h-3" viewBox="0 0 16 16" fill={isFlagged ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
                          <path d="M3 2v12M3 2l9 3-9 3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {isFlagged ? 'Flagged' : 'Report Wrong Answer'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {weakTopics.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-medium text-slate-400 mb-3">What to study next</h2>
            <div className="space-y-2">
              {weakTopics.map((t, i) => (
                <div key={i} className="card-solid p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 font-medium truncate">{t.name}</p>
                    <p className={`text-xs mt-0.5 ${scoreColor(t.pct)}`}>{t.pct}% accuracy</p>
                  </div>
                  <button
                    onClick={() => practiceWeakTopic(t.noteId)}
                    className="btn-primary text-xs px-3 py-1.5 flex-shrink-0"
                  >
                    Practice this →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-center">
          <button className="btn-primary" onClick={handleReset}>Try Another Quiz</button>
        </div>
      </div>
    )
  }

  if (phase === PHASES.REVIEW && reviewItem) {
    return <ReviewView item={reviewItem} onBack={handleReset} />
  }

  return null
}

// ── Review view ───────────────────────────────────────────────────────────────

function ReviewView({ item, onBack }) {
  const pct = Math.round((item.score / item.total_questions) * 100)
  const color = scoreColor(pct)
  const [flagged, setFlagged] = useState(
    () => new Set(item.questions.map((q, i) => (q.is_flagged ? i : -1)).filter((i) => i !== -1))
  )
  const [flagging, setFlagging] = useState(null)

  async function handleFlag(idx) {
    if (flagging !== null) return
    const willFlag = !flagged.has(idx)
    setFlagging(idx)
    try {
      await api.flagQuizQuestion(item.id, idx, willFlag)
      setFlagged((prev) => {
        const next = new Set(prev)
        if (willFlag) next.add(idx)
        else next.delete(idx)
        return next
      })
    } catch (e) {
      console.error('Failed to flag question:', e)
    } finally {
      setFlagging(null)
    }
  }

  return (
    <div className="p-4 sm:p-8 max-w-2xl mx-auto fade-in-up">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-6"
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10 4L6 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to Quiz
      </button>

      <div className="text-center mb-8">
        <p className="text-white/30 text-xs mb-1 uppercase tracking-widest font-medium">{item.note_title}</p>
        <p className={`text-5xl font-bold mb-2 ${color}`}>{pct}%</p>
        <p className="text-slate-400 text-sm">{item.score} of {item.total_questions} correct · {formatDate(item.completed_at)}</p>
      </div>

      <div className="space-y-3">
        {item.questions.map((q, i) => {
          const options = parseOptions(q.options)
          const isFlagged = flagged.has(i)
          return (
            <div
              key={i}
              className="card p-4"
              style={{ borderLeft: `3px solid ${q.is_correct ? 'rgba(52,211,153,0.6)' : 'rgba(248,113,113,0.6)'}` }}
            >
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${q.is_correct ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                  {q.is_correct ? '✓' : '✗'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-300 leading-snug mb-2">{q.content}</p>
                  {options && (
                    <div className="space-y-1 mb-2">
                      {Object.entries(options).map(([key, value]) => {
                        const isCorrect = key === q.correct_answer
                        const isUserWrong = key === q.user_answer && !q.is_correct
                        if (!isCorrect && !isUserWrong) return null
                        return (
                          <div
                            key={key}
                            className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border ${
                              isCorrect
                                ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
                                : 'border-red-500/30 bg-red-500/5 text-red-300'
                            }`}
                          >
                            <span className="font-mono font-bold w-4">{key}.</span>
                            <span>{value}</span>
                            <span className="ml-auto text-xs opacity-70">{isCorrect ? 'correct' : 'your answer'}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {!options && (
                    <p className="text-xs text-slate-500 mb-1">
                      Your answer: <span className={q.is_correct ? 'text-emerald-400' : 'text-red-400'}>{q.user_answer}</span>
                      {!q.is_correct && (
                        <> · Correct: <span className="text-emerald-400">{q.correct_answer}</span></>
                      )}
                    </p>
                  )}
                  {q.explanation && (
                    <p className="text-xs text-slate-500 mt-1 italic">{q.explanation}</p>
                  )}
                  <button
                    onClick={() => handleFlag(i)}
                    disabled={flagging !== null}
                    className={`mt-2 flex items-center gap-1 text-xs transition-colors ${
                      isFlagged
                        ? 'text-amber-400 hover:text-amber-300'
                        : 'text-slate-600 hover:text-slate-400'
                    }`}
                  >
                    <svg className="w-3 h-3" viewBox="0 0 16 16" fill={isFlagged ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
                      <path d="M3 2v12M3 2l9 3-9 3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {isFlagged ? 'Flagged' : 'Report Wrong Answer'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Question count input ──────────────────────────────────────────────────────

function QuestionCountInput({ config, setConfig }) {
  const [raw, setRaw] = useState(String(config.num_questions))

  function commit(value) {
    const n = parseInt(value, 10)
    const clamped = isNaN(n) ? 10 : Math.max(5, Math.min(100, n))
    setRaw(String(clamped))
    setConfig((c) => ({ ...c, num_questions: clamped }))
    return clamped
  }

  const preview = parseInt(raw, 10) || 0

  return (
    <div>
      <label className="label">Number of questions (5–100)</label>
      <input
        type="number"
        className="input"
        min={5}
        max={100}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
      />
      {preview > 20 && (
        <p className="text-xs text-amber-400/70 mt-1.5 flex items-center gap-1.5">
          <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 12 12" fill="currentColor">
            <path d="M6 1a5 5 0 100 10A5 5 0 006 1zm0 2.25a.75.75 0 01.75.75v2.5a.75.75 0 01-1.5 0V4A.75.75 0 016 3.25zm0 6a.875.875 0 110-1.75.875.875 0 010 1.75z"/>
          </svg>
          Large quizzes may take longer to generate.
        </p>
      )}
    </div>
  )
}

// ── Configure view ────────────────────────────────────────────────────────────

function ConfigureView({ notes, config, setConfig, toggleType, onGenerate, error, mode, setMode, savedProgress, onResume, onDismissResume, history, historyLoading, onOpenReview }) {
  const [tab, setTab] = useState('configure') // 'configure' | 'history'
  const [topicStats, setTopicStats] = useState(null)
  const [topicLoading, setTopicLoading] = useState(false)
  const [topicSortBy, setTopicSortBy] = useState('accuracy')
  const [topicSortDir, setTopicSortDir] = useState('desc')

  const canGenerate = !!config.note_id

  function switchToHistory() {
    setTab('history')
    if (topicStats === null) {
      setTopicLoading(true)
      api.getTopicStats()
        .then(setTopicStats)
        .catch(() => setTopicStats([]))
        .finally(() => setTopicLoading(false))
    }
  }

  function handleTopicSort(col) {
    if (topicSortBy === col) setTopicSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setTopicSortBy(col); setTopicSortDir('desc') }
  }

  const sortedTopics = topicStats
    ? [...topicStats].sort((a, b) => {
        let av, bv
        if (topicSortBy === 'accuracy') { av = a.accuracy; bv = b.accuracy }
        else if (topicSortBy === 'attempts') { av = a.total_attempts; bv = b.total_attempts }
        else { av = a.topic_name.toLowerCase(); bv = b.topic_name.toLowerCase() }
        if (av < bv) return topicSortDir === 'asc' ? -1 : 1
        if (av > bv) return topicSortDir === 'asc' ? 1 : -1
        return 0
      })
    : []

  return (
    <div className="p-4 sm:p-8 max-w-xl mx-auto fade-in-up">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-100">Quiz</h1>
        <p className="text-sm text-slate-500 mt-1">Generate questions from your notes with AI</p>
      </div>

      {/* Top-level tab bar */}
      <div className="pill-tabs mb-6">
        <button onClick={() => setTab('configure')} className={`pill-tab${tab === 'configure' ? ' active' : ''}`}>
          Configure
        </button>
        <button onClick={switchToHistory} className={`pill-tab${tab === 'history' ? ' active' : ''}`}>
          History
        </button>
      </div>

      {/* ── History tab ─────────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <div className="fade-in-up">
          {/* Per-topic accuracy table */}
          {topicLoading && <div className="flex justify-center py-10"><Spinner /></div>}

          {!topicLoading && topicStats !== null && topicStats.length === 0 && (
            <div className="card p-10 flex flex-col items-center gap-3 text-center mb-8">
              <svg className="w-8 h-8 text-white/10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
              </svg>
              <p className="text-sm text-white/30">Complete a quiz to see per-topic results here.</p>
            </div>
          )}

          {!topicLoading && sortedTopics.length > 0 && (
            <>
              <h2 className="text-sm font-medium text-slate-300 mb-3">Per-Topic Accuracy</h2>
              <div className="card-solid overflow-hidden mb-8">
                <table className="w-full">
                  <thead className="border-b border-[#1e1e2e]">
                    <tr>
                      <th
                        className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider py-3 px-4 cursor-pointer hover:text-slate-300 select-none transition-colors"
                        onClick={() => handleTopicSort('name')}
                      >
                        Topic{' '}
                        {topicSortBy !== 'name' ? <span className="text-slate-600">↕</span> : <span className="text-indigo-400">{topicSortDir === 'asc' ? '↑' : '↓'}</span>}
                      </th>
                      <th
                        className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider py-3 px-4 cursor-pointer hover:text-slate-300 select-none transition-colors"
                        onClick={() => handleTopicSort('attempts')}
                      >
                        Attempts{' '}
                        {topicSortBy !== 'attempts' ? <span className="text-slate-600">↕</span> : <span className="text-indigo-400">{topicSortDir === 'asc' ? '↑' : '↓'}</span>}
                      </th>
                      <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider py-3 px-4">Correct</th>
                      <th
                        className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider py-3 px-4 min-w-[140px] cursor-pointer hover:text-slate-300 select-none transition-colors"
                        onClick={() => handleTopicSort('accuracy')}
                      >
                        Accuracy{' '}
                        {topicSortBy !== 'accuracy' ? <span className="text-slate-600">↕</span> : <span className="text-indigo-400">{topicSortDir === 'asc' ? '↑' : '↓'}</span>}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e1e2e]">
                    {sortedTopics.map((t) => {
                      const pct = Math.round(t.accuracy * 100)
                      const barColor = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'
                      const textColor = pct >= 70 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-red-400'
                      return (
                        <tr key={t.topic_id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-3 px-4 text-sm text-slate-200">{t.topic_name}</td>
                          <td className="py-3 px-4 text-right text-sm text-slate-400 tabular-nums">{t.total_attempts}</td>
                          <td className="py-3 px-4 text-right text-sm text-slate-400 tabular-nums">{t.correct_attempts}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full bar-animate ${barColor}`} style={{ width: `${pct}%` }} />
                              </div>
                              <span className={`text-xs font-medium tabular-nums w-8 text-right ${textColor}`}>{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div className="px-4 py-3 border-t border-[#1e1e2e] flex justify-between text-xs text-slate-600">
                  <span>{topicStats.length} topic{topicStats.length !== 1 ? 's' : ''}</span>
                  <span>
                    {topicStats.reduce((s, t) => s + t.total_attempts, 0)} total attempts ·{' '}
                    {topicStats.reduce((s, t) => s + t.correct_attempts, 0)} correct
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Past individual quizzes */}
          <h2 className="text-sm font-medium text-slate-400 mb-3">Past Quizzes</h2>
          {historyLoading ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : history.length === 0 ? (
            <p className="text-xs text-slate-600 text-center py-4">No completed quizzes yet — finish one to see it here.</p>
          ) : (
            <div className="space-y-2">
              {history.map((item) => {
                const pct = Math.round((item.score / item.total_questions) * 100)
                const color = scoreColor(pct)
                return (
                  <button
                    key={item.id}
                    onClick={() => onOpenReview(item)}
                    className="w-full text-left card-solid p-4 flex items-center gap-4 hover:border-white/20 transition-colors group"
                  >
                    <div className={`text-2xl font-bold tabular-nums w-14 flex-shrink-0 ${color}`}>{pct}%</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 truncate">{item.note_title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{item.score}/{item.total_questions} correct · {formatDate(item.completed_at)}</p>
                    </div>
                    <span className="text-xs text-indigo-400 group-hover:text-indigo-300 transition-colors flex-shrink-0 font-medium">Review</span>
                    <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Configure tab ───────────────────────────────────────────────────── */}
      {tab === 'configure' && (
        <>
          {/* Resume banner */}
          {savedProgress && (
            <div className="mb-5 flex items-center gap-3 px-4 py-3 rounded-xl border border-indigo-500/30 bg-indigo-500/8">
              <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a7 7 0 100 14A7 7 0 008 1zM6.5 5.5l4 2.5-4 2.5V5.5z"/>
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-200 font-medium">In-progress quiz found</p>
                <p className="text-xs text-slate-500">Question {savedProgress.currentIdx + 1} of {savedProgress.questions.length}</p>
              </div>
              <button className="btn-primary text-xs px-3 py-1.5" onClick={onResume}>Resume</button>
              <button className="text-slate-600 hover:text-slate-400 transition-colors ml-1" onClick={onDismissResume} title="Discard">
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          )}

          {/* Mode toggle */}
          <div className="pill-tabs mb-4">
            {[
              { id: 'standard', label: 'Standard Quiz' },
              { id: 'adaptive', label: 'Adaptive Quiz' },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                className={`pill-tab${mode === id ? ' active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'adaptive' && (
            <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 4zm0 8a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
              <p className="text-xs text-amber-400/80">
                Focuses on your weakest topics based on past performance. Falls back to standard if no attempt history exists.
              </p>
            </div>
          )}

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
                <p className="text-xs text-white/30 mt-1.5">No notes yet — add one on the Notes page first.</p>
              )}
            </div>

            <QuestionCountInput config={config} setConfig={setConfig} />

            {mode === 'standard' && (
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
            )}

            {error && (
              <div className="text-sm text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button className="btn-primary w-full py-2.5" disabled={!canGenerate} onClick={onGenerate}>
              {mode === 'adaptive' ? 'Generate Adaptive Quiz' : 'Generate Quiz'}
            </button>
          </div>

        </>
      )}
    </div>
  )
}
