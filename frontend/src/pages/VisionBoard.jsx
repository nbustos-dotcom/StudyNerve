import { useEffect, useRef, useState, useMemo } from 'react'
import { api } from '../api/client'

// ── CSS Animations ────────────────────────────────────────────────────────────

const VB_STYLES = `
  @keyframes vb-float {
    0%, 100% { transform: translateY(0px); }
    50%       { transform: translateY(-3px); }
  }
  @keyframes vb-float-slow {
    0%, 100% { transform: translateY(0px); }
    50%       { transform: translateY(-1.5px); }
  }
  @keyframes vb-border-glow {
    0%   { box-shadow: 0 0 0 1px rgba(99,102,241,.28),  0 2px 12px rgba(0,0,0,.3); }
    33%  { box-shadow: 0 0 0 1px rgba(139,92,246,.34),  0 2px 12px rgba(0,0,0,.3); }
    66%  { box-shadow: 0 0 0 1px rgba(59,130,246,.28),  0 2px 12px rgba(0,0,0,.3); }
    100% { box-shadow: 0 0 0 1px rgba(99,102,241,.28),  0 2px 12px rgba(0,0,0,.3); }
  }
  @keyframes vb-border-glow-done {
    0%   { box-shadow: 0 0 0 1px rgba(16,185,129,.35), 0 2px 12px rgba(0,0,0,.3); }
    50%  { box-shadow: 0 0 0 1.5px rgba(16,185,129,.55), 0 4px 18px rgba(16,185,129,.12); }
    100% { box-shadow: 0 0 0 1px rgba(16,185,129,.35), 0 2px 12px rgba(0,0,0,.3); }
  }
  @keyframes vb-burst {
    0%   { opacity: .65; transform: scale(.3); }
    100% { opacity: 0;   transform: scale(3.8); }
  }
  @keyframes vb-note-in {
    0%   { opacity: 0; transform: translateY(-8px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes vb-star-drift {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33%       { transform: translate(1px, -3px) scale(1.15); }
    66%       { transform: translate(-1px, -1px) scale(0.88); }
  }
  @keyframes vb-pop-in {
    0%   { opacity: 0; transform: scale(0.45) translateY(12px); }
    70%  { transform: scale(1.06) translateY(-2px); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes vb-conn-draw {
    0%   { opacity: 0; }
    100% { opacity: 1; }
  }
  @keyframes vb-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
`

// ── Constants ─────────────────────────────────────────────────────────────────

const NODE_W = 180
const NODE_H = 52

// ── Bezier path ───────────────────────────────────────────────────────────────

function bezier(x1, y1, x2, y2) {
  const cx = Math.max(Math.abs(x2 - x1) * 0.5, 50)
  return `M ${x1} ${y1} C ${x1 + cx} ${y1}, ${x2 - cx} ${y2}, ${x2} ${y2}`
}

// ── Star Field ────────────────────────────────────────────────────────────────

function StarField() {
  const stars = useMemo(() =>
    Array.from({ length: 38 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 1.2 + 0.8,
      opacity: Math.random() * 0.2 + 0.08,
      dur: (Math.random() * 30 + 60).toFixed(1),
      delay: -(Math.random() * 90).toFixed(1),
    }))
  , [])

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
      {stars.map(s => (
        <div key={s.id} style={{
          position: 'absolute',
          left: `${s.x}%`, top: `${s.y}%`,
          width: s.size, height: s.size,
          borderRadius: '50%',
          background: 'white',
          opacity: s.opacity,
          animation: `vb-star-drift ${s.dur}s ${s.delay}s ease-in-out infinite`,
          willChange: 'transform',
        }} />
      ))}
    </div>
  )
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

// ── AI Vision Modal ───────────────────────────────────────────────────────────

