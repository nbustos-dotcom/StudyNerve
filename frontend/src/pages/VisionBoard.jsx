import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'

// ── Constants ─────────────────────────────────────────────────────────────────

const CANVAS_W = 4000
const CANVAS_H = 3000
const NODE_W = 180
const NODE_H = 68

const CSS = `
  @keyframes vb-in  { from { opacity:0; transform:scale(.88) } to { opacity:1; transform:scale(1) } }
  @keyframes vb-out { from { opacity:1; transform:scale(1)   } to { opacity:0; transform:scale(.88) } }
  @keyframes vb-ln  { to { stroke-dashoffset: 0 } }
`

// ── Utilities ─────────────────────────────────────────────────────────────────

function bezier(x1, y1, x2, y2) {
  const cx = Math.max(Math.abs(x2 - x1) * 0.5, 60)
  return `M ${x1} ${y1} C ${x1 + cx} ${y1} ${x2 - cx} ${y2} ${x2} ${y2}`
}

function hitNode(nodesMap, px, py) {
  for (const n of Object.values(nodesMap)) {
    const nx = n.x_position || 0, ny = n.y_position || 0
    if (px >= nx && px <= nx + NODE_W && py >= ny && py <= ny + NODE_H) return n
  }
  return null
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spin({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="animate-spin" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity=".25" />
      <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" opacity=".75" />
    </svg>
  )
}

// ── Context menu ──────────────────────────────────────────────────────────────

function CtxMenu({ x, y, onAsk, onBreakdown, onEdit, onDelete, onClose }) {
  useEffect(() => {
    const h = (e) => { if (!e.target.closest('[data-ctx]')) onClose() }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [onClose])

  const items = [
    { label: 'Ask Tutor',      icon: '💬', action: onAsk },
    { label: 'AI Break Down',  icon: '✨', action: onBreakdown },
    { label: 'Edit',           icon: '✏️', action: onEdit },
    { label: 'Delete',         icon: '🗑', action: onDelete, danger: true },
  ]
  return (
    <div data-ctx="1" style={{
      position: 'fixed', left: x, top: y, zIndex: 300,
      background: 'rgba(10,10,26,.94)', backdropFilter: 'blur(18px)',
      border: '1px solid rgba(255,255,255,.1)', borderRadius: 12,
      padding: 4, minWidth: 168, boxShadow: '0 10px 36px rgba(0,0,0,.55)',
    }}>
      {items.map(it => (
        <button key={it.label}
          onClick={() => { it.action(); onClose() }}
          style={{
            display: 'flex', alignItems: 'center', gap: 9,
            width: '100%', padding: '8px 12px', borderRadius: 8,
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, color: it.danger ? '#f87171' : 'rgba(255,255,255,.82)',
            transition: 'background 120ms',
          }}
          onMouseEnter={e => e.currentTarget.style.background = it.danger ? 'rgba(248,113,113,.12)' : 'rgba(255,255,255,.08)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <span style={{ width: 16, textAlign: 'center' }}>{it.icon}</span>
          {it.label}
        </button>
      ))}
    </div>
  )
}

// ── Tutor popup ───────────────────────────────────────────────────────────────

function TutorPopup({ nodeId, onClose }) {
  const [q, setQ] = useState('')
  const [ans, setAns] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!q.trim() || busy) return
    setBusy(true)
    try {
      const res = await api.visionAskNode(nodeId, q.trim())
      setAns(res.answer)
    } catch (err) { setAns(`Error: ${err.message}`) }
    setBusy(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(5px)',
    }} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'rgba(10,10,26,.96)', backdropFilter: 'blur(20px)',
        border: '1px solid rgba(99,102,241,.28)', borderRadius: 16,
        padding: 24, width: 420, maxWidth: '90vw',
        boxShadow: '0 24px 64px rgba(0,0,0,.65)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,.9)', margin: 0 }}>Ask Tutor</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', gap: 8 }}>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Ask about this task…"
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 13,
              background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
              color: 'white', outline: 'none',
            }} />
          <button type="submit" disabled={!q.trim() || busy}
            style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, background: 'rgba(99,102,241,.65)', border: 'none', color: 'white', cursor: busy ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            {busy ? <Spin size={13} /> : 'Ask'}
          </button>
        </form>
        {ans && (
          <div style={{
            marginTop: 14, padding: '12px 14px', borderRadius: 10, fontSize: 13, lineHeight: 1.65,
            background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.18)',
            color: 'rgba(255,255,255,.85)', whiteSpace: 'pre-wrap',
          }}>{ans}</div>
        )}
      </div>
    </div>
  )
}

// ── Canvas Node ───────────────────────────────────────────────────────────────

