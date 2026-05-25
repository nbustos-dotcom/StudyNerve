import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const ACTIONS = [
  { id: 'dashboard',   label: 'Dashboard',     path: '/',           shortcut: null,  icon: '⌂',  keywords: ['home', 'dashboard'] },
  { id: 'notes',       label: 'Notes',         path: '/notes',      shortcut: 'N',   icon: '📝', keywords: ['notes', 'create', 'new note'] },
  { id: 'quiz',        label: 'Quiz',          path: '/quiz',       shortcut: 'Q',   icon: '🧠', keywords: ['quiz', 'test', 'questions'] },
  { id: 'tutor',       label: 'Tutor',         path: '/chat',       shortcut: 'T',   icon: '💬', keywords: ['tutor', 'chat', 'ask', 'help'] },
  { id: 'flashcards',  label: 'Flashcards',    path: '/flashcards', shortcut: null,  icon: '🃏', keywords: ['flashcards', 'cards', 'review'] },
  { id: 'canvas',      label: 'Canvas',        path: '/canvas',     shortcut: null,  icon: '🎨', keywords: ['canvas', 'whiteboard', 'draw'] },
  { id: 'vision',      label: 'Vision Board',  path: '/vision',     shortcut: null,  icon: '🎯', keywords: ['vision', 'board', 'plan', 'goals'] },
  { id: 'universe',    label: 'My Universe',   path: '/universe',   shortcut: null,  icon: '🌌', keywords: ['universe', 'progress', 'stats'] },
  { id: 'settings',    label: 'Settings',      path: '/settings',   shortcut: null,  icon: '⚙️', keywords: ['settings', 'provider', 'api', 'canvas'] },
]

const RECENT_KEY = 'sn_recent_actions'

function getRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
  } catch {
    return []
  }
}

function saveRecent(id) {
  const prev = getRecent().filter((x) => x !== id)
  localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...prev].slice(0, 5)))
}

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef(null)

  const filtered = query.trim()
    ? ACTIONS.filter((a) => {
        const q = query.toLowerCase()
        return a.label.toLowerCase().includes(q) || a.keywords.some((k) => k.includes(q))
      })
    : getRecent()
        .map((id) => ACTIONS.find((a) => a.id === id))
        .filter(Boolean)
        .concat(ACTIONS.filter((a) => !getRecent().includes(a.id)))
        .slice(0, 7)

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => { setActiveIdx(0) }, [query])

  function select(action) {
    saveRecent(action.id)
    navigate(action.path)
    onClose()
  }

  function handleKey(e) {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && filtered[activeIdx]) select(filtered[activeIdx])
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9990,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(4px)',
          animation: 'palette-fade-in 0.15s ease',
        }}
      />

      {/* Palette */}
      <div
        style={{
          position: 'fixed',
          top: '20vh',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9995,
          width: '100%',
          maxWidth: 448,
          borderRadius: 16,
          background: 'rgba(12,12,30,0.97)',
          border: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(24px)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
          animation: 'palette-slide-in 0.15s ease',
          overflow: 'hidden',
        }}
        onKeyDown={handleKey}
      >
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.6" strokeLinecap="round" style={{ flexShrink: 0 }}>
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'rgba(255,255,255,0.9)',
              fontSize: 15,
              fontFamily: 'inherit',
            }}
          />
          <kbd style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.07)', padding: '2px 6px', borderRadius: 4 }}>ESC</kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 320, overflowY: 'auto', padding: '6px 0' }}>
          {filtered.length === 0 ? (
            <p style={{ padding: '12px 16px', fontSize: 13, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>No results</p>
          ) : (
            filtered.map((action, i) => (
              <button
                key={action.id}
                onClick={() => select(action)}
                onMouseEnter={() => setActiveIdx(i)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  padding: '10px 16px',
                  background: i === activeIdx ? 'rgba(99,102,241,0.15)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.1s',
                }}
              >
                <span style={{ fontSize: 16, width: 22, textAlign: 'center', flexShrink: 0 }}>{action.icon}</span>
                <span style={{ flex: 1, fontSize: 14, color: i === activeIdx ? '#c4b5fd' : 'rgba(255,255,255,0.75)', fontWeight: i === activeIdx ? 500 : 400 }}>
                  {action.label}
                </span>
                {action.shortcut && (
                  <kbd style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.07)', padding: '2px 7px', borderRadius: 4 }}>
                    {action.shortcut}
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 12, alignItems: 'center' }}>
          {[['↑↓', 'navigate'], ['↵', 'open'], ['?', 'shortcuts']].map(([key, label]) => (
            <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
              <kbd style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 3 }}>{key}</kbd>
              {label}
            </span>
          ))}
        </div>
      </div>
    </>
  )
}
