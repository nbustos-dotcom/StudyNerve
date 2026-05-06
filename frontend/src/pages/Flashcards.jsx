import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import Spinner from '../components/Spinner'

const FLASHCARD_STORAGE_KEY = 'studynerve_flashcard_progress'

// ── My Decks View ─────────────────────────────────────────────────────────────

function DecksView({ onStudyDeck, onGenerate }) {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getFlashcards()
      .then(setGroups)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // FIX 3: delete all cards in a deck
  async function handleDeleteDeck(e, group) {
    e.stopPropagation()
    if (!window.confirm(`Delete all ${group.flashcards.length} card${group.flashcards.length !== 1 ? 's' : ''} in "${group.note_title}"?`)) return
    try {
      await Promise.all(group.flashcards.map(card => api.deleteFlashcard(card.id)))
      setGroups(prev => prev.filter(g => g.note_id !== group.note_id))
    } catch (err) {
      console.error(err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner />
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="card p-10 flex flex-col items-center gap-4 text-center">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(var(--indigo-500-rgb),0.08)', border: '1px solid rgba(var(--indigo-500-rgb),0.15)' }}
        >
          <svg className="w-7 h-7 text-indigo-400/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
          </svg>
        </div>
        <div>
          <p className="text-slate-300 font-medium mb-1">No flashcard decks yet</p>
          <p className="text-sm text-slate-500">Generate cards from your notes to get started.</p>
        </div>
        <button className="btn-primary" onClick={onGenerate}>Generate First Deck</button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {groups.map((group, idx) => (
        <div
          key={group.note_id ?? 'unlinked'}
          className={`card p-4 flex items-center gap-4 cursor-pointer hover:border-slate-600 transition-colors group fade-in-up stagger-${Math.min(idx + 1, 6)}`}
          onClick={() => onStudyDeck(group.flashcards, group.note_title)}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            <svg className="w-5 h-5 text-slate-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="14" height="12" rx="2"/>
              <path d="M7 8h6M7 12h4"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-200 truncate">{group.note_title}</p>
            <p className="text-xs text-slate-500 mt-0.5">{group.flashcards.length} card{group.flashcards.length !== 1 ? 's' : ''}</p>
          </div>
          {/* FIX 3: delete button */}
          <button
            onClick={(e) => handleDeleteDeck(e, group)}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-colors opacity-0 group-hover:opacity-100"
            title="Delete deck"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5" />
              <rect x="3" y="4" width="10" height="10" rx="1" />
            </svg>
          </button>
          <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      ))}
    </div>
  )
}

// ── Generate View ─────────────────────────────────────────────────────────────

function GenerateView({ onStudyDeck }) {
  const [notes, setNotes] = useState([])
  const [notesLoading, setNotesLoading] = useState(true) // FIX 4
  const [selectedNote, setSelectedNote] = useState('')
  const [count, setCount] = useState(10)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    // FIX 4: track loading state and handle empty
    api.getNotes()
      .then(setNotes)
      .catch(console.error)
      .finally(() => setNotesLoading(false))
  }, [])

  async function handleGenerate() {
    if (!selectedNote) return
    setGenerating(true)
    setError(null)
    try {
      const cards = await api.generateFlashcards({ note_id: Number(selectedNote), count })
      const noteTitle = notes.find((n) => String(n.id) === selectedNote)?.title ?? 'New Deck'
      onStudyDeck(cards, noteTitle)
    } catch (e) {
      setError(e.message)
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
            {/* FIX 4: spinner while loading, empty state after */}
            <div className="relative">
              <select
                className="input"
                value={selectedNote}
                onChange={(e) => setSelectedNote(e.target.value)}
                disabled={notesLoading}
              >
                <option value="">{notesLoading ? 'Loading notes…' : 'Choose a note…'}</option>
                {notes.map((n) => (
                  <option key={n.id} value={n.id}>{n.title}</option>
                ))}
              </select>
              {notesLoading && (
                <div className="absolute right-9 top-1/2 -translate-y-1/2 pointer-events-none">
                  <Spinner size="sm" />
                </div>
              )}
            </div>
            {!notesLoading && notes.length === 0 && (
              <p className="text-sm text-slate-500 mt-2">
                No notes yet —{' '}
                <a href="/notes" className="text-indigo-400 hover:text-indigo-300 transition-colors">
                  create notes first
                </a>{' '}
                to generate flashcards.
              </p>
            )}
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
            disabled={generating || !selectedNote || notesLoading}
          >
            {generating ? (
              <span className="flex items-center gap-2"><Spinner size="sm" /> Generating…</span>
            ) : (
              'Generate'
            )}
          </button>
        </div>
        {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
      </div>
    </div>
  )
}

// ── Study View ────────────────────────────────────────────────────────────────

const DIFFICULTY_CFG = {
  easy:   { label: 'Easy',   color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/30' },
  medium: { label: 'Medium', color: 'bg-amber-500/20  text-amber-300  border-amber-500/30  hover:bg-amber-500/30'  },
  hard:   { label: 'Hard',   color: 'bg-red-500/20    text-red-300    border-red-500/30    hover:bg-red-500/30'    },
}

function StudyView({ initialCards = null, deckTitle = null, onBack = null, onGoGenerate = null }) {
  const [activeDeck, setActiveDeck] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [reviewingDifficulty, setReviewingDifficulty] = useState(null) // FIX 5
  const [done, setDone] = useState(false)
  const [skippedOnce, setSkippedOnce] = useState(new Set())
  const [savedProgress, setSavedProgress] = useState(null)
  const [ratings, setRatings] = useState({ easy: 0, medium: 0, hard: 0 }) // FIX 6

  const indexRef = useRef(0)
  const activeDeckRef = useRef([])
  const doneRef = useRef(false)

  useEffect(() => { indexRef.current = index }, [index])
  useEffect(() => { activeDeckRef.current = activeDeck }, [activeDeck])
  useEffect(() => { doneRef.current = done }, [done])

  useEffect(() => {
    if (initialCards) {
      setActiveDeck(initialCards)
      setIndex(0)
      setFlipped(false)
      setDone(false)
      setSkippedOnce(new Set())
      setRatings({ easy: 0, medium: 0, hard: 0 })
      setLoading(false)
      return
    }

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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialCards) return
    if (!loading && activeDeck.length > 0 && !done) {
      try {
        localStorage.setItem(FLASHCARD_STORAGE_KEY, JSON.stringify({
          cards: activeDeck,
          index,
          skippedOnce: [...skippedOnce],
        }))
      } catch {}
    }
  }, [activeDeck, index, done, loading, skippedOnce, initialCards])

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
      setRatings({ easy: 0, medium: 0, hard: 0 })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function restart() {
    setRatings({ easy: 0, medium: 0, hard: 0 }) // FIX 6: reset on restart
    if (initialCards) {
      setActiveDeck(initialCards)
      setIndex(0)
      setFlipped(false)
      setDone(false)
      setSkippedOnce(new Set())
    } else {
      loadCards()
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
    setReviewingDifficulty(difficulty) // FIX 5
    try {
      await api.reviewFlashcard(card.id, { difficulty })
    } catch {}
    setReviewing(false)
    setReviewingDifficulty(null) // FIX 5
    setRatings(prev => ({ ...prev, [difficulty]: prev[difficulty] + 1 })) // FIX 6
    const next = index + 1
    if (next >= activeDeck.length) {
      if (!initialCards) localStorage.removeItem(FLASHCARD_STORAGE_KEY)
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
      if (!initialCards) localStorage.removeItem(FLASHCARD_STORAGE_KEY)
      setDone(true)
    } else { setIndex(next); setFlipped(false) }
  }

  // FIX 1: calculate effectiveDeckLength AFTER appending
  function handleSkip() {
    const card = activeDeck[index]
    const alreadySkipped = skippedOnce.has(card.id)
    let newDeckLength = activeDeck.length
    if (!alreadySkipped) {
      setSkippedOnce(prev => new Set([...prev, card.id]))
      setActiveDeck(prev => [...prev, card])
      newDeckLength = activeDeck.length + 1
    }
    const next = index + 1
    if (next >= newDeckLength) {
      if (!initialCards) localStorage.removeItem(FLASHCARD_STORAGE_KEY)
      setDone(true)
    } else { setIndex(next); setFlipped(false) }
  }

  const backLink = onBack && (
    <button
      onClick={onBack}
      className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-6"
    >
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10 4L6 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {deckTitle ? 'Back to My Decks' : 'Back'}
    </button>
  )

  if (savedProgress && !loading) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="card p-8 flex flex-col items-center gap-5 text-center fade-in-up">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(var(--indigo-500-rgb),0.08)', border: '1px solid rgba(var(--indigo-500-rgb),0.2)' }}>
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
        <Spinner />
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-red-400 text-center py-12">{error}</p>
  }

  // FIX 2: add "Generate Flashcards" button to break dead end
  if (activeDeck.length === 0) {
    return (
      <>
        {backLink}
        <div className="card p-10 flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(var(--indigo-500-rgb),0.08)', border: '1px solid rgba(var(--indigo-500-rgb),0.15)' }}>
            <svg className="w-7 h-7 text-indigo-400/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
            </svg>
          </div>
          <div>
            <p className="text-slate-300 font-medium mb-1">No flashcards yet</p>
            <p className="text-sm text-slate-500">Generate cards from your notes to get started.</p>
          </div>
          {onGoGenerate && (
            <button className="btn-primary" onClick={onGoGenerate}>Generate Flashcards</button>
          )}
        </div>
      </>
    )
  }

  if (done) {
    const totalRated = ratings.easy + ratings.medium + ratings.hard
    return (
      <>
        {backLink}
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
          {/* FIX 6: rating breakdown pills */}
          {totalRated > 0 && (
            <div className="flex gap-2 flex-wrap justify-center">
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                Easy: {ratings.easy}
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/25">
                Medium: {ratings.medium}
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-red-500/15 text-red-300 border border-red-500/25">
                Hard: {ratings.hard}
              </span>
            </div>
          )}
          <div className="flex gap-3">
            <button className="btn-primary" onClick={restart}>Study Again</button>
            {onBack && (
              <button
                className="px-4 py-2 rounded-xl text-sm border border-[#1e1e2e] text-slate-400 hover:border-slate-500 hover:text-slate-200 transition-colors"
                onClick={onBack}
              >
                Back to Decks
              </button>
            )}
          </div>
        </div>
      </>
    )
  }

  const card = activeDeck[index]
  const progress = Math.round((index / activeDeck.length) * 100)

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {backLink}

      {deckTitle && (
        <p className="text-xs text-slate-500 uppercase tracking-widest font-medium -mb-2">{deckTitle}</p>
      )}

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

      {/* Flip card */}
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
              ? '0 16px 48px rgba(var(--indigo-500-rgb),0.2), 0 4px 16px rgba(0,0,0,0.4)'
              : '0 8px 32px rgba(0,0,0,0.3)',
          }}
        >
          {/* Front */}
          <div
            style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
            className="card-solid flex flex-col items-center justify-center p-8 text-center select-none"
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
              background: 'rgba(0,0,0,0.6)',
              border: '1px solid rgba(255,255,255,0.1)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
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

      {/* Navigation */}
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

      {/* Difficulty rating — FIX 5: spinner + opacity on active button */}
      <div
        className="flex gap-3 justify-center transition-all duration-300"
        style={{ opacity: flipped ? 1 : 0, pointerEvents: flipped ? 'auto' : 'none' }}
      >
        {(['easy', 'medium', 'hard']).map((d) => (
          <button
            key={d}
            onClick={() => handleDifficulty(d)}
            disabled={reviewing}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-all duration-200 hover:scale-[1.03] ${DIFFICULTY_CFG[d].color} ${reviewing && reviewingDifficulty !== d ? 'opacity-50' : ''}`}
          >
            {reviewing && reviewingDifficulty === d ? (
              <span className="flex items-center justify-center gap-1.5">
                <Spinner size="sm" />
                {DIFFICULTY_CFG[d].label}
              </span>
            ) : DIFFICULTY_CFG[d].label}
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
  const [view, setView] = useState('decks') // 'decks' | 'generate' | 'study'
  const [studyDeck, setStudyDeck] = useState(null) // { cards, title }

  function openDeck(cards, title) {
    setStudyDeck({ cards, title })
    setView('study')
  }

  function backToDecks() {
    setStudyDeck(null)
    setView('decks')
  }

  // FIX 2: escape study mode → generate tab
  function goToGenerate() {
    setStudyDeck(null)
    setView('generate')
  }

  return (
    <div className="p-4 sm:p-8 max-w-2xl mx-auto fade-in-up">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-slate-100">Flashcards</h1>
        <p className="text-sm text-slate-500 mt-1">AI-generated cards for active recall practice</p>
      </div>

      {view !== 'study' && (
        <div className="pill-tabs mb-6">
          {[
            ['decks',    'My Decks'],
            ['generate', 'Generate'],
          ].map(([val, label]) => (
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
      )}

      {view === 'decks' && (
        <DecksView
          onStudyDeck={openDeck}
          onGenerate={() => setView('generate')}
        />
      )}
      {view === 'generate' && <GenerateView onStudyDeck={openDeck} />}
      {view === 'study' && studyDeck && (
        <StudyView
          key={`deck-${studyDeck.title}`}
          initialCards={studyDeck.cards}
          deckTitle={studyDeck.title}
          onBack={backToDecks}
          onGoGenerate={goToGenerate}
        />
      )}
    </div>
  )
}