function CanvasNode({
  node, isNew, isDeleting, isSelected, isHovered,
  isEditing, editValue, onEditChange, onEditSubmit, onEditCancel,
  onMouseDown, onHandleMouseDown, onContextMenu, onDoubleClick,
  onToggle, onMouseEnter, onMouseLeave,
  onTouchStart,
}) {
  const done = node.is_completed
  const anim = isNew ? 'vb-in .2s ease-out forwards' : isDeleting ? 'vb-out .2s ease-out forwards' : undefined

  return (
    <div
      style={{
        position: 'absolute',
        left: node.x_position || 0,
        top: node.y_position || 0,
        width: NODE_W,
        minHeight: NODE_H,
        userSelect: 'none',
        animation: anim,
        zIndex: isSelected ? 10 : 2,
        filter: isSelected ? 'drop-shadow(0 0 14px rgba(99,102,241,.4))' : undefined,
      }}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart}
    >
      {/* Card */}
      <div style={{
        width: '100%', minHeight: NODE_H, padding: '10px 14px',
        background: done
          ? 'rgba(16,185,129,.07)'
          : isSelected ? 'rgba(99,102,241,.13)' : 'rgba(255,255,255,.05)',
        backdropFilter: 'blur(14px)',
        border: `1px solid ${done ? 'rgba(16,185,129,.32)' : isSelected ? 'rgba(99,102,241,.45)' : 'rgba(255,255,255,.1)'}`,
        borderLeft: done ? '3px solid rgba(16,185,129,.65)' : undefined,
        borderRadius: 12,
        boxShadow: isSelected
          ? '0 0 0 1px rgba(99,102,241,.3), 0 4px 20px rgba(0,0,0,.35)'
          : '0 2px 10px rgba(0,0,0,.28)',
        display: 'flex', alignItems: 'flex-start', gap: 9,
        transition: 'border-color 150ms, background 150ms',
        cursor: 'grab',
      }}>
        {/* Checkbox */}
        <div onClick={e => { e.stopPropagation(); onToggle() }} style={{
          flexShrink: 0, marginTop: 1,
          width: 15, height: 15, borderRadius: 4, cursor: 'pointer',
          background: done ? 'rgba(16,185,129,.28)' : 'rgba(255,255,255,.07)',
          border: `1px solid ${done ? 'rgba(16,185,129,.5)' : 'rgba(255,255,255,.15)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {done && <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1 4.5l2.5 2.5 4-5" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </div>

        {/* Title */}
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {isEditing ? (
            <input
              autoFocus
              value={editValue}
              onChange={e => onEditChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); onEditSubmit() }
                if (e.key === 'Escape') onEditCancel()
              }}
              onBlur={onEditSubmit}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', background: 'none', border: 'none', outline: 'none',
                color: 'white', fontSize: 13, fontWeight: 500,
              }}
            />
          ) : (
            <p style={{
              margin: 0, fontSize: 13, fontWeight: 500, lineHeight: 1.4,
              color: done ? 'rgba(255,255,255,.38)' : 'rgba(255,255,255,.9)',
              textDecoration: done ? 'line-through' : undefined,
              wordBreak: 'break-word',
            }}>{node.title}</p>
          )}
        </div>
      </div>

      {/* Handle dot — right-edge center, shown on hover */}
      <div
        onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onHandleMouseDown(e) }}
        style={{
          position: 'absolute', right: -5, top: '50%', transform: 'translateY(-50%)',
          width: 10, height: 10, borderRadius: '50%',
          background: '#6366f1', border: '2px solid rgba(165,180,252,.55)',
          cursor: 'crosshair',
          opacity: isHovered || isSelected ? 1 : 0,
          transition: 'opacity 150ms',
          boxShadow: '0 0 8px rgba(99,102,241,.55)',
          zIndex: 5,
        }}
      />
    </div>
  )
}

// ── Board selector dropdown ───────────────────────────────────────────────────

function BoardSelector({ boards, activeBoardId, onSelect, onCreateBoard }) {
  const [open, setOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) { setCreating(false); setNewTitle('') }
  }, [open])

  async function submit(e) {
    e.preventDefault()
    console.log('[BoardSelector] submit fired, newTitle:', newTitle, 'saving:', saving)
    if (!newTitle.trim() || saving) return
    setSaving(true)
    await onCreateBoard(newTitle.trim())
    setSaving(false)
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8,
          background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
          color: 'rgba(255,255,255,.65)', fontSize: 12, cursor: 'pointer',
        }}>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4">
          <rect x=".5" y=".5" width="4" height="4" rx="1"/><rect x="6.5" y=".5" width="4" height="4" rx="1"/>
          <rect x=".5" y="6.5" width="4" height="4" rx="1"/><rect x="6.5" y="6.5" width="4" height="4" rx="1"/>
        </svg>
        Boards
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M1.5 3.5l3 3 3-3"/></svg>
      </button>

      {open && (
        <div onMouseDown={e => e.stopPropagation()} style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 500,
          background: 'rgba(10,10,26,.96)', backdropFilter: 'blur(18px)',
          border: '1px solid rgba(255,255,255,.1)', borderRadius: 12,
          padding: 4, minWidth: 210, boxShadow: '0 10px 36px rgba(0,0,0,.55)',
        }}>
          {boards.map(b => (
            <button key={b.id}
              onClick={() => { onSelect(b.id); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '8px 12px', borderRadius: 8,
                background: b.id === activeBoardId ? 'rgba(99,102,241,.16)' : 'none',
                border: 'none', cursor: 'pointer', fontSize: 13, textAlign: 'left',
                color: b.id === activeBoardId ? 'rgba(165,180,252,.9)' : 'rgba(255,255,255,.72)',
              }}
              onMouseEnter={e => { if (b.id !== activeBoardId) e.currentTarget.style.background = 'rgba(255,255,255,.07)' }}
              onMouseLeave={e => { if (b.id !== activeBoardId) e.currentTarget.style.background = 'none' }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 148 }}>{b.title}</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.28)', flexShrink: 0, marginLeft: 8 }}>{b.node_count}</span>
            </button>
          ))}

          {boards.length > 0 && <div style={{ height: 1, background: 'rgba(255,255,255,.06)', margin: '4px 0' }} />}

          {!creating ? (
            <button onClick={() => setCreating(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: '8px 12px', borderRadius: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'rgba(165,180,252,.72)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,.1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5.5 1v9M1 5.5h9"/></svg>
              New Board
            </button>
          ) : (
            <form onSubmit={submit} style={{ padding: '6px 8px', display: 'flex', gap: 6 }}>
              <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
                placeholder="Board title…"
                onKeyDown={e => e.key === 'Escape' && setCreating(false)}
                style={{
                  flex: 1, padding: '5px 9px', borderRadius: 7, fontSize: 12,
                  background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)',
                  color: 'white', outline: 'none',
                }} />
              <button type="submit" disabled={saving}
                style={{ padding: '5px 10px', borderRadius: 7, fontSize: 12, background: 'rgba(99,102,241,.6)', border: 'none', color: 'white', cursor: 'pointer' }}>
                {saving ? '…' : '✓'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function VisionBoard() {
  // Board state
  const [boards, setBoards] = useState([])
  const [activeBoard, setActiveBoard] = useState(null)
  const [nodesMap, setNodesMap] = useState({})  // { [id]: NodeResponse }
  const [loadingBoards, setLoadingBoards] = useState(true)

  // Interaction state
  const [hoveredNodeId, setHoveredNodeId] = useState(null)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [creating, setCreating] = useState(null)    // { x, y, fromId, value } | null
  const [editingNodeId, setEditingNodeId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [liveConn, setLiveConn] = useState(null)    // { x1,y1,x2,y2 } | null
  const [newNodeIds, setNewNodeIds] = useState(new Set())
  const [deletingIds, setDeletingIds] = useState(new Set())
  const [newConnKeys, setNewConnKeys] = useState(new Set())
  const [contextMenu, setContextMenu] = useState(null)  // { x, y, nodeId }
  const [tutorNodeId, setTutorNodeId] = useState(null)

  // AI state
  const [aiOrganizing, setAiOrganizing] = useState(false)
  const [aiBreaking, setAiBreaking] = useState(false)
  const [aiError, setAiError] = useState(null)

  // Refs
  const containerRef = useRef(null)
  const dragRef = useRef(null)    // { nodeId, startMX, startMY, startNX, startNY }
  const panRef = useRef(null)     // { startMX, startMY, startSX, startSY }
  const connRef = useRef(null)    // { fromId, x1, y1 }
  const touchRef = useRef(null)   // touch drag state
  const nodesRef = useRef(nodesMap)
  nodesRef.current = nodesMap

  // ── Load ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    console.log('[VisionBoard] mount — fetching boards')
    api.visionBoards()
      .then(bs => {
        console.log('[VisionBoard] boards loaded:', bs.length, bs)
        setBoards(bs)
        if (bs.length > 0) loadBoard(bs[0].id)
        else console.log('[VisionBoard] no boards — showing empty state')
      })
      .catch(err => console.error('[VisionBoard] boards fetch error:', err))
      .finally(() => setLoadingBoards(false))
  }, [])

  async function loadBoard(id) {
    console.log('[VisionBoard] loadBoard id:', id)
    try {
      const b = await api.visionBoard(id)
      console.log('[VisionBoard] board loaded:', b.id, b.title, 'nodes:', b.nodes?.length, b.nodes)
      setActiveBoard(b)
      const map = {}
      for (const n of b.nodes) map[n.id] = n
      setNodesMap(map)
      setSelectedNodeId(null)
      setContextMenu(null)
      setCreating(null)
    } catch (err) {
      console.error('[VisionBoard] loadBoard error:', err)
    }
  }

  async function handleCreateBoard(title) {
    console.log('[VisionBoard] handleCreateBoard called with title:', title)
    try {
      const b = await api.visionCreate({ title })
      console.log('[VisionBoard] visionCreate response:', b)
      const summary = { id: b.id, title: b.title, is_ai_generated: b.is_ai_generated, node_count: 0, created_at: b.created_at, updated_at: b.updated_at }
      setBoards(prev => [summary, ...prev])
      setActiveBoard(b)
      setNodesMap({})
      setSelectedNodeId(null)
      console.log('[VisionBoard] board created, activeBoard set to:', b.id, b.title, '— canvas should now be interactive')
    } catch (err) {
      console.error('[VisionBoard] handleCreateBoard error:', err)
      setAiError(err.message || 'Failed to create board')
    }
  }

  // ── Canvas coordinate helper ─────────────────────────────────────────────────

  function getCanvasPos(clientX, clientY) {
    if (!containerRef.current) return { x: 0, y: 0 }
    const r = containerRef.current.getBoundingClientRect()
    return {
      x: clientX - r.left + containerRef.current.scrollLeft,
      y: clientY - r.top + containerRef.current.scrollTop,
    }
  }

  // ── Global mouse handlers ───────────────────────────────────────────────────

  useEffect(() => {
    function onMove(e) {
      const { clientX, clientY } = e

      if (panRef.current) {
        const p = panRef.current
        if (containerRef.current) {
          containerRef.current.scrollLeft = p.startSX - (clientX - p.startMX)
          containerRef.current.scrollTop  = p.startSY - (clientY - p.startMY)
        }
        return
      }

      if (dragRef.current) {
        const d = dragRef.current
        const dx = clientX - d.startMX, dy = clientY - d.startMY
        setNodesMap(prev => ({
          ...prev,
          [d.nodeId]: { ...prev[d.nodeId], x_position: d.startNX + dx, y_position: d.startNY + dy },
        }))
        return
      }

      if (connRef.current) {
        const pos = getCanvasPos(clientX, clientY)
        setLiveConn({ x1: connRef.current.x1, y1: connRef.current.y1, x2: pos.x, y2: pos.y })
      }
    }

    async function onUp(e) {
      if (panRef.current) { panRef.current = null; return }

      if (dragRef.current) {
        const { nodeId } = dragRef.current
        dragRef.current = null
        if (containerRef.current) containerRef.current.style.cursor = ''
        const n = nodesRef.current[nodeId]
        if (n) api.visionMoveNode(nodeId, Math.round(n.x_position || 0), Math.round(n.y_position || 0)).catch(() => {})
        return
      }

      if (connRef.current) {
        const { fromId, x1, y1 } = connRef.current
        connRef.current = null
        setLiveConn(null)
        const pos = getCanvasPos(e.clientX, e.clientY)
        const hit = hitNode(nodesRef.current, pos.x, pos.y)

        if (hit && hit.id !== fromId) {
          // Connect two existing nodes
          try {
            const updated = await api.visionConnect(activeBoard?.id, fromId, hit.id)
            setNodesMap(prev => ({ ...prev, [hit.id]: updated }))
            const key = `${fromId}-${hit.id}`
            setNewConnKeys(prev => new Set([...prev, key]))
            setTimeout(() => setNewConnKeys(prev => { const s = new Set(prev); s.delete(key); return s }), 1200)
          } catch {}
        } else if (!hit) {
          // Create a new node connected from fromId
          setCreating({ x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2, fromId, value: '' })
        }
      }
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [activeBoard])  // activeBoard needed for connect

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        setCreating(null); setContextMenu(null)
        setLiveConn(null); connRef.current = null
        if (editingNodeId) setEditingNodeId(null)
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId && !editingNodeId
          && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        deleteNode(selectedNodeId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedNodeId, editingNodeId])

  // ── Canvas click-to-create ─────────────────────────────────────────────────

  function handleCanvasMouseDown(e) {
    console.log('[VisionBoard] handleCanvasMouseDown — button:', e.button, 'activeBoard:', activeBoard?.id ?? null, 'target === currentTarget:', e.target === e.currentTarget)
    // Dismiss menus
    setContextMenu(null)

    // Middle-click or shift+left = pan
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      e.preventDefault()
      panRef.current = { startMX: e.clientX, startMY: e.clientY, startSX: containerRef.current.scrollLeft, startSY: containerRef.current.scrollTop }
      return
    }

    // Left click on canvas (not on a node) = create
    if (e.button === 0 && activeBoard) {
      const pos = getCanvasPos(e.clientX, e.clientY)
      console.log('[VisionBoard] canvas click → creating node at canvas pos:', pos)
      setCreating({ x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2, fromId: null, value: '' })
      setSelectedNodeId(null)
    } else if (e.button === 0 && !activeBoard) {
      console.warn('[VisionBoard] canvas click ignored — no activeBoard')
    }
  }

  // ── Node interaction ───────────────────────────────────────────────────────

  function startNodeDrag(nodeId, clientX, clientY) {
    const n = nodesRef.current[nodeId]
    if (!n) return
    dragRef.current = { nodeId, startMX: clientX, startMY: clientY, startNX: n.x_position || 0, startNY: n.y_position || 0 }
    if (containerRef.current) containerRef.current.style.cursor = 'grabbing'
    setSelectedNodeId(nodeId)
    setContextMenu(null)
  }

  function startConnect(nodeId) {
    const n = nodesRef.current[nodeId]
    if (!n) return
    const x1 = (n.x_position || 0) + NODE_W
    const y1 = (n.y_position || 0) + NODE_H / 2
    connRef.current = { fromId: nodeId, x1, y1 }
    setLiveConn({ x1, y1, x2: x1, y2: y1 })
  }

  // ── Create node confirmation ───────────────────────────────────────────────

  async function confirmCreate() {
    if (!creating?.value?.trim() || !activeBoard) { setCreating(null); return }
    const { x, y, fromId, value } = creating
    setCreating(null)
    try {
      const node = await api.visionCreateNode(activeBoard.id, {
        title: value.trim(), x: Math.round(x), y: Math.round(y),
        parent_step_id: fromId || undefined,
      })
      setNodesMap(prev => ({ ...prev, [node.id]: node }))
      flashNew(node.id)
      setBoards(prev => prev.map(b => b.id === activeBoard.id ? { ...b, node_count: (b.node_count || 0) + 1 } : b))
      if (fromId) {
        const key = `${fromId}-${node.id}`
        setNewConnKeys(prev => new Set([...prev, key]))
        setTimeout(() => setNewConnKeys(prev => { const s = new Set(prev); s.delete(key); return s }), 1200)
      }
    } catch {}
  }

  function flashNew(id) {
    setNewNodeIds(prev => new Set([...prev, id]))
    setTimeout(() => setNewNodeIds(prev => { const s = new Set(prev); s.delete(id); return s }), 400)
  }

  // ── Inline edit ────────────────────────────────────────────────────────────

  async function submitEdit(nodeId) {
    const trimmed = editValue.trim()
    setEditingNodeId(null)
    if (!trimmed || trimmed === nodesRef.current[nodeId]?.title) return
    try {
      const updated = await api.visionUpdateNode(nodeId, { title: trimmed })
      setNodesMap(prev => ({ ...prev, [nodeId]: updated }))
    } catch {}
  }

  // ── Delete node ────────────────────────────────────────────────────────────

  function deleteNode(nodeId) {
    setDeletingIds(prev => new Set([...prev, nodeId]))
    setTimeout(async () => {
      try {
        await api.visionDeleteNode(nodeId)
        setNodesMap(prev => { const n = { ...prev }; delete n[nodeId]; return n })
        setBoards(prev => prev.map(b => b.id === activeBoard?.id ? { ...b, node_count: Math.max(0, (b.node_count || 1) - 1) } : b))
        if (selectedNodeId === nodeId) setSelectedNodeId(null)
      } catch {}
      setDeletingIds(prev => { const s = new Set(prev); s.delete(nodeId); return s })
    }, 220)
  }

  // ── Toggle completion ──────────────────────────────────────────────────────

  async function toggleNode(nodeId) {
    const n = nodesRef.current[nodeId]
    if (!n) return
    try {
      const updated = await api.visionUpdateNode(nodeId, { is_completed: !n.is_completed })
      setNodesMap(prev => ({ ...prev, [nodeId]: updated }))
    } catch {}
  }

  // ── AI Organize ────────────────────────────────────────────────────────────

  async function handleAiOrganize() {
    if (!activeBoard || aiOrganizing) return
    setAiOrganizing(true); setAiError(null)
    try {
      const res = await api.visionAiOrganize(activeBoard.id)
      const sorted = [...res.reordered].sort((a, b) => a.suggested_order - b.suggested_order)
      const cols = Math.ceil(Math.sqrt(Math.max(sorted.length, 1)))
      const GX = 220, GY = 110, SX = 80, SY = 80

      const posUpdates = {}
      sorted.forEach((item, i) => {
        const col = i % cols, row = Math.floor(i / cols)
        const n = nodesRef.current[item.id]
        if (n) posUpdates[item.id] = { ...n, x_position: SX + col * GX, y_position: SY + row * GY }
      })

      setNodesMap(prev => ({ ...prev, ...posUpdates }))
      for (const [id, n] of Object.entries(posUpdates)) {
        api.visionMoveNode(Number(id), Math.round(n.x_position), Math.round(n.y_position)).catch(() => {})
      }

      // Create missing steps suggested by the AI
      for (const step of res.missing_steps || []) {
        const after = step.connect_after_id
        const ref = after ? (posUpdates[after] || nodesRef.current[after]) : null
        const nx = ref ? (ref.x_position || 0) + GX : SX + sorted.length * GX
        const ny = ref ? (ref.y_position || 0) : SY
        try {
          const node = await api.visionCreateNode(activeBoard.id, {
            title: step.title, x: Math.round(nx), y: Math.round(ny + 18),
            parent_step_id: after || undefined,
          })
          setNodesMap(prev => ({ ...prev, [node.id]: node }))
          flashNew(node.id)
        } catch {}
      }
    } catch (err) { setAiError(err.message) }
    setAiOrganizing(false)
  }

  // ── AI Breakdown ───────────────────────────────────────────────────────────

  async function handleAiBreakdown(nodeId) {
    if (!activeBoard || aiBreaking) return
    setAiBreaking(true); setAiError(null)
    try {
      const res = await api.visionAiBreakdown(activeBoard.id, nodeId)
      for (const n of res.created_nodes) {
        setNodesMap(prev => ({ ...prev, [n.id]: n }))
        flashNew(n.id)
      }
    } catch (err) { setAiError(err.message) }
    setAiBreaking(false)
  }

  // ── Touch support ──────────────────────────────────────────────────────────

  function handleNodeTouchStart(e, nodeId) {
    if (e.touches.length !== 1) return
    const t = e.touches[0]
    const n = nodesRef.current[nodeId]
    if (!n) return
    touchRef.current = {
      nodeId,
      startX: t.clientX, startY: t.clientY,
      startNX: n.x_position || 0, startNY: n.y_position || 0,
      moved: false,
      longPress: setTimeout(() => {
        touchRef.current = null
        setContextMenu({ x: t.clientX, y: t.clientY, nodeId })
      }, 600),
    }
    setSelectedNodeId(nodeId)
  }

  useEffect(() => {
    function onTouchMove(e) {
      if (!touchRef.current) return
      const t = e.touches[0]
      const dx = t.clientX - touchRef.current.startX
      const dy = t.clientY - touchRef.current.startY
      if (Math.hypot(dx, dy) > 8) {
        clearTimeout(touchRef.current.longPress)
        touchRef.current.moved = true
        e.preventDefault()
        const { nodeId, startNX, startNY } = touchRef.current
        setNodesMap(prev => ({ ...prev, [nodeId]: { ...prev[nodeId], x_position: startNX + dx, y_position: startNY + dy } }))
      }
    }
    function onTouchEnd(e) {
      if (!touchRef.current) return
      clearTimeout(touchRef.current.longPress)
      if (touchRef.current.moved) {
        const { nodeId } = touchRef.current
        const n = nodesRef.current[nodeId]
        if (n) api.visionMoveNode(nodeId, Math.round(n.x_position || 0), Math.round(n.y_position || 0)).catch(() => {})
      }
      touchRef.current = null
    }
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
    return () => { window.removeEventListener('touchmove', onTouchMove); window.removeEventListener('touchend', onTouchEnd) }
  }, [])

  // ── Canvas mount check ─────────────────────────────────────────────────────

  useEffect(() => {
    if (containerRef.current) {
      const r = containerRef.current.getBoundingClientRect()
      console.log('[VisionBoard] canvas container mounted — rect:', JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) }))
    }
  }, [loadingBoards])

  // ── Derived ────────────────────────────────────────────────────────────────

  const nodeList = Object.values(nodesMap)
  const connections = nodeList.filter(n => n.parent_step_id != null && nodesMap[n.parent_step_id])
  const total = nodeList.length
  const done = nodeList.filter(n => n.is_completed).length
  const progress = total > 0 ? Math.round((done / total) * 100) : 0

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loadingBoards) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 64px)', gap: 10, color: 'rgba(255,255,255,.35)', fontSize: 14 }}>
        <Spin size={16} /> Loading…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
      <style>{CSS}</style>

      {/* ── Toolbar ── */}
      <div style={{
        height: 52, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
        background: 'rgba(0,0,0,.22)', backdropFilter: 'blur(14px)',
        borderBottom: '1px solid rgba(255,255,255,.06)', flexShrink: 0, zIndex: 50,
      }}>
        <BoardSelector
          boards={boards}
          activeBoardId={activeBoard?.id}
          onSelect={loadBoard}
          onCreateBoard={handleCreateBoard}
        />

        <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,.08)' }} />

        {/* Board title */}
        {activeBoard && (
          <p style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,.82)', margin: 0, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeBoard.title}
          </p>
        )}

        <div style={{ flex: 1 }} />

        {/* Progress */}
        {activeBoard && total > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,.38)', whiteSpace: 'nowrap' }}>{done}/{total} complete</span>
            <div style={{ width: 56, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 2, width: `${progress}%`, background: done === total ? '#10b981' : '#6366f1', transition: 'width 400ms ease' }} />
            </div>
          </div>
        )}

        {/* AI Organize */}
        {activeBoard && (
          <button onClick={handleAiOrganize} disabled={aiOrganizing || total === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8,
              background: 'rgba(99,102,241,.14)', border: '1px solid rgba(99,102,241,.28)',
              color: 'rgba(165,180,252,.85)', fontSize: 12, cursor: aiOrganizing || total === 0 ? 'default' : 'pointer',
              opacity: total === 0 ? .38 : 1, transition: 'opacity 150ms',
            }}>
            {aiOrganizing ? <Spin size={12} /> : (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M2 3h8M2 6h5M2 9h7" strokeLinecap="round"/>
              </svg>
            )}
            AI Organize
          </button>
        )}

        {/* AI Break Down */}
        {activeBoard && (
          <button onClick={() => selectedNodeId && handleAiBreakdown(selectedNodeId)} disabled={!selectedNodeId || aiBreaking}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8,
              background: 'rgba(139,92,246,.12)', border: '1px solid rgba(139,92,246,.24)',
              color: 'rgba(196,181,253,.82)', fontSize: 12, cursor: selectedNodeId ? 'pointer' : 'default',
              opacity: selectedNodeId ? 1 : .35, transition: 'opacity 150ms',
            }}>
            {aiBreaking ? <Spin size={12} /> : '✨'}
            AI Break Down
          </button>
        )}
      </div>

      {/* ── Canvas ── */}
      <div
        ref={containerRef}
        style={{
          flex: 1, overflow: 'auto', position: 'relative',
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,.045) 1px, transparent 1px)',
          backgroundSize: '30px 30px',
          cursor: liveConn ? 'crosshair' : panRef.current ? 'grabbing' : 'default',
        }}
      >
        {/* Inner canvas — large fixed area */}
        <div
          style={{ position: 'relative', width: CANVAS_W, height: CANVAS_H }}
          onMouseDown={e => {
            // Only fire if clicking the canvas itself (not a child node)
            if (e.target !== e.currentTarget) {
              console.log('[VisionBoard] inner onMouseDown swallowed — target is child:', e.target.tagName, e.target)
              return
            }
            handleCanvasMouseDown(e)
          }}
        >
          {/* SVG layer */}
          <svg style={{ position: 'absolute', inset: 0, width: CANVAS_W, height: CANVAS_H, pointerEvents: 'none', overflow: 'visible' }}>
            <defs>
              <linearGradient id="cg" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(99,102,241,.52)"/>
                <stop offset="100%" stopColor="rgba(139,92,246,.36)"/>
              </linearGradient>
            </defs>
            {connections.map(n => {
              const p = nodesMap[n.parent_step_id]
              const x1 = (p.x_position || 0) + NODE_W, y1 = (p.y_position || 0) + NODE_H / 2
              const x2 = n.x_position || 0, y2 = (n.y_position || 0) + NODE_H / 2
              const d = bezier(x1, y1, x2, y2)
              const key = `${n.parent_step_id}-${n.id}`
              const isNew = newConnKeys.has(key)
              const len = Math.hypot(x2 - x1, y2 - y1) + 120
              return (
                <path key={key} d={d} fill="none" stroke="url(#cg)" strokeWidth="2" strokeLinecap="round"
                  style={isNew ? { strokeDasharray: len, strokeDashoffset: len, animation: `vb-ln .35s ease-out forwards` } : undefined}
                />
              )
            })}
            {liveConn && (
              <path d={bezier(liveConn.x1, liveConn.y1, liveConn.x2, liveConn.y2)}
                fill="none" stroke="rgba(99,102,241,.48)" strokeWidth="2" strokeDasharray="6 5" strokeLinecap="round"/>
            )}
          </svg>

          {/* Nodes */}
          {nodeList.length > 0 && console.log('[VisionBoard] rendering', nodeList.length, 'nodes:', nodeList.map(n => n.id))}
          {nodeList.map(node => (
            <CanvasNode
              key={node.id}
              node={node}
              isNew={newNodeIds.has(node.id)}
              isDeleting={deletingIds.has(node.id)}
              isSelected={selectedNodeId === node.id}
              isHovered={hoveredNodeId === node.id}
              isEditing={editingNodeId === node.id}
              editValue={editValue}
              onEditChange={setEditValue}
              onEditSubmit={() => submitEdit(node.id)}
              onEditCancel={() => setEditingNodeId(null)}
              onMouseEnter={() => setHoveredNodeId(node.id)}
              onMouseLeave={() => setHoveredNodeId(prev => prev === node.id ? null : prev)}
              onMouseDown={e => {
                if (e.button !== 0) return
                e.stopPropagation()
                startNodeDrag(node.id, e.clientX, e.clientY)
              }}
              onHandleMouseDown={e => { e.stopPropagation(); startConnect(node.id) }}
              onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id }); setSelectedNodeId(node.id) }}
              onDoubleClick={e => { e.stopPropagation(); setEditingNodeId(node.id); setEditValue(node.title) }}
              onToggle={() => toggleNode(node.id)}
              onTouchStart={e => { e.stopPropagation(); handleNodeTouchStart(e, node.id) }}
            />
          ))}

          {/* New node input */}
          {creating && (
            <div style={{ position: 'absolute', left: creating.x, top: creating.y, width: NODE_W, zIndex: 20, animation: 'vb-in .2s ease-out forwards' }}>
              <form onSubmit={e => { e.preventDefault(); confirmCreate() }}>
                <input
                  autoFocus
                  value={creating.value}
                  onChange={e => setCreating(p => ({ ...p, value: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Escape') setCreating(null) }}
                  onBlur={() => { if (!creating.value.trim()) setCreating(null); else confirmCreate() }}
                  placeholder="Node title…"
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 12, fontSize: 13, fontWeight: 500,
                    background: 'rgba(255,255,255,.07)', backdropFilter: 'blur(14px)',
                    border: '1px solid rgba(99,102,241,.48)',
                    color: 'white', outline: 'none',
                    boxShadow: '0 0 18px rgba(99,102,241,.22)',
                    boxSizing: 'border-box',
                  }}
                />
              </form>
            </div>
          )}

          {/* Empty state */}
          {activeBoard && total === 0 && !creating && (
            <div style={{ position: 'absolute', left: '50%', top: '38%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
              <p style={{ fontSize: 16, color: 'rgba(255,255,255,.18)', margin: '0 0 8px' }}>Click anywhere to add your first node</p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,.1)', margin: 0 }}>Drag the dot on a node's right edge to connect</p>
            </div>
          )}

          {!activeBoard && !loadingBoards && (
            <div style={{ position: 'absolute', left: '50%', top: '38%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
              <p style={{ fontSize: 22, color: 'rgba(255,255,255,.22)', margin: '0 0 20px' }}>No board selected</p>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,.15)', margin: 0 }}>Use the Boards menu above to create one</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Context menu ── */}
      {contextMenu && (
        <CtxMenu
          x={contextMenu.x} y={contextMenu.y}
          onAsk={() => setTutorNodeId(contextMenu.nodeId)}
          onBreakdown={() => handleAiBreakdown(contextMenu.nodeId)}
          onEdit={() => { setEditingNodeId(contextMenu.nodeId); setEditValue(nodesRef.current[contextMenu.nodeId]?.title || '') }}
          onDelete={() => deleteNode(contextMenu.nodeId)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* ── Tutor popup ── */}
      {tutorNodeId && <TutorPopup nodeId={tutorNodeId} onClose={() => setTutorNodeId(null)} />}

      {/* ── AI error toast ── */}
      {aiError && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(239,68,68,.14)', border: '1px solid rgba(239,68,68,.28)',
          color: '#fca5a5', borderRadius: 10, padding: '10px 16px', fontSize: 13, zIndex: 600,
          backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,.4)',
        }}>
          {aiError}
          <button onClick={() => setAiError(null)} style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
        </div>
      )}
    </div>
  )
}
