import { useEffect, useState } from 'react'
import { api } from '../api/client'

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
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    loadCards()
  }, [])

  async function loadCards() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.studyFlashcards()
      setCards(data)
      setIndex(0)
      setFlipped(false)
      setDone(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDifficulty(difficulty) {
    const card = cards[index]
    setReviewing(true)
    try {
      await api.reviewFlashcard(card.id, { difficulty })
    } catch {
      // non-fatal
    } finally {
      setReviewing(false)
    }
    const next = index + 1
    if (next >= cards.length) {
      setDone(true)
    } else {
      setIndex(next)
      setFlipped(false)
    }
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

  if (cards.length === 0) {
    return (
      <div className="text-center py-20 text-slate-500 text-sm">
        No flashcards yet. Generate some from the Generate tab.
      </div>
    )
  }

  if (done) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-2xl">🎉</p>
        <p className="text-slate-300 font-medium">Session complete!</p>
        <p className="text-sm text-slate-500">You reviewed {cards.length} cards.</p>
        <button className="btn-primary mt-4" onClick={loadCards}>Study Again</button>
      </div>
    )
  }

  const card = cards[index]
  const progress = Math.round((index / cards.length) * 100)

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-slate-500">
          <span>Card {index + 1} of {cards.length}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1 rounded-full bg-[#1e1e2e] overflow-hidden">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Flip card */}
      <div style={{ perspective: '1200px', height: '280px' }}>
        <div
          onClick={() => !flipped && setFlipped(true)}
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            transformStyle: 'preserve-3d',
            transition: 'transform 0.4s ease',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            cursor: flipped ? 'default' : 'pointer',
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
            <p className="text-xs text-slate-600 mt-6">Click to reveal answer</p>
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

      {/* Rating buttons — only visible after flip */}
      <div
        className="flex gap-3 justify-center transition-all duration-300"
        style={{ opacity: flipped ? 1 : 0, pointerEvents: flipped ? 'auto' : 'none' }}
      >
        {(['easy', 'medium', 'hard']).map((d) => (
          <button
            key={d}
            onClick={() => handleDifficulty(d)}
            disabled={reviewing}
            className={`px-5 py-2 rounded-xl text-sm font-medium border transition-colors ${DIFFICULTY_CFG[d].color}`}
          >
            {DIFFICULTY_CFG[d].label}
          </button>
        ))}
      </div>

      <p className="text-center text-xs text-slate-600">Rate how well you knew it to track progress</p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Flashcards() {
  const [view, setView] = useState('generate') // 'generate' | 'study'

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-slate-100">Flashcards</h1>
        <p className="text-sm text-slate-500 mt-1">AI-generated cards for active recall practice</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg bg-[#13131a] border border-[#1e1e2e] w-fit">
        {[['generate', 'Generate'], ['study', 'Study']].map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => setView(val)}
            className={`px-5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === val ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'generate' ? <GenerateView /> : <StudyView key="study" />}
    </div>
  )
}
