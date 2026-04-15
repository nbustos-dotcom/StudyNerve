import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'

const FLASHCARD_STORAGE_KEY = 'studynerve_flashcard_progress'

function Spinner({ className = 'w-4 h-4' }) {
  return (
    <svg className={`animate-spin text-indigo-400 ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

// ── Generate View ─────────────────────────────────────────────────────────────

function GenerateView() {
  const [notes, setNotes] = useState([])
  const [selectedNote, setSelectedNote] = useState('')
  const [count, setCount] = useState(10)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [generated, setGenerated] = useState([])

  useEffect(() => {
    api.getNotes().then(setNotes).catch(console.error)
  }, [])

  async function handleGenerate() {
    if (!selectedNote) return
    setGenerating(true)
    setError(null)
    setGenerated([])
    try {
      const cards = await api.generateFlashcards({ note_id: Number(selectedNote), count })
      setGenerated(cards)
    } catch (e) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h2 className="text-sm font-medium text-slate-300 mb-4">Generate Flashcards</h2>
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1">
            <label className="label">Select Note</label>
            <select
              className="input"
              value={selectedNote}
              onChange={(e) => setSelectedNote(e.target.value)}
            >
              <option value="">Choose a note…</option>
              {notes.map((n) => (
                <option key={n.id} value={n.id}>{n.title}</option>
              ))}
            </select>
          </div>
          <div className="w-28">
            <label className="label">Card count</label>
            <input
              type="number"
              className="input"
              min={3}
              max={30}
              value={count}
              onChange={(e) => setCount(Math.max(3, Math.min(30, Number(e.target.value))))}
            />
          </div>
          <button
            className="btn-primary flex-shrink-0"
            onClick={handleGenerate}
            disabled={generating || !selectedNote}
          >
            {generating ? (
              <span className="flex items-center gap-2"><Spinner /> Generating…</span>
            ) : (
              'Generate'
            )}
          </button>
        </div>
        {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
      </div>

      {generated.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 mb-3">{generated.length} cards created — switch to Study to review them.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {generated.map((card) => (
              <div key={card.id} className="card p-4 space-y-2">
                <p className="text-xs font-medium text-indigo-300">{card.front}</p>
                <p className="text-xs text-slate-400 border-t border-[#1e1e2e] pt-2">{card.back}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Study View ────────────────────────────────────────────────────────────────

const DIFFICULTY_CFG = {
  easy:   { label: 'Easy',   color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/30' },
  medium: { label: 'Medium', color: 'bg-amber-500/20  text-amber-300  border-amber-500/30  hover:bg-amber-500/30'  },
  hard:   { label: 'Hard',   color: 'bg-red-500/20    text-red-300    border-red-500/30    hover:bg-red-500/30'    },
}

function StudyView() {
  const [activeDeck, setActiveDeck] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [done, setDone] = useState(false)
  const [skippedOnce, setSkippedOnce] = useState(new Set())
  // Resume prompt state
  const [savedProgress, setSavedProgress] = useState(null)
  // Use refs so keyboard handler always sees latest values without re-registering
  const indexRef = useRef(0)
  const activeDeckRef = useRef([])
  const doneRef = useRef(false)

  useEffect(() => { indexRef.current = index }, [index])
  useEffect(() => { activeDeckRef.current = activeDeck }, [activeDeck])
  useEffect(() => { doneRef.current = done }, [done])

  useEffect(() => {
    // Check for saved progress before loading from API
    try {
      const raw = localStorage.getItem(FLASHCARD_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed.cards?.length > 0) {
          setSavedProgress(parsed)
          setLoading(false)
          return
        }
      }
    } catch {}
    loadCards()
  }, [])

  // Save progress whenever index or deck changes (only during active study)
  useEffect(() => {
    if (!loading && activeDeck.length > 0 && !done) {
      try {
        localStorage.setItem(FLASHCARD_STORAGE_KEY, JSON.stringify({
          cards: activeDeck,
          index,
          skippedOnce: [...skippedOnce],
        }))
      } catch {}
    }
  }, [activeDeck, index, done, loading, skippedOnce])

  useEffect(() => {
    function handleKey(e) {
      if (doneRef.current || loading || activeDeckRef.current.length === 0) return
      if (e.key === 'ArrowLeft') {
        if (indexRef.current > 0) { setIndex(i => i - 1); setFlipped(false) }
      } else if (e.key === 'ArrowRight') {
        const next = indexRef.current + 1
        if (next >= activeDeckRef.current.length) setDone(true)
        else { setIndex(next); setFlipped(false) }
      } else if (e.key === ' ') {
        e.preventDefault()
        setFlipped(f => !f)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [loading])

  async function loadCards() {
    setLoading(true)
    setError(null)
    setSavedProgress(null)
    try {
      const data = await api.studyFlashcards()
      setActiveDeck(data)
      setIndex(0)
      setFlipped(false)
      setDone(false)
      setSkippedOnce(new Set())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleResume() {
    if (!savedProgress) return
    setActiveDeck(savedProgress.cards)
    setIndex(savedProgress.index)
    setSkippedOnce(new Set(savedProgress.skippedOnce || []))
    setFlipped(false)
    setDone(false)
    setSavedProgress(null)
  }

  function handleStartNew() {
    localStorage.removeItem(FLASHCARD_STORAGE_KEY)
    setSavedProgress(null)
    loadCards()
  }

  async function handleDifficulty(difficulty) {
    const card = activeDeck[index]
    setReviewing(true)
    try {
      await api.reviewFlashcard(card.id, { difficulty })
    } catch {}
    setReviewing(false)
    const next = index + 1
    if (next >= activeDeck.length) {
      localStorage.removeItem(FLASHCARD_STORAGE_KEY)
      setDone(true)
    } else { setIndex(next); setFlipped(false) }
  }

  function handlePrev() {
    if (index === 0) return
    setIndex(i => i - 1)
    setFlipped(false)
  }

  function handleNext() {
    const next = index + 1
    if (next >= activeDeck.length) {
      localStorage.removeItem(FLASHCARD_STORAGE_KEY)
      setDone(true)
    } else { setIndex(next); setFlipped(false) }
  }

  function handleSkip() {
    const card = activeDeck[index]
    const alreadySkipped = skippedOnce.has(card.id)
    if (!alreadySkipped) {
      setSkippedOnce(prev => new Set([...prev, card.id]))
      setActiveDeck(prev => [...prev, card])
    }
    const effectiveDeckLength = activeDeck.length + (alreadySkipped ? 0 : 1)
    const next = index + 1
    if (next >= effectiveDeckLength) {
      localStorage.removeItem(FLASHCARD_STORAGE_KEY)
      setDone(true)
    } else { setIndex(next); setFlipped(false) }
  }

  // Resume prompt
  if (savedProgress && !loading) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="card p-8 flex flex-col items-center gap-5 text-center fade-in-up">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <svg className="w-7 h-7 text-indigo-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
          <div>
            <p className="text-slate-200 font-semibold text-base mb-1">Resume study session?</p>
            <p className="text-sm text-slate-500">
              You were on card {savedProgress.index + 1} of {savedProgress.cards.length}
            </p>
          </div>
          <div className="flex gap-3">
            <button className="btn-primary" onClick={handleResume}>Resume</button>
            <button
              className="px-4 py-2 rounded-xl text-sm border border-[#1e1e2e] text-slate-400 hover:border-slate-500 hover:text-slate-200 transition-colors"
              onClick={handleStartNew}
            >
              Start New
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="w-6 h-6" />
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-red-400 text-center py-12">{error}</p>
  }

  if (activeDeck.length === 0) {
    return (
      <div className="card p-10 flex flex-col items-center gap-4 text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}>
          <svg className="w-7 h-7 text-indigo-400/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
          </svg>
        </div>
        <div>
          <p className="text-slate-300 font-medium mb-1">No flashcards yet</p>
          <p className="text-sm text-slate-500">Switch to the Generate tab to create some.</p>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="card p-10 flex flex-col items-center gap-4 text-center fade-in-up">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)' }}>
          <svg className="w-8 h-8 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>
          </svg>
        </div>
        <div>
          <p className="text-slate-200 font-semibold text-lg">Session complete!</p>
          <p className="text-sm text-slate-500 mt-1">You reviewed {activeDeck.length} card{activeDeck.length !== 1 ? 's' : ''}.</p>
        </div>
        <button className="btn-primary" onClick={loadCards}>Study Again</button>
      </div>
    )
  }

  const card = activeDeck[index]
  const progress = Math.round((index / activeDeck.length) * 100)

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-slate-500">
          <span>Card {index + 1} of {activeDeck.length}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1 rounded-full bg-[#1e1e2e] overflow-hidden">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Flip card — click anywhere to toggle front/back */}
      <div style={{ perspective: '1000px', height: '280px' }}>
        <div
          onClick={() => setFlipped(f => !f)}
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            transformStyle: 'preserve-3d',
            transition: 'transform 0.55s cubic-bezier(0.35, 0.9, 0.45, 1), box-shadow 0.55s ease',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            cursor: 'pointer',
            boxShadow: flipped
              ? '0 16px 48px rgba(99,102,241,0.2), 0 4px 16px rgba(0,0,0,0.4)'
              : '0 8px 32px rgba(0,0,0,0.3)',
          }}
        >
          {/* Front */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
            }}
            className="card flex flex-col items-center justify-center p-8 text-center select-none"
          >
            <p className="text-xs text-slate-600 mb-3 uppercase tracking-widest">Question</p>
            <p className="text-base font-medium text-slate-200 leading-relaxed">{card.front}</p>
            <p className="text-xs text-slate-600 mt-6">Click to flip</p>
          </div>

          {/* Back */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              background: 'rgba(99,102,241,0.07)',
              border: '1px solid rgba(99,102,241,0.2)',
              backdropFilter: 'blur(12px)',
              borderRadius: '1rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2rem',
              textAlign: 'center',
            }}
          >
            <p className="text-xs text-indigo-400/70 mb-3 uppercase tracking-widest">Answer</p>
            <p className="text-base text-slate-200 leading-relaxed">{card.back}</p>
          </div>
        </div>
      </div>

      {/* Navigation controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={handlePrev}
          disabled={index === 0}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm border border-[#1e1e2e] text-slate-400 hover:border-slate-500 hover:text-slate-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ← Previous
        </button>
        <button
          onClick={handleSkip}
          className="flex-1 py-2.5 rounded-xl text-sm border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors"
        >
          Skip
        </button>
        <button
          onClick={handleNext}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm border border-[#1e1e2e] text-slate-400 hover:border-slate-500 hover:text-slate-200 transition-colors"
        >
          Next →
        </button>
      </div>

      {/* Rating buttons — only visible after flip, optional */}
      <div
        className="flex gap-3 justify-center transition-all duration-300"
        style={{ opacity: flipped ? 1 : 0, pointerEvents: flipped ? 'auto' : 'none' }}
      >
        {(['easy', 'medium', 'hard']).map((d) => (
          <button
            key={d}
            onClick={() => handleDifficulty(d)}
            disabled={reviewing}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-all duration-200 hover:scale-[1.03] ${DIFFICULTY_CFG[d].color}`}
          >
            {DIFFICULTY_CFG[d].label}
          </button>
        ))}
      </div>

      <p className="text-center text-xs text-slate-600">
        Rate to track progress · or navigate freely · Space to flip · ← → to move
      </p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Flashcards() {
  const [view, setView] = useState('generate') // 'generate' | 'study'

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto fade-in-up">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-slate-100">Flashcards</h1>
        <p className="text-sm text-slate-500 mt-1">AI-generated cards for active recall practice</p>
      </div>

      {/* Tab switcher */}
      <div className="pill-tabs mb-6">
        {[['generate', 'Generate'], ['study', 'Study']].map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => setView(val)}
            className={`pill-tab${view === val ? ' active' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'generate' ? <GenerateView /> : <StudyView key="study" />}
    </div>
  )
}