function AiVisionModal({ onSubmit, onClose, busy }) {
  const [desc, setDesc] = useState('')

  function handleKey(e) {
    if (e.key === 'Escape') onClose()
    // Ctrl/Cmd+Enter submits
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      if (desc.trim() && !busy) onSubmit(desc.trim())
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseDown={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: 560, maxWidth: '92vw',
        background: 'rgba(8,8,22,.96)',
        border: '1px solid rgba(99,102,241,.35)',
        borderRadius: 20,
        padding: '28px 28px 24px',
        backdropFilter: 'blur(24px)',
        boxShadow: '0 32px 80px rgba(0,0,0,.7), 0 0 0 1px rgba(99,102,241,.1)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 18 }}>🪐</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,.92)' }}>AI Vision</span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,.38)', lineHeight: 1.5 }}>
              Describe your project, assignment, or idea. The AI will map it out for you.
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,.3)',
            cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: '0 2px', marginTop: -2,
          }}>×</button>
        </div>

        {/* Text area */}
        <textarea
          autoFocus
          value={desc}
          onChange={e => setDesc(e.target.value)}
          onKeyDown={handleKey}
          placeholder={'Example:\n"I need to write a research paper on climate change impacts on Great Lakes ecosystems. It\'s due in 2 weeks and needs 8 sources, an abstract, introduction, literature review, methodology, results, discussion, and conclusion."'}
          rows={7}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '12px 14px', borderRadius: 12, fontSize: 13, lineHeight: 1.6,
            background: 'rgba(255,255,255,.05)', border: '1px solid rgba(99,102,241,.3)',
            color: 'rgba(255,255,255,.88)', outline: 'none', resize: 'vertical',
            fontFamily: 'inherit',
          }}
          onFocus={e => e.currentTarget.style.borderColor = 'rgba(99,102,241,.6)'}
          onBlur={e => e.currentTarget.style.borderColor = 'rgba(99,102,241,.3)'}
        />

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,.2)' }}>
            {busy ? 'Mapping your project…' : 'Ctrl+Enter to generate'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{
              padding: '8px 16px', borderRadius: 9, fontSize: 13, cursor: 'pointer',
              background: 'none', border: '1px solid rgba(255,255,255,.1)', color: 'rgba(255,255,255,.45)',
            }}>Cancel</button>
            <button
              onClick={() => desc.trim() && !busy && onSubmit(desc.trim())}
              disabled={!desc.trim() || busy}
              style={{
                padding: '8px 20px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: desc.trim() && !busy ? 'pointer' : 'default',
                background: desc.trim() && !busy ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(99,102,241,.25)',
                border: 'none', color: 'white', opacity: desc.trim() && !busy ? 1 : 0.6,
                transition: 'opacity 150ms',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {busy
                ? <><span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'vb-spin 0.7s linear infinite' }} /> Mapping…</>
                : '🪐 Generate Map'
              }
            </button>
          </div>
        </div>
      </div>
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
    <div style={{ padding: '40px 32px', maxWidth: 860, margin: '0 auto', position: 'relative', zIndex: 1 }}>
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

// ── Note Icon SVG ─────────────────────────────────────────────────────────────

