import { useState, useCallback, useEffect, useRef } from 'react'
import {
  Tldraw,
  DefaultToolbar,
  SelectToolbarItem,
  DrawToolbarItem,
  NoteToolbarItem,
  ArrowToolbarItem,
  EraserToolbarItem,
} from '@tldraw/tldraw'
import { DefaultColorStyle, DefaultFontStyle } from '@tldraw/tlschema'
import '@tldraw/tldraw/tldraw.css'
import '../styles/brainspace.css'
import { api } from '../api/client'
import MakeSenseButton from '../components/MakeSenseButton'

const ALLOWED_TOOLS = new Set(['select', 'draw', 'note', 'arrow', 'eraser'])

const tlOverrides = {
  tools(_editor, tools) {
    return Object.fromEntries(
      Object.entries(tools).filter(([id]) => ALLOWED_TOOLS.has(id))
    )
  },
}

function BrainspaceBackground() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0A1F2E' }}>
      {/* Radial center glow */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 70% 60% at 50% 50%, #0F3A4A 0%, transparent 100%)',
        pointerEvents: 'none',
      }} />
      {/* Cyan-tinted noise grain */}
      <svg
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.6 }}
      >
        <filter id="bs-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="4" stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 0.34  0 0 0 0 0.81  0 0 0 0 0.88  0 0 0 0.03 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#bs-noise)" />
      </svg>
    </div>
  )
}

function BrainspaceToolbar() {
  return (
    <DefaultToolbar>
      <SelectToolbarItem />
      <DrawToolbarItem />
      <NoteToolbarItem />
      <ArrowToolbarItem />
      <EraserToolbarItem />
    </DefaultToolbar>
  )
}

const tlComponents = {
  Background: BrainspaceBackground,
  Toolbar: BrainspaceToolbar,
  MenuPanel: null,
  MainMenu: null,
  HelpMenu: null,
  StylePanel: null,
  PageMenu: null,
  NavigationPanel: null,
  SharePanel: null,
  DebugPanel: null,
  DebugMenu: null,
  Minimap: null,
  ZoomMenu: null,
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
    <div className="p-4 sm:p-8 max-w-2xl mx-auto fade-in-up">
      <h1 style={{
        fontFamily: "'Fraunces', Georgia, serif",
        fontWeight: 400,
        fontSize: '1.75rem',
        marginBottom: '1.5rem',
        color: 'var(--bs-accent)',
        letterSpacing: '0.01em',
        textShadow: '0 0 16px rgba(86, 207, 225, 0.35)',
      }}>
        Brainspace
      </h1>

      <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          placeholder="New board name…"
          disabled={creating}
          style={{
            flex: 1,
            padding: '0.5rem 0.75rem',
            border: '1px solid #1F4A5C',
            borderRadius: 6,
            fontSize: '0.95rem',
            background: 'rgba(15, 58, 74, 0.6)',
            color: '#E8F8FB',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={creating || !newTitle.trim()}
          style={{
            padding: '0.5rem 1rem',
            background: 'rgba(86, 207, 225, 0.12)',
            color: 'var(--bs-accent)',
            border: '1px solid #1F4A5C',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: '0.95rem',
          }}
        >
          {creating ? 'Creating…' : 'New board'}
        </button>
      </form>

      {error && (
        <p style={{ color: '#ff6b6b', marginBottom: '1rem' }}>{error}</p>
      )}

      {loading ? (
        <p style={{ color: 'rgba(86,207,225,0.45)' }}>Loading…</p>
      ) : boards.length === 0 ? (
        <p style={{ color: 'rgba(86,207,225,0.45)' }}>No boards yet. Create one above.</p>
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
                border: '1px solid #1F4A5C',
                borderRadius: 8,
                background: 'rgba(15, 58, 74, 0.4)',
                cursor: 'pointer',
              }}
            >
              <div>
                <div style={{ fontWeight: 500, marginBottom: 2, color: '#E8F8FB' }}>{board.title}</div>
                <div style={{ fontSize: '0.8rem', color: 'rgba(86,207,225,0.5)' }}>
                  {new Date(board.updated_at).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={e => handleDelete(e, board.id)}
                style={{
                  padding: '0.25rem 0.6rem',
                  border: '1px solid #1F4A5C',
                  borderRadius: 4,
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  color: 'rgba(86,207,225,0.5)',
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
  const [status, setStatus] = useState('loading')
  const [saveStatus, setSaveStatus] = useState('saved')
  const [editor, setEditor] = useState(null)
  const [mounted, setMounted] = useState(false)
  const saveTimer = useRef(null)

  useEffect(() => { setMounted(true) }, [])

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

  const handleMount = useCallback((editorInstance) => {
    setEditor(editorInstance)
    editorInstance.setStyleForNextShapes(DefaultColorStyle, 'black')
    editorInstance.setStyleForNextShapes(DefaultFontStyle, 'draw')
    editorInstance.updateInstanceState({ isGridMode: false })

    const cleanup = editorInstance.store.listen(
      () => {
        setSaveStatus('saving')
        clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(async () => {
          try {
            const snap = editorInstance.getSnapshot()
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
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      opacity: mounted ? 1 : 0,
      transform: mounted ? 'scale(1)' : 'scale(0.98)',
      transition: 'opacity 200ms ease-out, transform 200ms ease-out',
    }}>
      {/* Header bar */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 44,
        background: 'rgba(10, 31, 46, 0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid #1F4A5C',
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
            border: '1px solid #1F4A5C',
            borderRadius: 4,
            background: 'rgba(86, 207, 225, 0.06)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            color: 'var(--bs-accent)',
          }}
        >
          ← Boards
        </button>
        <span style={{
          fontFamily: "'Fraunces', Georgia, serif",
          fontWeight: 400,
          fontSize: '0.9rem',
          flex: 1,
          color: '#E8F8FB',
          letterSpacing: '0.01em',
        }}>
          {boardTitle}
        </span>
        <span style={{ fontSize: '0.75rem', color: saveStatus === 'error' ? '#ff6b6b' : 'rgba(86,207,225,0.45)' }}>
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
          inferDarkMode={false}
          licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY}
        />
        {editor && (
          <MakeSenseButton editor={editor} boardId={boardId} />
        )}
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
