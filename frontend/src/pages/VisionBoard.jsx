import { useState, useEffect, useRef } from 'react'
import { api } from '../api/client'
import { useToast } from '../components/Toast'

// ── Utilities ─────────────────────────────────────────────────────────────────

function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

// ── Checkbox ──────────────────────────────────────────────────────────────────

function Checkbox({ checked, onChange, size = 16 }) {
  return (
    <button
      type="button"
      onClick={onChange}
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        border: `1.5px solid ${checked ? '#6366f1' : 'rgba(255,255,255,0.2)'}`,
        background: checked ? '#6366f1' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      {checked && (
        <svg width={Math.round(size * 0.6)} height={Math.round(size * 0.6)} viewBox="0 0 10 10" fill="none">
          <path d="M1.5 5l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}

// ── StepCard ──────────────────────────────────────────────────────────────────

function StepCard({ step, index, subSteps, onToggle, onExpand, onToggleSub, isDragOver, onDragStart, onDragOver, onDragEnd, onDrop }) {
  const [expanding, setExpanding] = useState(false)
  async function handleExpand() {
    setExpanding(true)
    await onExpand(step)
    setExpanding(false)
  }

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, index)}
      onDragOver={e => onDragOver(e, index)}
      onDragEnd={onDragEnd}
      onDrop={e => onDrop(e, index)}
      className={"card p-3 transition-all duration-150"}
      style={{
        opacity: step.is_completed ? 0.55 : 1,
        outline: isDragOver ? '2px solid rgba(99,102,241,0.45)' : 'none',
        outlineOffset: 2,
        cursor: 'grab',
      }}
    >
      {/* Main row */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          <Checkbox checked={step.is_completed} onChange={() => onToggle(step)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium leading-snug ${step.is_completed ? 'line-through text-white/30' : 'text-ink-primary'}`}>
            {step.title}
          </p>
          {step.description && (
            <p className={`text-xs mt-0.5 leading-relaxed ${step.is_completed ? 'text-white/20' : 'text-white/45'}`}>
              {step.description}
            </p>
          )}
        </div>
        {!subSteps.length && !step.is_completed && (
          <button
            onClick={handleExpand}
            disabled={expanding}
            className="btn-ghost text-xs text-white/30 hover:text-accent-hover shrink-0 px-2 py-0.5"
          >
            {expanding ? '…' : 'Expand'}
          </button>
        )}
        <span
          className="text-white/20 shrink-0 select-none"
          style={{ fontSize: 13, lineHeight: 1, marginTop: 1 }}
          title="Drag to reorder"
        >
          ⠿
        </span>
      </div>

      {/* Sub-steps */}
      {subSteps.length > 0 && (
        <div
          className="mt-2.5 ml-7 flex flex-col gap-1.5 pl-3"
          style={{ borderLeft: '2px solid rgba(99,102,241,0.2)' }}
        >
          {subSteps.map(sub => (
            <div key={sub.id} className="flex items-start gap-2 py-0.5">
              <div className="mt-0.5 shrink-0">
                <Checkbox checked={sub.is_completed} onChange={() => onToggleSub(sub)} size={13} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium leading-snug ${sub.is_completed ? 'line-through text-white/25' : 'text-white/80'}`}>
                  {sub.title}
                </p>
                {sub.description && (
                  <p className={`text-xs mt-0.5 ${sub.is_completed ? 'text-white/15' : 'text-white/35'}`}>
                    {sub.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── BoardList ─────────────────────────────────────────────────────────────────

function BoardList({ onOpen }) {
  const [boards, setBoards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [input, setInput] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    api.visionBoards()
      .then(setBoards)
      .catch(() => setError('Failed to load boards.'))
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    const title = input.trim()
    if (!title) return
    setCreating(true)
    try {
      const board = await api.visionCreate({ title })
      onOpen(board.id, true)
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
    <div className="px-4 sm:px-6 py-6 max-w-2xl mx-auto fade-in-up">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-primary">Vision Board</h1>
        <p className="text-sm text-white/50 mt-1">
          Break down any topic, assignment, or project into actionable steps
        </p>
      </div>

      <form onSubmit={handleCreate} className="mb-7 card p-3 flex flex-col gap-2.5">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="e.g. Research paper on climate change, Study for calculus midterm..."
          rows={2}
          disabled={creating}
          className="w-full bg-transparent text-sm text-ink-primary placeholder-white/25 resize-none outline-none leading-relaxed"
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCreate(e) }
          }}
        />
        <div className="flex justify-end">
          <button type="submit" disabled={creating || !input.trim()} className="btn-primary text-sm">
            {creating ? 'Creating…' : 'New Board'}
          </button>
        </div>
      </form>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className={"skeleton h-[88px] rounded-xl"} />
          ))}
        </div>
      ) : boards.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-white/35 text-sm leading-relaxed">
            No vision boards yet — create one to break down your first big task
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {boards.map((board, i) => {
            const total = board.node_count || 0
            const done = board.done_count || 0
            const pct = total > 0 ? Math.round((done / total) * 100) : 0
            return (
              <div
                key={board.id}
                onClick={() => onOpen(board.id, false)}
                className="card p-4 cursor-pointer card-hover"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="font-medium text-ink-primary text-sm leading-snug flex-1 line-clamp-2">
                    {board.title}
                  </h3>
                  <button
                    onClick={e => handleDelete(e, board.id)}
                    className="btn-ghost text-xs text-white/25 hover:text-red-400 shrink-0 -mt-0.5 w-6 h-6 flex items-center justify-center"
                  >
                    ✕
                  </button>
                </div>
                <div className="h-1 rounded-full mb-2.5" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div
                    className="h-1 rounded-full bg-accent transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-white/35">
                  {total} {total === 1 ? 'step' : 'steps'}
                  {total > 0 ? ` · ${done} done` : ''}
                  {' · '}{relativeTime(board.updated_at)}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── BoardDetail ───────────────────────────────────────────────────────────────

function BoardDetail({ boardId, onBack, initialBreakdown }) {
  const showToast = useToast()
  const [board, setBoard] = useState(null)
  const boardCompleteCelebrated = useRef(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [addingStep, setAddingStep] = useState(false)
  const [newStepTitle, setNewStepTitle] = useState('')
  const [dragOverIdx, setDragOverIdx] = useState(null)
  const dragIdx = useRef(null)

  // Create nodes from AI result items and append to board state
  async function createNodesFromItems(items, parentId = null) {
    const created = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const node = await api.visionCreateNode(boardId, {
        title: item.title || item.text || 'Step',
        description: item.description || '',
        x: 0,
        y: parentId ? 0 : i * 100,
        ...(parentId ? { parent_step_id: parentId } : {}),
      })
      created.push(node)
    }
    return created
  }

  async function runBreakdown(title) {
    setAiLoading(true)
    setAiError('')
    try {
      const result = await api.visionMakeSense(boardId, {
        tldraw_state: '',
        mode: 'breakdown',
        board_title: title,
      })
      if (result?.items?.length) {
        const created = await createNodesFromItems(result.items)
        setBoard(prev => ({ ...prev, nodes: [...(prev.nodes || []), ...created] }))
      }
    } catch {
      setAiError('AI breakdown failed — try again.')
      setTimeout(() => setAiError(''), 4000)
    }
    setAiLoading(false)
  }

  useEffect(() => {
    api.visionBoard(boardId)
      .then(async data => {
        setBoard(data)
        setLoading(false)
        if (initialBreakdown && data.nodes.length === 0) {
          await runBreakdown(data.title)
        }
      })
      .catch(() => {
        setError('Failed to load board.')
        setLoading(false)
      })
  }, [boardId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sorted top-level steps by y_position then id
  const sortedTopSteps = board
    ? [...board.nodes.filter(n => !n.parent_step_id)].sort(
        (a, b) => (a.y_position - b.y_position) || (a.id - b.id)
      )
    : []

  const getSubSteps = parentId =>
    (board?.nodes || [])
      .filter(n => n.parent_step_id === parentId)
      .sort((a, b) => a.id - b.id)

  const totalSteps = (board?.nodes || []).length
  const doneSteps = (board?.nodes || []).filter(n => n.is_completed).length
  const pct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0

  async function saveTitle() {
    const t = titleDraft.trim()
    setEditingTitle(false)
    if (!t || t === board.title) return
    setBoard(prev => ({ ...prev, title: t }))
    try { await api.visionUpdateBoard(boardId, { title: t }) } catch {}
  }

  function updateNode(updated) {
    setBoard(prev => ({ ...prev, nodes: prev.nodes.map(n => n.id === updated.id ? updated : n) }))
  }

  async function handleToggle(node) {
    try {
      const updated = await api.visionUpdateNode(node.id, { is_completed: !node.is_completed })
      updateNode(updated)
      // Celebrate when all steps are complete for the first time
      if (!node.is_completed && !boardCompleteCelebrated.current && board) {
        const allNodes = board.nodes.map(n => n.id === updated.id ? updated : n)
        const allDone = allNodes.length > 0 && allNodes.every(n => n.is_completed)
        if (allDone) {
          boardCompleteCelebrated.current = true
          showToast?.('Board complete! Great work! 🎯', 'success', 4000)
        }
      }
    } catch {}
  }

  async function handleBreakdown() {
    if (!board || aiLoading) return
    await runBreakdown(board.title)
  }

  async function handleExpand(step) {
    try {
      const result = await api.visionMakeSense(boardId, {
        tldraw_state: '',
        mode: 'expand',
        step_title: step.title,
        step_description: step.description || '',
      })
      if (result?.items?.length) {
        const created = await createNodesFromItems(result.items, step.id)
        setBoard(prev => ({ ...prev, nodes: [...(prev.nodes || []), ...created] }))
      }
    } catch {}
  }

  async function handleAddStep(e) {
    e.preventDefault()
    const title = newStepTitle.trim()
    if (!title) return
    try {
      const node = await api.visionCreateNode(boardId, {
        title,
        x: 0,
        y: sortedTopSteps.length * 100,
      })
      setBoard(prev => ({ ...prev, nodes: [...(prev.nodes || []), node] }))
      setNewStepTitle('')
      setAddingStep(false)
    } catch {}
  }

  // Drag to reorder
  function onDragStart(e, idx) {
    dragIdx.current = idx
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDragOver(e, idx) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIdx(idx)
  }

  function onDragEnd() {
    setDragOverIdx(null)
  }

  async function onDrop(e, targetIdx) {
    e.preventDefault()
    const fromIdx = dragIdx.current
    dragIdx.current = null
    setDragOverIdx(null)
    if (fromIdx === null || fromIdx === targetIdx) return

    const steps = [...sortedTopSteps]
    const [moved] = steps.splice(fromIdx, 1)
    steps.splice(targetIdx, 0, moved)

    const subNodes = (board?.nodes || []).filter(n => n.parent_step_id)
    setBoard(prev => ({ ...prev, nodes: [...steps, ...subNodes] }))

    for (let i = 0; i < steps.length; i++) {
      try { await api.visionMoveNode(steps[i].id, 0, i * 100) } catch {}
    }
  }

  if (loading) return (
    <div className="px-4 sm:px-6 py-6 max-w-2xl mx-auto">
      <div className="flex flex-col gap-3">
        <div className="skeleton h-8 w-52 rounded-lg" />
        <div className="skeleton h-2 rounded-full" />
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={"skeleton h-16 rounded-xl"} />
        ))}
      </div>
    </div>
  )

  if (error) return (
    <div className="px-4 sm:px-6 py-6">
      <p className="text-red-400 text-sm mb-3">{error}</p>
      <button onClick={onBack} className="btn-ghost">← Back</button>
    </div>
  )

  return (
    <div className="px-4 sm:px-6 py-6 max-w-2xl mx-auto fade-in-up">
      {/* Header */}
      <div className="flex items-start gap-3 mb-5">
        <button onClick={onBack} className="btn-ghost text-white/40 shrink-0 mt-0.5 -ml-1">
          ←
        </button>
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => {
                if (e.key === 'Enter') saveTitle()
                if (e.key === 'Escape') setEditingTitle(false)
              }}
              className="w-full text-lg font-semibold text-ink-primary bg-transparent outline-none border-b border-white/20 pb-0.5"
            />
          ) : (
            <h1
              className="text-lg font-semibold text-ink-primary cursor-pointer hover:text-white transition-colors truncate"
              onClick={() => { setTitleDraft(board.title); setEditingTitle(true) }}
              title="Click to rename"
            >
              {board.title}
            </h1>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {aiError && <span className="text-xs text-red-400">{aiError}</span>}
          <button
            onClick={handleBreakdown}
            disabled={aiLoading}
            className="btn-primary text-xs px-3 py-1.5"
          >
            {aiLoading
              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ display: 'inline-block', animation: 'vb-spin 1s linear infinite' }}>✦</span>
                  Thinking…
                </span>
              : '✦ AI Breakdown'}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {totalSteps > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-white/40">{doneSteps} of {totalSteps} steps done</span>
            <span className="text-xs font-medium text-accent-hover">{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="h-1.5 rounded-full bar-animate bg-accent"
              style={{
                width: `${pct}%`,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Steps */}
      <div className="flex flex-col gap-2">
        {aiLoading && sortedTopSteps.length === 0 && (
          <div className="flex flex-col gap-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className={"skeleton h-14 rounded-xl"} />
            ))}
          </div>
        )}

        {!aiLoading && sortedTopSteps.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-white/35 text-sm leading-relaxed">
              No steps yet — click{' '}
              <span className="text-accent-hover font-medium">✦ AI Breakdown</span>{' '}
              to generate them, or add one manually below.
            </p>
          </div>
        )}

        {sortedTopSteps.map((step, i) => (
          <StepCard
            key={step.id}
            step={step}
            index={i}
            subSteps={getSubSteps(step.id)}
            onToggle={handleToggle}
            onExpand={handleExpand}
            onToggleSub={handleToggle}
            isDragOver={dragOverIdx === i && dragIdx.current !== i}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            onDrop={onDrop}
          />
        ))}

        {/* Add step */}
        {addingStep ? (
          <form onSubmit={handleAddStep} className="card p-3 flex gap-2 items-center">
            <input
              autoFocus
              value={newStepTitle}
              onChange={e => setNewStepTitle(e.target.value)}
              placeholder="Step title…"
              className="flex-1 bg-transparent text-sm text-ink-primary outline-none placeholder-white/25"
              onKeyDown={e => {
                if (e.key === 'Escape') { setAddingStep(false); setNewStepTitle('') }
              }}
            />
            <button type="submit" className="btn-primary text-xs px-3 py-1">Add</button>
            <button
              type="button"
              onClick={() => { setAddingStep(false); setNewStepTitle('') }}
              className="btn-ghost text-xs"
            >
              ✕
            </button>
          </form>
        ) : (
          <button
            onClick={() => setAddingStep(true)}
            className="w-full py-2.5 text-sm text-white/30 hover:text-white/60 transition-colors rounded-xl"
            style={{ border: '1px dashed rgba(255,255,255,0.1)' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
          >
            + Add step
          </button>
        )}
      </div>

      <style>{`@keyframes vb-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function VisionBoard() {
  const [activeBoardId, setActiveBoardId] = useState(null)
  const [doBreakdown, setDoBreakdown] = useState(false)

  function openBoard(id, breakdown = false) {
    setDoBreakdown(breakdown)
    setActiveBoardId(id)
  }

  return activeBoardId
    ? <BoardDetail boardId={activeBoardId} onBack={() => setActiveBoardId(null)} initialBreakdown={doBreakdown} />
    : <BoardList onOpen={openBoard} />
}
