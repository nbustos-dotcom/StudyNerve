import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'

// ── Constants ─────────────────────────────────────────────────────────────────

const NODE_W = 180   // card width
const NODE_H = 52    // assumed card height for SVG connection math

// ── Bezier path ───────────────────────────────────────────────────────────────

function bezier(x1, y1, x2, y2) {
  const cx = Math.max(Math.abs(x2 - x1) * 0.5, 50)
  return `M ${x1} ${y1} C ${x1 + cx} ${y1}, ${x2 - cx} ${y2}, ${x2} ${y2}`
}

// ── Tutor Modal ───────────────────────────────────────────────────────────────

function TutorModal({ nodeId, onClose }) {
  const [q, setQ] = useState('')
  const [answer, setAnswer] = useState(null)
  const [busy, setBusy] = useState(false)

  async function ask(e) {
    e.preventDefault()
    if (!q.trim() || busy) return
    setBusy(true)
    try {
      const res = await api.visionAskNode(nodeId, q.trim())
      setAnswer(res.answer)
    } catch (err) {
      setAnswer(`Error: ${err.message}`)
    }
    setBusy(false)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseDown={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: 420, maxWidth: '90vw', padding: 24, borderRadius: 16,
        background: 'rgba(10,10,26,.96)', border: '1px solid rgba(99,102,241,.3)',
        backdropFilter: 'blur(20px)', boxShadow: '0 24px 64px rgba(0,0,0,.6)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,.88)' }}>Ask Tutor</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <form onSubmit={ask} style={{ display: 'flex', gap: 8 }}>
          <input
            autoFocus value={q} onChange={e => setQ(e.target.value)}
            placeholder="Ask about this node…"
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 13,
              background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
              color: 'white', outline: 'none',
            }}
          />
          <button type="submit" disabled={!q.trim() || busy} style={{
            padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
            background: 'rgba(99,102,241,.65)', border: 'none', color: 'white',
            cursor: busy ? 'wait' : 'pointer',
          }}>
            {busy ? '…' : 'Ask'}
          </button>
        </form>
        {answer && (
          <div style={{
            marginTop: 14, padding: '12px 14px', borderRadius: 10, fontSize: 13, lineHeight: 1.65,
            background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.18)',
            color: 'rgba(255,255,255,.85)', whiteSpace: 'pre-wrap',
          }}>
            {answer}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Context Menu ──────────────────────────────────────────────────────────────

function CtxMenu({ x, y, onEdit, onDelete, onTutor, onClose }) {
  useEffect(() => {
    function dismiss(e) { if (!e.target.closest('[data-ctx]')) onClose() }
    window.addEventListener('mousedown', dismiss)
    return () => window.removeEventListener('mousedown', dismiss)
  }, [onClose])

  const items = [
    { label: 'Edit',      icon: '✏️', action: onEdit },
    { label: 'Ask Tutor', icon: '💬', action: onTutor },
    { label: 'Delete',    icon: '🗑', action: onDelete, danger: true },
  ]

  return (
    <div data-ctx="1" style={{
      position: 'fixed', left: x, top: y, zIndex: 400,
      background: 'rgba(10,10,26,.95)', backdropFilter: 'blur(18px)',
      border: '1px solid rgba(255,255,255,.1)', borderRadius: 12,
      padding: 4, minWidth: 152, boxShadow: '0 10px 36px rgba(0,0,0,.5)',
    }}>
      {items.map(it => (
        <button key={it.label}
          onClick={() => { it.action(); onClose() }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', padding: '7px 12px', borderRadius: 8,
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, color: it.danger ? '#f87171' : 'rgba(255,255,255,.8)',
          }}
          onMouseEnter={e => e.currentTarget.style.background = it.danger ? 'rgba(248,113,113,.1)' : 'rgba(255,255,255,.07)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <span style={{ width: 16, textAlign: 'center' }}>{it.icon}</span>
          {it.label}
        </button>
      ))}
    </div>
  )
}

// ── Board List ────────────────────────────────────────────────────────────────

function BoardList({ onOpen }) {
  const [boards, setBoards] = useState([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.visionBoards()
      .then(bs => setBoards(bs))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!title.trim() || saving) return
    setSaving(true); setError(null)
    try {
      const b = await api.visionCreate({ title: title.trim() })
      setBoards(prev => [{ id: b.id, title: b.title, node_count: 0, created_at: b.created_at }, ...prev])
      setTitle('')
    } catch (err) {
      setError(err.message || 'Failed to create board')
    }
    setSaving(false)
  }

  return (
    <div style={{ padding: '40px 32px', maxWidth: 860, margin: '0 auto' }}>
      <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,.9)' }}>
        Vision Boards
      </h1>
      <p style={{ margin: '0 0 32px', fontSize: 13, color: 'rgba(255,255,255,.32)' }}>
        Plan goals visually. Double-click the canvas to add nodes.
      </p>

      <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, marginBottom: 36 }}>
        <input
          value={title} onChange={e => setTitle(e.target.value)}
          placeholder="New board title…"
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 10, fontSize: 14,
            background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
            color: 'white', outline: 'none',
          }}
        />
        <button type="submit" disabled={!title.trim() || saving} style={{
          padding: '10px 20px', borderRadius: 10, fontSize: 14, fontWeight: 500,
          background: 'rgba(99,102,241,.72)', border: '1px solid rgba(99,102,241,.4)',
          color: 'white', cursor: title.trim() && !saving ? 'pointer' : 'default',
          opacity: title.trim() && !saving ? 1 : 0.5,
        }}>
          {saving ? '…' : '+ New Board'}
        </button>
      </form>

      {error && <p style={{ marginBottom: 16, fontSize: 13, color: '#f87171' }}>{error}</p>}

      {loading ? (
        <p style={{ color: 'rgba(255,255,255,.3)', fontSize: 14 }}>Loading…</p>
      ) : boards.length === 0 ? (
        <p style={{ color: 'rgba(255,255,255,.25)', fontSize: 14 }}>No boards yet. Create one above.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
          {boards.map(b => (
            <div key={b.id} onClick={() => onOpen(b.id)} style={{
              padding: '20px 22px', borderRadius: 14, cursor: 'pointer',
              background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.09)',
              backdropFilter: 'blur(12px)', transition: 'background 140ms, border-color 140ms',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,.09)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,.28)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.09)' }}
            >
              <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,.88)' }}>{b.title}</p>
              <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,.3)' }}>
                {b.node_count ?? 0} node{b.node_count !== 1 ? 's' : ''}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Board Canvas ──────────────────────────────────────────────────────────────

function BoardCanvas({ boardId, onBack }) {
  const [board, setBoard] = useState(null)
  const [nodes, setNodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // New-node input
  const [pending, setPending] = useState(null)   // { x, y, value, fromId } | null
  const confirmingRef = useRef(false)            // guard against double-save (Enter + blur)

  // Inline editing
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')

  // Hover / selection
  const [hoveredId, setHoveredId] = useState(null)

  // Live connection line while dragging a handle
  const [liveConn, setLiveConn] = useState(null)  // { x1, y1, x2, y2 }

  // AI organize
  const [aiOrganizing, setAiOrganizing] = useState(false)

  // Context menu + tutor
  const [ctxMenu, setCtxMenu] = useState(null)    // { x, y, nodeId }
  const [tutorNodeId, setTutorNodeId] = useState(null)

  // Refs — used inside window event listeners to avoid stale closures
  const innerRef    = useRef(null)   // the 4000×3000 canvas div
  const nodesRef    = useRef([])     // mirror of nodes state
  const boardIdRef  = useRef(boardId)
  const dragRef     = useRef(null)   // { nodeId, startMX, startMY, startNX, startNY }
  const connectRef  = useRef(null)   // { fromNodeId, x1, y1 }

  nodesRef.current   = nodes
  boardIdRef.current = boardId

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    api.visionBoard(boardId)
      .then(b => { setBoard(b); setNodes(b.nodes || []) })
      .catch(err => setError(err.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [boardId])

  // ── Coordinate helper ─────────────────────────────────────────────────────
  // Convert browser client coords → canvas (inner div) coords.
  // innerRef.getBoundingClientRect() already accounts for scroll offset
  // because the inner div's visual position shifts as the outer container scrolls.

  function clientToCanvas(clientX, clientY) {
    const r = innerRef.current.getBoundingClientRect()
    return { x: clientX - r.left, y: clientY - r.top }
  }

  // ── Hit-test: node at canvas position ─────────────────────────────────────

  function hitNode(cx, cy, excludeId = null) {
    return nodesRef.current.find(n =>
      n.id !== excludeId &&
      cx >= n.x_position && cx <= n.x_position + NODE_W &&
      cy >= n.y_position && cy <= n.y_position + NODE_H
    )
  }

  // ── Global mouse handlers (mounted once) ──────────────────────────────────

  useEffect(() => {
    function onMove(e) {
      // Drag node
      if (dragRef.current) {
        const d = dragRef.current
        const dx = e.clientX - d.startMX
        const dy = e.clientY - d.startMY
        setNodes(prev => prev.map(n =>
          n.id === d.nodeId
            ? { ...n, x_position: d.startNX + dx, y_position: d.startNY + dy }
            : n
        ))
      }
      // Draw connection line
      if (connectRef.current && innerRef.current) {
        const pos = clientToCanvas(e.clientX, e.clientY)
        setLiveConn(prev => prev ? { ...prev, x2: pos.x, y2: pos.y } : null)
      }
    }

    async function onUp(e) {
      // Finish drag — save new position
      if (dragRef.current) {
        const { nodeId } = dragRef.current
        dragRef.current = null
        const n = nodesRef.current.find(n => n.id === nodeId)
        if (n) {
          api.visionMoveNode(nodeId, Math.round(n.x_position), Math.round(n.y_position)).catch(() => {})
        }
        return
      }

      // Finish connection drag
      if (connectRef.current) {
        const { fromNodeId } = connectRef.current
        connectRef.current = null
        setLiveConn(null)

        if (!innerRef.current) return
        const pos = clientToCanvas(e.clientX, e.clientY)
        const hit = hitNode(pos.x, pos.y, fromNodeId)

        if (hit) {
          // Drop on existing node → connect them
          try {
            const updated = await api.visionConnect(boardIdRef.current, fromNodeId, hit.id)
            setNodes(prev => prev.map(n => n.id === hit.id ? updated : n))
          } catch {}
        } else {
          // Drop on empty space → create a new node connected from source
          confirmingRef.current = false
          setPending({ x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2, value: '', fromId: fromNodeId })
        }
      }
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])  // mount-only — accesses all mutable state via refs or stable setters

  // ── Create node (pending input) ───────────────────────────────────────────
  // Called by both Enter (onKeyDown) and blur (onBlur).
  // confirmingRef prevents the double-save that would otherwise happen when
  // Enter fires first → setPending(null) → input unmounts → blur fires again.

  async function confirmNode() {
    if (confirmingRef.current) return
    const snap = pending        // capture from closure before any state change
    if (!snap?.value?.trim()) { setPending(null); return }
    confirmingRef.current = true
    setPending(null)
    try {
      const node = await api.visionCreateNode(boardIdRef.current, {
        title: snap.value.trim(),
        x: Math.round(snap.x),
        y: Math.round(snap.y),
        parent_step_id: snap.fromId ?? undefined,
      })
      setNodes(prev => [...prev, node])
    } catch (err) {
      console.error('[VisionBoard] create node error:', err)
    }
    confirmingRef.current = false
  }

  // Double-click on empty canvas → open a pending node input at that position
  function handleCanvasDblClick(e) {
    if (e.target !== e.currentTarget) return  // clicked on a child (node, input)
    const pos = clientToCanvas(e.clientX, e.clientY)
    confirmingRef.current = false
    setPending({ x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2, value: '', fromId: null })
  }

  // ── Node actions ──────────────────────────────────────────────────────────

  async function toggleNode(nodeId) {
    const n = nodesRef.current.find(n => n.id === nodeId)
    if (!n) return
    try {
      const updated = await api.visionUpdateNode(nodeId, { is_completed: !n.is_completed })
      setNodes(prev => prev.map(x => x.id === nodeId ? updated : x))
    } catch {}
  }

  async function deleteNode(nodeId) {
    try {
      await api.visionDeleteNode(nodeId)
      // Remove node and orphan its children (clear their parent_step_id in local state)
      setNodes(prev => prev
        .filter(n => n.id !== nodeId)
        .map(n => n.parent_step_id === nodeId ? { ...n, parent_step_id: null } : n)
      )
    } catch {}
  }

  async function submitEdit(nodeId) {
    const trimmed = editValue.trim()
    setEditingId(null)
    const orig = nodesRef.current.find(n => n.id === nodeId)
    if (!trimmed || trimmed === orig?.title) return
    try {
      const updated = await api.visionUpdateNode(nodeId, { title: trimmed })
      setNodes(prev => prev.map(n => n.id === nodeId ? updated : n))
    } catch {}
  }

  // ── AI Organize ──────────────────────────────────────────────────────────
  // Asks the AI for a suggested ordering, then snaps all nodes into a clean
  // left-to-right grid sorted by suggested_order and saves all new positions.

  async function handleAiOrganize() {
    if (!nodes.length || aiOrganizing) return
    setAiOrganizing(true)
    try {
      const res = await api.visionAiOrganize(boardId)
      const sorted = [...res.reordered].sort((a, b) => a.suggested_order - b.suggested_order)
      const COLS = 5, GX = 220, GY = 130, SX = 80, SY = 80
      const moves = {}
      sorted.forEach((item, i) => {
        const col = i % COLS
        const row = Math.floor(i / COLS)
        const n = nodesRef.current.find(n => n.id === item.id)
        if (n) moves[item.id] = { ...n, x_position: SX + col * GX, y_position: SY + row * GY }
      })
      setNodes(prev => prev.map(n => moves[n.id] ? moves[n.id] : n))
      // Persist all new positions
      for (const [idStr, n] of Object.entries(moves)) {
        api.visionMoveNode(Number(idStr), Math.round(n.x_position), Math.round(n.y_position)).catch(() => {})
      }
    } catch (err) {
      console.error('[VisionBoard] ai organize error:', err)
    }
    setAiOrganizing(false)
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const total = nodes.length
  const done  = nodes.filter(n => n.is_completed).length
  const connections = nodes.filter(n =>
    n.parent_step_id != null && nodes.some(p => p.id === n.parent_step_id)
  )

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 64px)', color: 'rgba(255,255,255,.3)', fontSize: 14 }}>
      Loading…
    </div>
  )

  if (error) return (
    <div style={{ padding: 40, color: '#f87171', fontSize: 14 }}>
      {error}{' '}
      <button onClick={onBack} style={{ color: 'rgba(255,255,255,.5)', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 8 }}>← Back</button>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px',
        height: 52, flexShrink: 0,
        background: 'rgba(0,0,0,.3)', borderBottom: '1px solid rgba(255,255,255,.06)',
      }}>
        <button onClick={onBack} style={{
          padding: '5px 11px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
          background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
          color: 'rgba(255,255,255,.65)',
        }}>← Back</button>

        <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,.82)' }}>
          {board?.title}
        </span>

        <div style={{ flex: 1 }} />

        {total > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,.38)', whiteSpace: 'nowrap' }}>
              {done} / {total} done
            </span>
            <div style={{ width: 80, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                width: `${Math.round((done / total) * 100)}%`,
                background: done === total ? '#10b981' : '#6366f1',
                transition: 'width 300ms ease',
              }} />
            </div>
          </div>
        )}

        <button
          onClick={handleAiOrganize}
          disabled={aiOrganizing || nodes.length === 0}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
            background: 'rgba(99,102,241,.13)', border: '1px solid rgba(99,102,241,.28)',
            color: 'rgba(165,180,252,.85)', cursor: nodes.length && !aiOrganizing ? 'pointer' : 'default',
            opacity: nodes.length && !aiOrganizing ? 1 : 0.4,
            whiteSpace: 'nowrap',
          }}
        >
          {aiOrganizing ? '…' : '✨ AI Organize'}
        </button>

        <span style={{ fontSize: 12, color: 'rgba(255,255,255,.22)', whiteSpace: 'nowrap' }}>
          dbl-click to add · drag handle to connect
        </span>
      </div>

      {/* ── Scroll wrapper — transparent so the fixed NeuralBackground shows through ── */}
      <div style={{
        flex: 1, overflow: 'auto', minHeight: 0,
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,.06) 1px, transparent 1px)',
        backgroundSize: '30px 30px',
      }}>

        {/* ── Inner canvas (4000×3000) ── */}
        <div
          ref={innerRef}
          style={{ position: 'relative', width: 4000, height: 3000 }}
          onDoubleClick={handleCanvasDblClick}
          onMouseDown={e => { if (e.button === 0) setCtxMenu(null) }}
        >

          {/* ── SVG: connections + live line ── */}
          <svg style={{
            position: 'absolute', inset: 0, width: 4000, height: 3000,
            pointerEvents: 'none', overflow: 'visible',
          }}>
            {connections.map(child => {
              const parent = nodes.find(n => n.id === child.parent_step_id)
              const x1 = parent.x_position + NODE_W
              const y1 = parent.y_position + NODE_H / 2
              const x2 = child.x_position
              const y2 = child.y_position + NODE_H / 2
              return (
                <path
                  key={`${parent.id}-${child.id}`}
                  d={bezier(x1, y1, x2, y2)}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="2"
                  strokeOpacity="0.4"
                  strokeLinecap="round"
                />
              )
            })}
            {liveConn && (
              <path
                d={bezier(liveConn.x1, liveConn.y1, liveConn.x2, liveConn.y2)}
                fill="none"
                stroke="#6366f1"
                strokeWidth="2"
                strokeOpacity="0.65"
                strokeDasharray="6 4"
                strokeLinecap="round"
              />
            )}
          </svg>

          {/* ── Nodes ── */}
          {nodes.map(node => {
            const isEditing = editingId === node.id
            const isHovered = hoveredId === node.id
            const done      = node.is_completed
            // Handle anchor point in canvas space (right-center of node)
            const hx = node.x_position + NODE_W
            const hy = node.y_position + NODE_H / 2

            return (
              <div
                key={node.id}
                style={{
                  position: 'absolute',
                  left: node.x_position,
                  top: node.y_position,
                  width: NODE_W,
                  zIndex: 2,
                  userSelect: 'none',
                }}
                onMouseEnter={() => setHoveredId(node.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Card */}
                <div
                  style={{
                    padding: '10px 14px',
                    minHeight: NODE_H,
                    background: done ? 'rgba(16,185,129,.07)' : 'rgba(255,255,255,.05)',
                    border: `1px solid ${done ? 'rgba(16,185,129,.3)' : 'rgba(255,255,255,.11)'}`,
                    borderLeft: done ? '3px solid rgba(16,185,129,.6)' : undefined,
                    borderRadius: 12,
                    backdropFilter: 'blur(14px)',
                    boxShadow: '0 2px 10px rgba(0,0,0,.28)',
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    cursor: isEditing ? 'default' : 'grab',
                    boxSizing: 'border-box',
                  }}
                  onMouseDown={e => {
                    if (e.button !== 0 || isEditing) return
                    e.stopPropagation()
                    dragRef.current = {
                      nodeId: node.id,
                      startMX: e.clientX, startMY: e.clientY,
                      startNX: node.x_position, startNY: node.y_position,
                    }
                  }}
                  onDoubleClick={e => {
                    e.stopPropagation()
                    setEditingId(node.id)
                    setEditValue(node.title)
                  }}
                  onContextMenu={e => {
                    e.preventDefault(); e.stopPropagation()
                    setCtxMenu({ x: e.clientX, y: e.clientY, nodeId: node.id })
                  }}
                >
                  {/* Checkbox */}
                  <div
                    onClick={e => { e.stopPropagation(); toggleNode(node.id) }}
                    onMouseDown={e => e.stopPropagation()}
                    style={{
                      flexShrink: 0, marginTop: 2,
                      width: 14, height: 14, borderRadius: 3, cursor: 'pointer',
                      background: done ? 'rgba(16,185,129,.25)' : 'rgba(255,255,255,.07)',
                      border: `1px solid ${done ? 'rgba(16,185,129,.5)' : 'rgba(255,255,255,.15)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {done && (
                      <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                        <path d="M1 4.5l2.5 2.5 4-5" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>

                  {/* Title / inline edit */}
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); submitEdit(node.id) }
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onBlur={() => submitEdit(node.id)}
                      onClick={e => e.stopPropagation()}
                      onMouseDown={e => e.stopPropagation()}
                      style={{
                        flex: 1, background: 'none', border: 'none', outline: 'none',
                        color: 'white', fontSize: 13, fontWeight: 500,
                      }}
                    />
                  ) : (
                    <p style={{
                      margin: 0, flex: 1, fontSize: 13, fontWeight: 500, lineHeight: 1.45,
                      color: done ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.88)',
                      textDecoration: done ? 'line-through' : undefined,
                      wordBreak: 'break-word',
                    }}>
                      {node.title}
                    </p>
                  )}
                </div>

                {/* Connection handle — right edge, visible on hover */}
                <div
                  style={{
                    position: 'absolute',
                    right: -5, top: '50%', transform: 'translateY(-50%)',
                    width: 10, height: 10, borderRadius: '50%',
                    background: '#6366f1', border: '2px solid rgba(165,180,252,.55)',
                    cursor: 'crosshair', zIndex: 3,
                    opacity: isHovered ? 1 : 0,
                    transition: 'opacity 150ms',
                    boxShadow: '0 0 8px rgba(99,102,241,.5)',
                  }}
                  onMouseDown={e => {
                    e.stopPropagation(); e.preventDefault()
                    connectRef.current = { fromNodeId: node.id, x1: hx, y1: hy }
                    setLiveConn({ x1: hx, y1: hy, x2: hx, y2: hy })
                  }}
                />

                {/* Delete button — top-right corner, visible on hover */}
                {isHovered && (
                  <button
                    onClick={e => { e.stopPropagation(); deleteNode(node.id) }}
                    onMouseDown={e => e.stopPropagation()}
                    style={{
                      position: 'absolute', top: -7, right: -7,
                      width: 18, height: 18, borderRadius: '50%',
                      background: 'rgba(239,68,68,.8)', border: '1.5px solid rgba(254,202,202,.3)',
                      color: 'white', fontSize: 11, lineHeight: 1, fontWeight: 600,
                      cursor: 'pointer', zIndex: 5,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 2px 8px rgba(239,68,68,.35)',
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            )
          })}

          {/* ── Pending node input ── */}
          {pending && (
            <div style={{ position: 'absolute', left: pending.x, top: pending.y, width: NODE_W, zIndex: 10 }}>
              <input
                autoFocus
                value={pending.value}
                onChange={e => setPending(p => ({ ...p, value: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); confirmNode() }
                  if (e.key === 'Escape') { confirmingRef.current = true; setPending(null) }
                }}
                onBlur={confirmNode}
                placeholder="Node title…"
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 12, fontSize: 13, fontWeight: 500,
                  background: 'rgba(10,10,26,.92)', border: '1px solid rgba(99,102,241,.55)',
                  color: 'white', outline: 'none', boxSizing: 'border-box',
                  boxShadow: '0 0 18px rgba(99,102,241,.2)',
                }}
              />
              <p style={{ margin: '4px 0 0 2px', fontSize: 11, color: 'rgba(255,255,255,.25)', pointerEvents: 'none' }}>
                Enter to save · Esc to cancel
              </p>
            </div>
          )}

          {/* ── Empty state hint ── */}
          {nodes.length === 0 && !pending && (
            <div style={{
              position: 'absolute', left: '50%', top: '40%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center', pointerEvents: 'none',
            }}>
              <p style={{ margin: 0, fontSize: 15, color: 'rgba(255,255,255,.14)' }}>
                Double-click anywhere to add your first node
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Context menu ── */}
      {ctxMenu && (
        <CtxMenu
          x={ctxMenu.x} y={ctxMenu.y}
          onEdit={() => {
            const n = nodesRef.current.find(n => n.id === ctxMenu.nodeId)
            setEditingId(ctxMenu.nodeId)
            setEditValue(n?.title || '')
          }}
          onDelete={() => deleteNode(ctxMenu.nodeId)}
          onTutor={() => setTutorNodeId(ctxMenu.nodeId)}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* ── Tutor modal ── */}
      {tutorNodeId && (
        <TutorModal nodeId={tutorNodeId} onClose={() => setTutorNodeId(null)} />
      )}
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function VisionBoard() {
  const [activeBoardId, setActiveBoardId] = useState(null)

  return activeBoardId
    ? <BoardCanvas boardId={activeBoardId} onBack={() => setActiveBoardId(null)} />
    : <BoardList onOpen={setActiveBoardId} />
}
