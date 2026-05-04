import { useState, useCallback, useEffect, useRef } from 'react'
import { Tldraw } from '@tldraw/tldraw'
import '@tldraw/tldraw/tldraw.css'
import { api } from '../api/client'

// Tools available in Brainspace — all geometry/frame tools hidden
const ALLOWED_TOOLS = new Set(['select', 'draw', 'text', 'note', 'arrow', 'eraser'])

const tlOverrides = {
  tools(_editor, tools) {
    return Object.fromEntries(
      Object.entries(tools).filter(([id]) => ALLOWED_TOOLS.has(id))
    )
  },
}

// Custom background: warm paper + subtle noise grain
function BrainspaceBackground() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#FBF7F0' }}>
      <svg
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.04 }}
      >
        <filter id="bs-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="4" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#bs-noise)" />
      </svg>
    </div>
  )
}

const tlComponents = {
  Background: BrainspaceBackground,
  MainMenu: null,
  HelpMenu: null,
}

// ── Board list ────────────────────────────────────────────────────────────────

function BrainspaceList({ onOpen }) {
  const [boards, setBoards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    api.visionBoards()
      .then(setBoards)
      .catch(() => setError('Failed to load boards.'))
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    setCreating(true)
    try {
      const board = await api.visionCreate({ title })
      onOpen(board.id)
    } catch {
      setError('Failed to create board.')
      setCreating(false)
    }
  }

  async function handleDelete(e, id) {
    e.stopPropagation()
    if (!window.confirm('Delete this board?')) return
    try {
      await api.visionDeleteBoard(id)
      setBoards(prev => prev.filter(b => b.id !== id))
    } catch {
      setError('Failed to delete board.')
    }
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 700, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Brainspace</h1>

      <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          placeholder="New board name…"
          disabled={creating}
          style={{
            flex: 1,
            padding: '0.5rem 0.75rem',
            border: '1px solid #d1cdc7',
            borderRadius: 6,
            fontSize: '0.95rem',
            background: '#FFFDF9',
          }}
        />
        <button
          type="submit"
          disabled={creating || !newTitle.trim()}
          style={{
            padding: '0.5rem 1rem',
            background: '#2D2D2D',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: '0.95rem',
          }}
        >
          {creating ? 'Creating…' : 'New board'}
        </button>
      </form>

      {error && (
        <p style={{ color: '#c0392b', marginBottom: '1rem' }}>{error}</p>
      )}

      {loading ? (
        <p style={{ color: '#888' }}>Loading…</p>
      ) : boards.length === 0 ? (
        <p style={{ color: '#888' }}>No boards yet. Create one above.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {boards.map(board => (
            <div
              key={board.id}
              onClick={() => onOpen(board.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                border: '1px solid #e5e0d8',
                borderRadius: 8,
                background: '#FFFDF9',
                cursor: 'pointer',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>{board.title}</div>
                <div style={{ fontSize: '0.8rem', color: '#888' }}>
                  {new Date(board.updated_at).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={e => handleDelete(e, board.id)}
                style={{
                  padding: '0.25rem 0.6rem',
                  border: '1px solid #ddd',
                  borderRadius: 4,
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  color: '#888',
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Canvas ────────────────────────────────────────────────────────────────────

function BrainspaceCanvas({ boardId, onBack }) {
  const [snapshot, setSnapshot] = useState(undefined)
  const [boardTitle, setBoardTitle] = useState('')
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [saveStatus, setSaveStatus] = useState('saved') // 'saved' | 'saving' | 'error'
  const saveTimer = useRef(null)

  useEffect(() => {
    api.visionBoard(boardId)
      .then(data => {
        setBoardTitle(data.title)
        if (data.tldraw_state) {
          try {
            setSnapshot(JSON.parse(data.tldraw_state))
          } catch {
            setSnapshot(undefined)
          }
        }
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }, [boardId])

  const handleMount = useCallback((editor) => {
    const cleanup = editor.store.listen(
      () => {
        setSaveStatus('saving')
        clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(async () => {
          try {
            const snap = editor.getSnapshot()
            await api.visionSaveTldrawState(boardId, JSON.stringify(snap))
            setSaveStatus('saved')
          } catch {
            setSaveStatus('error')
          }
        }, 1000)
      },
      { source: 'user', scope: 'document' }
    )
    return cleanup
  }, [boardId])

  if (status === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <span style={{ color: '#888' }}>Loading canvas…</span>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div style={{ padding: '2rem' }}>
        <p style={{ color: '#c0392b' }}>Failed to load board.</p>
        <button onClick={onBack}>← Back</button>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
      {/* Thin header bar */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 44,
        background: 'rgba(251,247,240,0.92)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid #e5e0d8',
        display: 'flex',
        alignItems: 'center',
        paddingInline: '0.75rem',
        gap: '0.75rem',
        zIndex: 200,
      }}>
        <button
          onClick={onBack}
          style={{
            padding: '0.25rem 0.6rem',
            border: '1px solid #d1cdc7',
            borderRadius: 4,
            background: 'transparent',
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          ← Boards
        </button>
        <span style={{ fontWeight: 600, fontSize: '0.9rem', flex: 1 }}>{boardTitle}</span>
        <span style={{ fontSize: '0.75rem', color: saveStatus === 'error' ? '#c0392b' : '#aaa' }}>
          {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Save failed' : 'Saved'}
        </span>
      </div>

      {/* Canvas — offset below header */}
      <div style={{ position: 'absolute', top: 44, left: 0, right: 0, bottom: 0 }}>
        <Tldraw
          snapshot={snapshot}
          onMount={handleMount}
          overrides={tlOverrides}
          components={tlComponents}
        />
      </div>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function Brainspace() {
  const [activeBoardId, setActiveBoardId] = useState(null)
  return activeBoardId
    ? <BrainspaceCanvas boardId={activeBoardId} onBack={() => setActiveBoardId(null)} />
    : <BrainspaceList onOpen={setActiveBoardId} />
}
