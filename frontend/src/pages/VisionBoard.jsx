import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import MarkdownRenderer from '../components/MarkdownRenderer'

// ─── Icons ────────────────────────────────────────────────────────────────────

function Spinner({ sm }) {
  return (
    <svg className={`animate-spin ${sm ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-indigo-400`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

function CheckIcon({ done }) {
  return (
    <svg className={`w-3.5 h-3.5 ${done ? 'text-emerald-400' : 'text-white/20'}`} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 7l3 3 6-6" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="6" cy="6" r="4.5" />
      <path d="M6 3.5v2.5l1.5 1.5" strokeLinejoin="round" />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13L5 8l5-5" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.5 1.5L1.5 6l4 2 2 4 5-10.5z" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M7 2v10M2 7h10" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <path d="M2.5 3.5h9M5.5 3.5V2.5h3v1M4.5 3.5v7a.5.5 0 00.5.5h4a.5.5 0 00.5-.5v-7" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2.5l2 2-7 7-2.5.5.5-2.5 7-7z" />
    </svg>
  )
}

// ─── Mind map layout engine ───────────────────────────────────────────────────

const NW = 200, NH = 72, RW = 180, RH = 52, HGAP = 82, VGAP = 16, PAD = 44

function computeLayout(steps = []) {
  const span = s => Math.max(1, (s.substeps || []).length)
  const totalRows = steps.reduce((a, s) => a + span(s), 0) || 1
  const hasSubs = steps.some(s => (s.substeps || []).length > 0)

  const H = PAD * 2 + totalRows * NH + Math.max(0, totalRows - 1) * VGAP
  const W = PAD + RW + HGAP + NW + (hasSubs ? HGAP + NW : 0) + PAD + 8

  const rootCy = H / 2
  const L1x = PAD + RW + HGAP
  const L2x = L1x + NW + HGAP

  const nodes = [
    {
      id: 'root', type: 'root',
      x: PAD, y: rootCy - RH / 2, w: RW, h: RH,
      ex: PAD + RW, cy: rootCy,
      step: null,
    },
  ]
  const edges = []
  let row = 0

  for (const step of steps) {
    const s = span(step)
    const topY = PAD + row * (NH + VGAP)
    const cy = topY + (s * NH + (s - 1) * VGAP) / 2
    nodes.push({ id: `s${step.id}`, type: 'step', x: L1x, y: cy - NH / 2, w: NW, h: NH, ex: L1x + NW, cy, step })
    edges.push({ x1: PAD + RW, y1: rootCy, x2: L1x, y2: cy })

    for (let j = 0; j < (step.substeps || []).length; j++) {
      const sub = step.substeps[j]
      const subCy = PAD + (row + j) * (NH + VGAP) + NH / 2
      nodes.push({ id: `s${sub.id}`, type: 'substep', x: L2x, y: subCy - NH / 2, w: NW, h: NH, ex: L2x + NW, cy: subCy, step: sub })
      edges.push({ x1: L1x + NW, y1: cy, x2: L2x, y2: subCy })
    }
    row += s
  }
  return { nodes, edges, W, H }
}

function bezier({ x1, y1, x2, y2 }) {
  const mx = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ value, label }) {
  const pct = Math.round(value)
  const color = pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-indigo-500' : pct >= 30 ? 'bg-violet-500' : 'bg-white/20'
  const textColor = pct >= 100 ? 'text-emerald-400' : pct >= 60 ? 'text-indigo-400' : 'text-slate-400'
  return (
    <div className="flex items-center gap-2.5">
      {label && <span className="text-xs text-slate-500 flex-shrink-0">{label}</span>}
      <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs tabular-nums flex-shrink-0 font-medium ${textColor}`}>{pct}%</span>
    </div>
  )
}

// ─── Board card ───────────────────────────────────────────────────────────────

function BoardCard({ board, onOpen }) {
  const isComplete = board.status === 'completed'
  return (
    <button
      onClick={() => onOpen(board)}
      className="card p-5 text-left w-full group transition-all duration-200"
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = '')}
      style={{ cursor: 'pointer' }}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-sm font-semibold text-slate-200 leading-snug">{board.title}</p>
        {board.source_type === 'canvas_assignment' && (
          <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/15">
            Canvas
          </span>
        )}
        {isComplete && (
          <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">
            Done
          </span>
        )}
      </div>
      <ProgressBar value={board.progress} />
      <div className="flex items-center gap-1 mt-2.5 text-[11px] text-slate-600">
        <span>{board.step_count} step{board.step_count !== 1 ? 's' : ''}</span>
        <span>·</span>
        <span>{board.completed_steps} done</span>
      </div>
    </button>
  )
}

// ─── Create form ──────────────────────────────────────────────────────────────

function CreateForm({ onCreated }) {
  const [tab, setTab] = useState('manual') // 'manual' | 'canvas'
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [noteId, setNoteId] = useState('')
  const [notes, setNotes] = useState([])

  // Canvas
  const [canvasStatus, setCanvasStatus] = useState(null) // null=loading, true/false
  const [courses, setCourses] = useState([])
  const [courseId, setCourseId] = useState('')
  const [assignments, setAssignments] = useState([])
  const [assignmentId, setAssignmentId] = useState('')
  const [loadingCourses, setLoadingCourses] = useState(false)
  const [loadingAssignments, setLoadingAssignments] = useState(false)

  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)

  // Load notes for the "Link a Note" dropdown (manual tab)
  useEffect(() => {
    api.getNotes().then(setNotes).catch(() => {})
  }, [])

  // Load canvas status when canvas tab is opened
  useEffect(() => {
    if (tab !== 'canvas' || canvasStatus !== null) return
    api.canvasStatus()
      .then(s => {
        setCanvasStatus(s.connected)
        if (s.connected) {
          setLoadingCourses(true)
          api.canvasCourses()
            .then(c => { setCourses(c); setLoadingCourses(false) })
            .catch(() => setLoadingCourses(false))
        }
      })
      .catch(() => setCanvasStatus(false))
  }, [tab, canvasStatus])

  async function loadAssignments(cid) {
    setCourseId(cid)
    setAssignmentId('')
    setAssignments([])
    if (!cid) return
    setLoadingAssignments(true)
    try {
      const data = await api.canvasAssignments(Number(cid))
      setAssignments(data)
    } catch {}
    setLoadingAssignments(false)
  }

  async function handleGenerate(e) {
    e.preventDefault()
    setError(null)
    setGenerating(true)
    try {
      let payload = {}
      if (tab === 'manual') {
        payload = {
          title: title.trim(),
          description: desc.trim() || undefined,
          note_id: noteId ? Number(noteId) : undefined,
        }
      } else {
        payload = { canvas_assignment_id: Number(assignmentId), canvas_course_id: Number(courseId) }
      }
      const board = await api.visionCreate(payload)
      onCreated(board)
      setTitle('')
      setDesc('')
      setNoteId('')
      setCourseId('')
      setAssignmentId('')
    } catch (err) {
      setError(err.message)
    }
    setGenerating(false)
  }

  const canSubmit = tab === 'manual'
    ? title.trim().length > 0
    : Boolean(courseId && assignmentId)

  return (
    <div className="card p-6 mb-8">
      <h2 className="text-sm font-medium text-slate-300 mb-4">Create Vision Board</h2>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {[['manual', 'From Scratch'], ['canvas', 'From Canvas']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
            style={tab === key
              ? { background: 'rgba(99,102,241,0.2)', color: 'rgba(165,180,252,1)', border: '1px solid rgba(99,102,241,0.3)' }
              : { color: 'rgba(255,255,255,0.35)', border: '1px solid transparent' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={handleGenerate}>
        {tab === 'manual' ? (
          <div className="space-y-3">
            <div>
              <label className="label">Assignment Title *</label>
              <input
                className="input"
                placeholder="e.g. Research Paper on Climate Change"
                value={title}
                onChange={e => setTitle(e.target.value)}
                disabled={generating}
                required
              />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea
                className="input resize-none"
                rows={3}
                placeholder="Paste the assignment prompt or requirements (optional, but improves the breakdown)…"
                value={desc}
                onChange={e => setDesc(e.target.value)}
                disabled={generating}
              />
            </div>
            {notes.length > 0 && (
              <div>
                <label className="label">Link a Note <span className="normal-case font-normal text-slate-600 ml-1">— gives the AI full context</span></label>
                <select className="input" value={noteId} onChange={e => setNoteId(e.target.value)} disabled={generating}>
                  <option value="">None</option>
                  {notes.map(n => (
                    <option key={n.id} value={n.id}>{n.title}{n.subject ? ` — ${n.subject}` : ''}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {canvasStatus === null && (
              <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
                <Spinner sm /> Checking Canvas connection…
              </div>
            )}
            {canvasStatus === false && (
              <div className="card p-4 flex items-center justify-between">
                <p className="text-sm text-slate-500">Canvas is not connected.</p>
                <Link to="/canvas" className="btn-secondary text-xs ml-4">Connect Canvas</Link>
              </div>
            )}
            {canvasStatus === true && (
              <>
                <div>
                  <label className="label">Course</label>
                  {loadingCourses ? (
                    <div className="flex items-center gap-2 py-2 text-sm text-slate-500"><Spinner sm /> Loading courses…</div>
                  ) : (
                    <select className="input" value={courseId} onChange={e => loadAssignments(e.target.value)} disabled={generating}>
                      <option value="">Select a course…</option>
                      {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                </div>
                {courseId && (
                  <div>
                    <label className="label">Assignment</label>
                    {loadingAssignments ? (
                      <div className="flex items-center gap-2 py-2 text-sm text-slate-500"><Spinner sm /> Loading assignments…</div>
                    ) : (
                      <select className="input" value={assignmentId} onChange={e => setAssignmentId(e.target.value)} disabled={generating}>
                        <option value="">Select an assignment…</option>
                        {assignments.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {error && <p className="text-xs text-red-400 mt-3">{error}</p>}

        <div className="flex items-center gap-3 mt-5">
          <button type="submit" className="btn-primary" disabled={!canSubmit || generating}>
            {generating ? (
              <><Spinner sm />Generating breakdown…</>
            ) : (
              <><PlusIcon />Generate Breakdown</>
            )}
          </button>
          {generating && (
            <p className="text-xs text-slate-600">Master Teacher is thinking. This usually takes 20–30 seconds.</p>
          )}
        </div>
      </form>
    </div>
  )
}

// ─── Node panel ───────────────────────────────────────────────────────────────

function NodePanel({ node, boardId, onClose, onRefresh }) {
  const step = node.step
  const [mode, setMode] = useState('view') // 'view' | 'edit'
  const [editTitle, setEditTitle] = useState(step?.title || '')
  const [editDesc, setEditDesc] = useState(step?.description || '')
  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Ask tutor
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState(null)

  // Reset state when a different node is selected
  useEffect(() => {
    setMode('view')
    setEditTitle(step?.title || '')
    setEditDesc(step?.description || '')
    setAnswer(null)
    setQuestion('')
    setConfirmDelete(false)
  }, [step?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!step) return null

  async function handleToggle() {
    setToggling(true)
    try {
      await api.visionUpdateStep(step.id, { is_completed: !step.is_completed })
      await onRefresh()
    } catch {}
    setToggling(false)
  }

  async function handleSave() {
    if (!editTitle.trim()) return
    setSaving(true)
    try {
      await api.visionUpdateStep(step.id, { title: editTitle.trim(), description: editDesc.trim() || null })
      await onRefresh()
      setMode('view')
    } catch {}
    setSaving(false)
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.visionDeleteStep(step.id)
      onClose()
      await onRefresh()
    } catch {}
    setDeleting(false)
  }

  async function handleAsk(e) {
    e.preventDefault()
    if (!question.trim() || asking) return
    setAsking(true)
    setAnswer(null)
    try {
      const res = await api.visionAskStep(step.id, question.trim())
      setAnswer(res.answer)
    } catch (err) {
      setAnswer(`Error: ${err.message}`)
    }
    setAsking(false)
  }

  const isDone = step.is_completed

  return (
    <div
      className="h-full flex flex-col border-l border-white/[0.06] overflow-y-auto"
      style={{ background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(20px)', scrollbarWidth: 'none' }}
    >
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/[0.05]">
        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
          {node.type === 'substep' ? 'Sub-step' : 'Step'}
        </p>
        <button onClick={onClose} className="btn-ghost p-1">
          <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>

      <div className="flex-1 px-4 py-3 space-y-4">
        {/* Completion toggle */}
        <button
          onClick={handleToggle}
          disabled={toggling}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 ${
            isDone
              ? 'text-emerald-400'
              : 'text-slate-400 hover:text-white/70'
          }`}
          style={{
            background: isDone ? 'rgba(52,211,153,0.08)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${isDone ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.08)'}`,
          }}
        >
          {toggling ? <Spinner sm /> : <CheckIcon done={isDone} />}
          {isDone ? 'Completed' : 'Mark as Complete'}
        </button>

        {/* Title + description */}
        {mode === 'view' ? (
          <div>
            <p className="text-sm font-semibold text-slate-100 leading-snug mb-1.5">{step.title}</p>
            {step.description && (
              <p className="text-xs text-slate-400 leading-relaxed">{step.description}</p>
            )}
            {step.estimated_minutes && (
              <div className="flex items-center gap-1 mt-2 text-xs text-slate-600">
                <ClockIcon />
                <span>{step.estimated_minutes} min</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div>
              <label className="label">Title</label>
              <input className="input text-xs" value={editTitle} onChange={e => setEditTitle(e.target.value)} />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="input text-xs resize-none" rows={3} value={editDesc} onChange={e => setEditDesc(e.target.value)} />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={handleSave} disabled={saving || !editTitle.trim()} className="btn-primary text-xs px-3 py-1.5">
                {saving ? <Spinner sm /> : 'Save'}
              </button>
              <button onClick={() => setMode('view')} className="btn-ghost text-xs">Cancel</button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {mode === 'view' && (
          <div className="flex gap-1.5">
            <button
              onClick={() => setMode('edit')}
              className="btn-ghost text-xs flex items-center gap-1"
            >
              <EditIcon />Edit
            </button>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="btn-ghost text-xs flex items-center gap-1"
                style={{ color: 'rgba(248,113,113,0.5)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'rgb(248,113,113)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(248,113,113,0.5)')}
              >
                <TrashIcon />Delete
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-500">Sure?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-[11px] text-red-400 hover:text-red-300 transition-colors px-1"
                >
                  {deleting ? <Spinner sm /> : 'Yes'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors px-1"
                >
                  No
                </button>
              </div>
            )}
          </div>
        )}

        {/* Ask Tutor */}
        <div className="pt-1 border-t border-white/[0.05]">
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-2.5">Ask Tutor</p>
          <form onSubmit={handleAsk} className="space-y-2">
            <textarea
              className="input text-xs resize-none"
              rows={2}
              placeholder="Ask Master Teacher about this step…"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk(e) } }}
              disabled={asking}
            />
            <button
              type="submit"
              disabled={!question.trim() || asking}
              className="btn-primary text-xs px-3 py-1.5 w-full justify-center"
            >
              {asking ? <><Spinner sm />Thinking…</> : <><SendIcon />Ask</>}
            </button>
          </form>

          {asking && (
            <div className="mt-3 text-xs text-slate-500 flex items-center gap-1.5">
              <Spinner sm />Master Teacher is thinking…
            </div>
          )}

          {answer && (
            <div
              className="mt-3 p-3 rounded-xl"
              style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}
            >
              <MarkdownRenderer size="sm">{answer}</MarkdownRenderer>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Add step modal ───────────────────────────────────────────────────────────

function AddStepModal({ boardId, steps, onAdd, onClose }) {
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [mins, setMins] = useState('')
  const [parentId, setParentId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Only top-level steps can be parents (no double-nesting)
  const topLevelSteps = steps.filter(s => !s.parent_step_id)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError(null)
    try {
      await api.visionAddStep(boardId, {
        title: title.trim(),
        description: desc.trim() || undefined,
        parent_step_id: parentId ? Number(parentId) : undefined,
        estimated_minutes: mins ? Number(mins) : undefined,
      })
      await onAdd()
      onClose()
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0" style={{ background: 'rgba(4,4,16,0.7)', backdropFilter: 'blur(8px)' }} />
      <div className="relative card p-6 w-full max-w-sm mx-4 shadow-2xl" style={{ borderColor: 'rgba(99,102,241,0.2)' }}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-slate-200">Add Step</p>
          <button onClick={onClose} className="btn-ghost p-1">
            <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label">Title *</label>
            <input className="input" placeholder="Step title" value={title} onChange={e => setTitle(e.target.value)} autoFocus required />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input resize-none text-xs" rows={2} placeholder="What needs to be done…" value={desc} onChange={e => setDesc(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Est. Minutes</label>
              <input className="input" type="number" min="1" placeholder="30" value={mins} onChange={e => setMins(e.target.value)} />
            </div>
            <div>
              <label className="label">Parent Step</label>
              <select className="input text-xs" value={parentId} onChange={e => setParentId(e.target.value)}>
                <option value="">Top level</option>
                {topLevelSteps.map(s => (
                  <option key={s.id} value={s.id}>{s.title.length > 24 ? s.title.slice(0, 24) + '…' : s.title}</option>
                ))}
              </select>
            </div>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="submit" className="btn-primary text-sm flex-1 justify-center" disabled={!title.trim() || saving}>
              {saving ? <><Spinner sm />Adding…</> : 'Add Step'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Mind map ─────────────────────────────────────────────────────────────────

function MindMap({ board, selectedId, onSelect, animKey }) {
  const { nodes, edges, W, H } = computeLayout(board.steps || [])

  const hasSteps = (board.steps || []).length > 0

  return (
    <div
      className="relative flex-shrink-0"
      style={{ width: W, height: H, minWidth: '100%' }}
    >
      {/* SVG connections */}
      <svg
        className="absolute inset-0 pointer-events-none"
        width={W}
        height={H}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="edge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(99,102,241,0.35)" />
            <stop offset="100%" stopColor="rgba(139,92,246,0.25)" />
          </linearGradient>
        </defs>
        {edges.map((e, i) => {
          const fromNode = nodes.find(n => n.ex === e.x1 && n.cy === e.y1)
          const isActive = fromNode && (fromNode.id === selectedId || fromNode.id.replace('s', '') === String(selectedId))
          return (
            <path
              key={i}
              d={bezier(e)}
              fill="none"
              stroke={isActive ? 'rgba(99,102,241,0.6)' : 'url(#edge-grad)'}
              strokeWidth={isActive ? 1.8 : 1.2}
              strokeLinecap="round"
              style={{
                animation: `vb-edge-in 0.5s ease-out ${0.15 + i * 0.05}s both`,
              }}
            />
          )
        })}
      </svg>

      {/* Empty state (no steps) */}
      {!hasSteps && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ paddingLeft: PAD + RW + HGAP }}>
          <p className="text-sm text-slate-600">No steps generated yet.</p>
        </div>
      )}

      {/* Nodes */}
      {nodes.map((node, i) => {
        const step = node.step
        const isRoot = node.type === 'root'
        const isSelected = !isRoot && selectedId === node.id
        const isDone = step?.is_completed

        const baseDelay = 0.05 + i * 0.07

        if (isRoot) {
          return (
            <div
              key={node.id}
              className="absolute flex items-center justify-center"
              style={{
                left: node.x,
                top: node.y,
                width: node.w,
                height: node.h,
                animation: `vb-node-in 0.45s cubic-bezier(0.34,1.56,0.64,1) ${baseDelay}s both`,
              }}
            >
              <div
                className="w-full h-full rounded-2xl flex items-center justify-center px-4"
                style={{
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.22) 0%, rgba(139,92,246,0.18) 100%)',
                  border: '1px solid rgba(99,102,241,0.35)',
                  boxShadow: '0 0 24px rgba(99,102,241,0.18), inset 0 1px 0 rgba(255,255,255,0.08)',
                  backdropFilter: 'blur(20px)',
                }}
              >
                <p className="text-sm font-bold text-white/90 text-center leading-tight" style={{ fontFamily: "'Sora', sans-serif" }}>
                  {board.title.length > 28 ? board.title.slice(0, 28) + '…' : board.title}
                </p>
              </div>
            </div>
          )
        }

        return (
          <button
            key={node.id}
            onClick={() => onSelect(isSelected ? null : node.id)}
            className="absolute text-left group"
            style={{
              left: node.x,
              top: node.y,
              width: node.w,
              height: node.h,
              animation: `vb-node-in 0.45s cubic-bezier(0.34,1.56,0.64,1) ${baseDelay}s both`,
            }}
          >
            <div
              className="w-full h-full rounded-2xl px-3.5 py-2.5 flex flex-col justify-center gap-1 transition-all duration-200"
              style={{
                background: isDone
                  ? 'rgba(52,211,153,0.06)'
                  : isSelected
                  ? 'rgba(99,102,241,0.14)'
                  : 'rgba(255,255,255,0.04)',
                border: isDone
                  ? '1px solid rgba(52,211,153,0.28)'
                  : isSelected
                  ? '1px solid rgba(99,102,241,0.45)'
                  : '1px solid rgba(255,255,255,0.07)',
                boxShadow: isDone
                  ? '0 0 16px rgba(52,211,153,0.1)'
                  : isSelected
                  ? '0 0 20px rgba(99,102,241,0.2)'
                  : undefined,
                backdropFilter: 'blur(20px)',
                opacity: isDone ? 0.75 : 1,
              }}
              onMouseEnter={e => {
                if (!isSelected && !isDone) {
                  e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'
                  e.currentTarget.style.boxShadow = '0 0 16px rgba(99,102,241,0.12)'
                  e.currentTarget.style.background = 'rgba(99,102,241,0.07)'
                }
              }}
              onMouseLeave={e => {
                if (!isSelected && !isDone) {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
                  e.currentTarget.style.boxShadow = ''
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                }
              }}
            >
              {/* Checkbox + title */}
              <div className="flex items-start gap-2">
                <div
                  className="flex-shrink-0 mt-0.5 w-4 h-4 rounded flex items-center justify-center transition-colors duration-200"
                  style={{
                    background: isDone ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.06)',
                    border: isDone ? '1px solid rgba(52,211,153,0.35)' : '1px solid rgba(255,255,255,0.12)',
                  }}
                >
                  <CheckIcon done={isDone} />
                </div>
                <p className={`text-xs font-semibold leading-snug ${isDone ? 'text-emerald-300/70 line-through decoration-emerald-400/40' : 'text-slate-200'}`}>
                  {step.title.length > 38 ? step.title.slice(0, 38) + '…' : step.title}
                </p>
              </div>

              {/* Time estimate */}
              {step.estimated_minutes && (
                <div className="flex items-center gap-1 text-slate-600 ml-6">
                  <ClockIcon />
                  <span className="text-[10px]">{step.estimated_minutes} min</span>
                </div>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─── Board view ───────────────────────────────────────────────────────────────

function BoardView({ board: initialBoard, onBack, onBoardUpdate }) {
  const [board, setBoard] = useState(initialBoard)
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [addingStep, setAddingStep] = useState(false)
  const animKey = useRef(0)

  // Fetch full board detail (with nested steps) on mount
  useEffect(() => {
    refresh()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function refresh() {
    setLoading(true)
    try {
      const full = await api.visionBoard(board.id)
      setBoard(full)
      animKey.current += 1
      onBoardUpdate(full)
    } catch {}
    setLoading(false)
  }

  const selectedNode = selectedId
    ? (() => {
        const { nodes } = computeLayout(board.steps || [])
        return nodes.find(n => n.id === selectedId) || null
      })()
    : null

  // Flatten all steps for AddStepModal's parent dropdown
  const allSteps = []
  for (const s of board.steps || []) {
    allSteps.push(s)
    for (const sub of s.substeps || []) allSteps.push(sub)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center gap-3 px-6 py-3.5 border-b border-white/[0.06]"
        style={{ background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(20px)' }}
      >
        <button onClick={onBack} className="btn-ghost p-1.5 flex items-center gap-1.5 text-xs">
          <BackIcon />Back
        </button>

        <div className="h-4 w-px bg-white/[0.08] flex-shrink-0" />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-200 truncate">{board.title}</p>
        </div>

        <div className="w-40 flex-shrink-0">
          <ProgressBar value={board.progress ?? 0} />
        </div>

        {board.source_type === 'canvas_assignment' && (
          <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/15">
            Canvas
          </span>
        )}

        {loading && <Spinner sm />}

        <button
          onClick={() => setAddingStep(true)}
          className="btn-secondary text-xs flex-shrink-0 flex items-center gap-1.5"
        >
          <PlusIcon />Add Step
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Mind map */}
        <div className="flex-1 overflow-auto p-6" style={{ scrollbarWidth: 'thin' }}>
          <MindMap
            board={board}
            selectedId={selectedId}
            onSelect={setSelectedId}
            animKey={animKey.current}
          />
        </div>

        {/* Node panel — desktop: inline; mobile: overlay from right */}
        <div
          className="hidden md:block flex-shrink-0 overflow-hidden transition-all duration-300 ease-out"
          style={{ width: selectedNode && selectedNode.type !== 'root' ? 296 : 0 }}
        >
          {selectedNode && selectedNode.type !== 'root' && (
            <div className="w-[296px] h-full">
              <NodePanel
                node={selectedNode}
                boardId={board.id}
                onClose={() => setSelectedId(null)}
                onRefresh={refresh}
              />
            </div>
          )}
        </div>

        {/* Node panel — mobile overlay */}
        {selectedNode && selectedNode.type !== 'root' && (
          <>
            <div
              className="md:hidden fixed inset-0 z-30"
              style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
              onClick={() => setSelectedId(null)}
            />
            <div className="md:hidden fixed top-16 right-0 bottom-0 z-40 w-[min(296px,90vw)]">
              <NodePanel
                node={selectedNode}
                boardId={board.id}
                onClose={() => setSelectedId(null)}
                onRefresh={refresh}
              />
            </div>
          </>
        )}
      </div>

      {/* Add Step modal */}
      {addingStep && (
        <AddStepModal
          boardId={board.id}
          steps={allSteps}
          onAdd={refresh}
          onClose={() => setAddingStep(false)}
        />
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function VisionBoard() {
  const [boards, setBoards] = useState([])
  const [loadingBoards, setLoadingBoards] = useState(true)
  const [openBoard, setOpenBoard] = useState(null)

  useEffect(() => {
    api.visionBoards()
      .then(setBoards)
      .catch(() => {})
      .finally(() => setLoadingBoards(false))
  }, [])

  function handleCreated(newBoard) {
    setBoards(prev => [newBoard, ...prev.filter(b => b.id !== newBoard.id)])
    // Open the board immediately after creating it
    setOpenBoard(newBoard)
  }

  function handleBoardUpdate(updated) {
    setBoards(prev => prev.map(b => b.id === updated.id
      ? { ...b, progress: updated.progress, status: updated.status }
      : b
    ))
  }

  const animStyles = (
    <style>{`
      @keyframes vb-node-in {
        from { opacity: 0; transform: translateX(-14px) scale(0.95); }
        to   { opacity: 1; transform: translateX(0) scale(1); }
      }
      @keyframes vb-edge-in {
        from { opacity: 0; stroke-dasharray: 1000; stroke-dashoffset: 1000; }
        to   { opacity: 1; stroke-dasharray: 1000; stroke-dashoffset: 0; }
      }
    `}</style>
  )

  if (openBoard) {
    return (
      <>
        {animStyles}
        <div style={{ height: 'calc(100vh - 64px)' }}>
          <BoardView
            board={openBoard}
            onBack={() => setOpenBoard(null)}
            onBoardUpdate={handleBoardUpdate}
          />
        </div>
      </>
    )
  }

  return (
    <>
      {animStyles}

      <div className="p-4 sm:p-8 max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-slate-100">Vision Boards</h1>
          <p className="text-sm text-slate-500 mt-1">Break assignments into steps. Master Teacher maps it out.</p>
        </div>

        <CreateForm onCreated={handleCreated} />

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-slate-300">Your Boards</h2>
            {boards.length > 0 && (
              <span className="text-xs text-slate-600">{boards.length} board{boards.length !== 1 ? 's' : ''}</span>
            )}
          </div>

          {loadingBoards ? (
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <Spinner />Loading boards…
            </div>
          ) : boards.length === 0 ? (
            <div className="card p-12 text-center">
              <p className="text-slate-500 text-sm">No vision boards yet.</p>
              <p className="text-slate-600 text-xs mt-1">Create one above to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {boards.map(b => (
                <BoardCard key={b.id} board={b} onOpen={setOpenBoard} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