function NoteIcon({ filled }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="10" height="10" rx="2"
        fill={filled ? 'rgba(99,102,241,.3)' : 'none'}
        stroke={filled ? 'rgba(165,180,252,.7)' : 'rgba(255,255,255,.25)'}
        strokeWidth="1.2"
      />
      <line x1="3" y1="4" x2="9" y2="4" stroke={filled ? 'rgba(165,180,252,.8)' : 'rgba(255,255,255,.25)'} strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="3" y1="6.5" x2="7.5" y2="6.5" stroke={filled ? 'rgba(165,180,252,.8)' : 'rgba(255,255,255,.25)'} strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="3" y1="9" x2="6" y2="9" stroke={filled ? 'rgba(165,180,252,.8)' : 'rgba(255,255,255,.25)'} strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

// ── Board Canvas ──────────────────────────────────────────────────────────────

function BoardCanvas({ boardId, onBack }) {
  const [board, setBoard]         = useState(null)
  const [nodes, setNodes]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  const [pending, setPending]     = useState(null)
  const confirmingRef             = useRef(false)

  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [hoveredId, setHoveredId] = useState(null)
  const [liveConn, setLiveConn]   = useState(null)
  const [aiOrganizing, setAiOrganizing] = useState(false)
  const [ctxMenu, setCtxMenu]     = useState(null)
  const [tutorNodeId, setTutorNodeId] = useState(null)

  // Physics / drag
  const [draggingId, setDraggingId] = useState(null)
  const velocityRef     = useRef({ vx: 0, vy: 0 })
  const lastDragPosRef  = useRef(null)
  const physicsRafRef   = useRef(null)

  // Note panels: { [nodeId]: boolean }
  const [openNotes, setOpenNotes]   = useState({})
  // Note drafts: { [nodeId]: string } — local edits before save
  const [noteDrafts, setNoteDrafts] = useState({})

  // Burst effect on create: nodeId of last-created node
  const [burstId, setBurstId] = useState(null)

  // Connection hover/disconnect
  const [hoveredConnId, setHoveredConnId] = useState(null)   // "fromId-toId"
  const [fadingConns, setFadingConns]     = useState(new Set()) // keys fading out

  // AI Vision modal + stagger animation
  const [aiVisionOpen, setAiVisionOpen]   = useState(false)
  const [aiVisionBusy, setAiVisionBusy]   = useState(false)
  // revealDelays: { [nodeId]: delayMs } — nodes in this map play vb-pop-in
  const [revealDelays, setRevealDelays]   = useState({})
  // connsVisible: false while nodes are staggering in, then fades in
  const [connsVisible, setConnsVisible]   = useState(true)

  const innerRef    = useRef(null)
  const nodesRef    = useRef([])
  const boardIdRef  = useRef(boardId)
  const dragRef     = useRef(null)
  const connectRef  = useRef(null)

  nodesRef.current   = nodes
  boardIdRef.current = boardId

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    api.visionBoard(boardId)
      .then(b => {
        setBoard(b)
        const ns = b.nodes || []
        setNodes(ns)
        // Seed note drafts from existing descriptions
        const drafts = {}
        ns.forEach(n => { if (n.description) drafts[n.id] = n.description })
        setNoteDrafts(drafts)
      })
      .catch(err => setError(err.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [boardId])

  // ── Coordinate helper ─────────────────────────────────────────────────────

  function clientToCanvas(clientX, clientY) {
    const r = innerRef.current.getBoundingClientRect()
    return { x: clientX - r.left, y: clientY - r.top }
  }

  // ── Hit-test ──────────────────────────────────────────────────────────────

  function hitNode(cx, cy, excludeId = null) {
    // Use a generous height (NODE_H * 2) so notes + padding don't break drop targeting
    return nodesRef.current.find(n =>
      n.id !== excludeId &&
      cx >= n.x_position - 8 && cx <= n.x_position + NODE_W + 8 &&
      cy >= n.y_position - 8 && cy <= n.y_position + NODE_H * 2 + 8
    )
  }

  // ── Physics: apply momentum after drag release ────────────────────────────

  function launchPhysics(nodeId, vx, vy, startX, startY) {
    if (physicsRafRef.current) cancelAnimationFrame(physicsRafRef.current)

    let cvx = vx, cvy = vy
    let cx = startX, cy = startY

    function tick() {
      cvx *= 0.92
      cvy *= 0.92
      cx = Math.max(0, Math.min(3820, cx + cvx))
      cy = Math.max(0, Math.min(2948, cy + cvy))

      // Gentle collision repulsion
      const others = nodesRef.current.filter(n => n.id !== nodeId)
      for (const other of others) {
        const ox = other.x_position + NODE_W / 2
        const oy = other.y_position + NODE_H / 2
        const mx = cx + NODE_W / 2
        const my = cy + NODE_H / 2
        const dx = mx - ox, dy = my - oy
        const dist = Math.sqrt(dx * dx + dy * dy)
        const minDist = NODE_W * 0.68
        if (dist < minDist && dist > 0) {
          const push = ((minDist - dist) / minDist) * 2.5
          cx += (dx / dist) * push
          cy += (dy / dist) * push
        }
      }

      setNodes(prev => prev.map(n =>
        n.id === nodeId ? { ...n, x_position: cx, y_position: cy } : n
      ))

      if (Math.abs(cvx) > 0.5 || Math.abs(cvy) > 0.5) {
        physicsRafRef.current = requestAnimationFrame(tick)
      } else {
        api.visionMoveNode(nodeId, Math.round(cx), Math.round(cy)).catch(() => {})
      }
    }
    physicsRafRef.current = requestAnimationFrame(tick)
  }

  // ── Global mouse handlers ─────────────────────────────────────────────────

  useEffect(() => {
    function onMove(e) {
      if (dragRef.current) {
        const d = dragRef.current
        const dx = e.clientX - d.startMX
        const dy = e.clientY - d.startMY

        // Track velocity
        const now = performance.now()
        if (lastDragPosRef.current) {
          const dt = Math.max(now - lastDragPosRef.current.t, 1)
          velocityRef.current = {
            vx: (e.clientX - lastDragPosRef.current.x) / dt * 16,
            vy: (e.clientY - lastDragPosRef.current.y) / dt * 16,
          }
        }
        lastDragPosRef.current = { x: e.clientX, y: e.clientY, t: now }

        setNodes(prev => prev.map(n =>
          n.id === d.nodeId
            ? { ...n, x_position: d.startNX + dx, y_position: d.startNY + dy }
            : n
        ))
      }
      if (connectRef.current && innerRef.current) {
        const pos = clientToCanvas(e.clientX, e.clientY)
        setLiveConn(prev => prev ? { ...prev, x2: pos.x, y2: pos.y } : null)
      }
    }

    async function onUp(e) {
      if (dragRef.current) {
        const { nodeId } = dragRef.current
        const { vx, vy } = velocityRef.current
        dragRef.current = null
        lastDragPosRef.current = null
        setDraggingId(null)

        const n = nodesRef.current.find(n => n.id === nodeId)
        if (!n) return

        if (Math.abs(vx) > 0.5 || Math.abs(vy) > 0.5) {
          launchPhysics(nodeId, vx, vy, n.x_position, n.y_position)
        } else {
          api.visionMoveNode(nodeId, Math.round(n.x_position), Math.round(n.y_position)).catch(() => {})
        }
        return
      }

      if (connectRef.current) {
        const { fromNodeId } = connectRef.current
        connectRef.current = null
        setLiveConn(null)
        if (!innerRef.current) return
        const pos = clientToCanvas(e.clientX, e.clientY)
        const hit = hitNode(pos.x, pos.y, fromNodeId)
        if (hit) {
          try {
            const updated = await api.visionConnect(boardIdRef.current, fromNodeId, hit.id)
            setNodes(prev => prev.map(n => n.id === hit.id ? updated : n))
          } catch {}
        } else {
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
      if (physicsRafRef.current) cancelAnimationFrame(physicsRafRef.current)
    }
  }, [])

  // ── Create node ───────────────────────────────────────────────────────────

  async function confirmNode() {
    if (confirmingRef.current) return
    const snap = pending
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
      // Trigger burst animation
      setBurstId(node.id)
      setTimeout(() => setBurstId(null), 450)
    } catch (err) {
      console.error('[VisionBoard] create node error:', err)
    }
    confirmingRef.current = false
  }

  function handleCanvasDblClick(e) {
    // Block if double-clicking on a node, button, input, or SVG interactive element
    if (
      e.target.closest('[data-node]') ||
      e.target.closest('button') ||
      e.target.tagName === 'INPUT' ||
      e.target.tagName === 'TEXTAREA'
    ) return
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

  async function saveNote(nodeId, text) {
    try {
      const updated = await api.visionUpdateNode(nodeId, { description: text })
      setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, description: updated.description ?? text } : n))
    } catch {}
  }

  async function disconnectConn(fromId, toId) {
    const key = `${fromId}-${toId}`
    setFadingConns(prev => new Set(prev).add(key))
    setHoveredConnId(null)
    try {
      await api.visionDisconnect(boardIdRef.current, fromId, toId)
      // Give fade animation time to finish before removing from state
      setTimeout(() => {
        setNodes(prev => prev.map(n =>
          n.id === toId ? { ...n, parent_step_id: null } : n
        ))
        setFadingConns(prev => { const s = new Set(prev); s.delete(key); return s })
      }, 300)
    } catch {
      setFadingConns(prev => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  // ── AI Vision ────────────────────────────────────────────────────────────

  async function handleAiVision(description) {
    setAiVisionBusy(true)
    try {
      const res = await api.visionAiVision(boardIdRef.current, description)
      // Sort nodes left-to-right for stagger order
      const sorted = [...res.nodes].sort((a, b) => a.x_position - b.x_position)

      // Hide connections while nodes stagger in
      setConnsVisible(false)

      // Build reveal delay map: each node gets index * 150ms delay
      const delays = {}
      sorted.forEach((n, i) => { delays[n.id] = i * 150 })
      setRevealDelays(delays)

      // Add all nodes to state at once — CSS animation-delay handles the visual stagger
      setNodes(prev => [...prev, ...sorted])

      // Close modal immediately so user sees the canvas
      setAiVisionOpen(false)

      // After last node's pop-in finishes, show connections with a fade
      const totalMs = sorted.length * 150 + 550
      setTimeout(() => {
        setConnsVisible(true)
        // Clear reveal delays after animations complete
        setTimeout(() => setRevealDelays({}), 700)
      }, totalMs)
    } catch (err) {
      console.error('[VisionBoard] ai vision error:', err)
    }
    setAiVisionBusy(false)
  }

  // ── AI Organize ───────────────────────────────────────────────────────────

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
      for (const [idStr, n] of Object.entries(moves)) {
        api.visionMoveNode(Number(idStr), Math.round(n.x_position), Math.round(n.y_position)).catch(() => {})
      }
    } catch (err) {
      console.error('[VisionBoard] ai organize error:', err)
    }
    setAiOrganizing(false)
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const total       = nodes.length
  const done        = nodes.filter(n => n.is_completed).length
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
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', position: 'relative' }}>

      {/* ── CSS Animations ── */}
      <style>{VB_STYLES}</style>

      {/* ── Stars (fixed, behind everything) ── */}
      <StarField />

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px',
        height: 52, flexShrink: 0, position: 'relative', zIndex: 10,
        background: 'rgba(5,5,16,.8)', borderBottom: '1px solid rgba(255,255,255,.06)',
        backdropFilter: 'blur(12px)',
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
          onClick={() => setAiVisionOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: 'linear-gradient(135deg, rgba(99,102,241,.22), rgba(139,92,246,.22))',
            border: '1px solid rgba(139,92,246,.4)',
            color: 'rgba(196,181,253,.9)', cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          🪐 AI Vision
        </button>

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

      {/* ── Scroll wrapper ── */}
      <div style={{
        flex: 1, overflow: 'auto', minHeight: 0, position: 'relative', zIndex: 1,
        background: '#050510',
        backgroundImage: [
          'radial-gradient(ellipse 600px 400px at 18% 28%, rgba(99,102,241,0.045) 0%, transparent 70%)',
          'radial-gradient(ellipse 500px 620px at 82% 72%, rgba(139,92,246,0.035) 0%, transparent 70%)',
          'radial-gradient(ellipse 420px 360px at 62% 18%, rgba(59,130,246,0.03) 0%, transparent 70%)',
          'radial-gradient(ellipse 380px 500px at 35% 80%, rgba(168,85,247,0.025) 0%, transparent 70%)',
          'radial-gradient(circle, rgba(255,255,255,.045) 1px, transparent 1px)',
        ].join(', '),
        backgroundSize: '100% 100%, 100% 100%, 100% 100%, 100% 100%, 28px 28px',
      }}>

        {/* ── Inner canvas (4000×3000) ── */}
        <div
          ref={innerRef}
          style={{ position: 'relative', width: 4000, height: 3000 }}
          onDoubleClick={handleCanvasDblClick}
          onMouseDown={e => { if (e.button === 0) setCtxMenu(null) }}
        >

          {/* ── SVG: connections + glow + pulse + disconnect ── */}
          <svg style={{
            position: 'absolute', inset: 0, width: 4000, height: 3000,
            overflow: 'visible', pointerEvents: 'none',
          }}>
            <defs>
              <filter id="vb-conn-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="vb-conn-glow-bright" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <g style={{ opacity: connsVisible ? 1 : 0, transition: 'opacity 400ms ease' }}>
            {connections.map(child => {
              const parent = nodes.find(n => n.id === child.parent_step_id)
              const x1 = parent.x_position + NODE_W
              const y1 = parent.y_position + NODE_H / 2
              const x2 = child.x_position
              const y2 = child.y_position + NODE_H / 2
              const connKey = `${parent.id}-${child.id}`
              const pathId  = `conn-${connKey}`
              const d = bezier(x1, y1, x2, y2)
              const isHoveredConn = hoveredConnId === connKey
              const isFading      = fadingConns.has(connKey)
              const mx = (x1 + x2) / 2
              const my = (y1 + y2) / 2

              return (
                <g
                  key={connKey}
                  style={{ opacity: isFading ? 0 : 1, transition: 'opacity 300ms ease' }}
                  filter={isHoveredConn ? 'url(#vb-conn-glow-bright)' : 'url(#vb-conn-glow)'}
                >
                  {/* Visible path */}
                  <path
                    id={pathId}
                    d={d}
                    fill="none"
                    stroke={isHoveredConn ? '#a5b4fc' : '#6366f1'}
                    strokeWidth={isHoveredConn ? 2.5 : 2}
                    strokeOpacity={isHoveredConn ? 0.8 : 0.45}
                    strokeLinecap="round"
                    style={{ pointerEvents: 'none', transition: 'stroke-opacity 150ms, stroke-width 150ms' }}
                  />
                  {/* Wide invisible overlay for easy hover detection */}
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="18"
                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredConnId(connKey)}
                    onMouseLeave={() => setHoveredConnId(null)}
                  />
                  {/* Energy pulse dot */}
                  <circle r="3" fill="rgba(165,180,252,.85)" style={{ pointerEvents: 'none' }}>
                    <animateMotion dur="3s" repeatCount="indefinite" begin={`${(parent.id % 30) * 0.1}s`}>
                      <mpath href={`#${pathId}`} />
                    </animateMotion>
                    <animate attributeName="opacity" values="0;0.85;0.85;0" keyTimes="0;0.1;0.85;1" dur="3s" repeatCount="indefinite" begin={`${(parent.id % 30) * 0.1}s`} />
                  </circle>
                  {/* Disconnect X — shown on hover at midpoint */}
                  {isHoveredConn && !isFading && (
                    <g
                      transform={`translate(${mx}, ${my})`}
                      style={{ cursor: 'pointer', pointerEvents: 'all' }}
                      onMouseEnter={() => setHoveredConnId(connKey)}
                      onMouseLeave={() => setHoveredConnId(null)}
                      onClick={e => { e.stopPropagation(); disconnectConn(parent.id, child.id) }}
                    >
                      <circle r="9" fill="#1a1a2e" stroke="rgba(248,113,113,.6)" strokeWidth="1.5" />
                      <text
                        textAnchor="middle" dominantBaseline="central"
                        fontSize="11" fontWeight="600" fill="#f87171"
                        style={{ userSelect: 'none' }}
                      >×</text>
                    </g>
                  )}
                </g>
              )
            })}
            </g>

            {liveConn && (
              <path
                d={bezier(liveConn.x1, liveConn.y1, liveConn.x2, liveConn.y2)}
                fill="none"
                stroke="#6366f1"
                strokeWidth="2"
                strokeOpacity="0.65"
                strokeDasharray="6 4"
                strokeLinecap="round"
                style={{ pointerEvents: 'none' }}
              />
            )}
          </svg>

          {/* ── Nodes ── */}
          {nodes.map((node, idx) => {
            const isEditing   = editingId === node.id
            const isHovered   = hoveredId === node.id
            const isDragging  = draggingId === node.id
            const isCompleted = node.is_completed
            const isBursting  = burstId === node.id
            const noteOpen    = openNotes[node.id] ?? false
            const noteDraft   = noteDrafts[node.id] ?? node.description ?? ''
            const hasNote     = !!(node.description || noteDraft)
            const hx = node.x_position + NODE_W
            const hy = node.y_position + NODE_H / 2

            // Float animation: each node has unique duration + delay offset
            const floatDur   = isCompleted ? `${6 + (idx % 4)}s` : `${4 + (idx % 3)}s`
            const floatDelay = `${-(idx * 0.7)}s`
            const floatAnim  = isCompleted ? 'vb-float-slow' : 'vb-float'
            const borderAnim = isCompleted ? 'vb-border-glow-done' : 'vb-border-glow'

            // AI Vision stagger: if this node has a reveal delay, use vb-pop-in
            const popDelay = revealDelays[node.id]
            const isPopping = popDelay !== undefined

            return (
              <div
                key={node.id}
                data-node="true"
                style={{
                  position: 'absolute',
                  left: node.x_position,
                  top: node.y_position,
                  width: NODE_W,
                  zIndex: isDragging ? 20 : 2,
                  userSelect: 'none',
                  willChange: 'transform',
                  // Pop-in takes precedence; float resumes after
                  animation: isPopping
                    ? `vb-pop-in 500ms ${popDelay}ms cubic-bezier(0.34,1.56,0.64,1) both`
                    : isDragging || isEditing
                      ? 'none'
                      : `${floatAnim} ${floatDur} ${floatDelay} ease-in-out infinite`,
                }}
                onMouseEnter={() => setHoveredId(node.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Light burst on create */}
                {isBursting && (
                  <div style={{
                    position: 'absolute',
                    inset: -40,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(165,180,252,.4) 0%, transparent 70%)',
                    animation: 'vb-burst 400ms ease-out forwards',
                    pointerEvents: 'none',
                    zIndex: 10,
                  }} />
                )}

                {/* Card */}
                <div
                  style={{
                    padding: '10px 14px',
                    minHeight: NODE_H,
                    background: isCompleted ? 'rgba(16,185,129,.07)' : 'rgba(255,255,255,.055)',
                    borderLeft: isCompleted ? '3px solid rgba(16,185,129,.55)' : undefined,
                    borderRadius: 12,
                    backdropFilter: 'blur(14px)',
                    animation: `${borderAnim} 8s ease-in-out infinite`,
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    cursor: isDragging ? 'grabbing' : isEditing ? 'default' : 'grab',
                    boxSizing: 'border-box',
                    willChange: 'box-shadow',
                  }}
                  onMouseDown={e => {
                    if (e.button !== 0 || isEditing) return
                    e.stopPropagation()
                    velocityRef.current = { vx: 0, vy: 0 }
                    lastDragPosRef.current = null
                    dragRef.current = {
                      nodeId: node.id,
                      startMX: e.clientX, startMY: e.clientY,
                      startNX: node.x_position, startNY: node.y_position,
                    }
                    setDraggingId(node.id)
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
                      background: isCompleted ? 'rgba(16,185,129,.25)' : 'rgba(255,255,255,.07)',
                      border: `1px solid ${isCompleted ? 'rgba(16,185,129,.5)' : 'rgba(255,255,255,.15)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {isCompleted && (
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
                      color: isCompleted ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.88)',
                      textDecoration: isCompleted ? 'line-through' : undefined,
                      wordBreak: 'break-word',
                    }}>
                      {node.title}
                    </p>
                  )}
                </div>

                {/* Note icon + toggle */}
                <div
                  onClick={e => {
                    e.stopPropagation()
                    setOpenNotes(prev => ({ ...prev, [node.id]: !prev[node.id] }))
                    if (!noteDrafts[node.id] && node.description) {
                      setNoteDrafts(prev => ({ ...prev, [node.id]: node.description }))
                    }
                  }}
                  onMouseDown={e => e.stopPropagation()}
                  title={hasNote ? 'Show note' : 'Add note'}
                  style={{
                    marginTop: 4,
                    display: 'flex', alignItems: 'center', gap: 4,
                    cursor: 'pointer', opacity: noteOpen ? 1 : isHovered ? 0.7 : hasNote ? 0.5 : 0.25,
                    transition: 'opacity 150ms',
                    userSelect: 'none',
                  }}
                >
                  <NoteIcon filled={hasNote} />
                </div>

                {/* Note panel */}
                {noteOpen && (
                  <div
                    style={{
                      marginTop: 4,
                      padding: '8px 10px',
                      borderRadius: 10,
                      background: 'rgba(5,5,20,.82)',
                      border: '1px solid rgba(99,102,241,.22)',
                      backdropFilter: 'blur(16px)',
                      boxShadow: '0 8px 24px rgba(0,0,0,.4)',
                      animation: 'vb-note-in 160ms ease-out',
                    }}
                    onMouseDown={e => e.stopPropagation()}
                  >
                    <textarea
                      autoFocus={!noteDraft}
                      value={noteDraft}
                      onChange={e => setNoteDrafts(prev => ({ ...prev, [node.id]: e.target.value }))}
                      onBlur={() => saveNote(node.id, noteDraft)}
                      placeholder="Add notes…"
                      rows={3}
                      style={{
                        width: '100%', resize: 'vertical',
                        background: 'none', border: 'none', outline: 'none',
                        color: 'rgba(255,255,255,.78)', fontSize: 12, lineHeight: 1.55,
                        fontFamily: 'inherit', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                )}

                {/* Connection handle — right edge */}
                <div
                  style={{
                    position: 'absolute',
                    right: -5, top: NODE_H / 2, transform: 'translateY(-50%)',
                    width: 10, height: 10, borderRadius: '50%',
                    background: '#6366f1', border: '2px solid rgba(165,180,252,.55)',
                    cursor: 'crosshair', zIndex: 3,
                    opacity: isHovered ? 1 : 0,
                    transition: 'opacity 150ms',
                    boxShadow: '0 0 8px rgba(99,102,241,.6)',
                  }}
                  onMouseDown={e => {
                    e.stopPropagation(); e.preventDefault()
                    connectRef.current = { fromNodeId: node.id, x1: hx, y1: hy }
                    setLiveConn({ x1: hx, y1: hy, x2: hx, y2: hy })
                  }}
                />

                {/* Delete button */}
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
                  boxShadow: '0 0 18px rgba(99,102,241,.25)',
                }}
              />
              <p style={{ margin: '4px 0 0 2px', fontSize: 11, color: 'rgba(255,255,255,.25)', pointerEvents: 'none' }}>
                Enter to save · Esc to cancel
              </p>
            </div>
          )}

          {/* ── Empty state ── */}
          {nodes.length === 0 && !pending && (
            <div style={{
              position: 'absolute', left: '50%', top: '40%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center', pointerEvents: 'none',
            }}>
              <p style={{ margin: '0 0 8px', fontSize: 15, color: 'rgba(255,255,255,.12)' }}>
                Double-click anywhere to add your first node
              </p>
              <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,.07)' }}>
                or use 🪐 AI Vision to map a project instantly
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

      {/* ── AI Vision modal ── */}
      {aiVisionOpen && (
        <AiVisionModal
          busy={aiVisionBusy}
          onSubmit={handleAiVision}
          onClose={() => { if (!aiVisionBusy) setAiVisionOpen(false) }}
        />
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
