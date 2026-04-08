import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import MarkdownRenderer from '../components/MarkdownRenderer'
import NeuralNetIcon from '../components/NeuralNetIcon'

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
  return <NeuralNetIcon size={12} idPrefix="vb-time" />
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

function UndoIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6H9a3 3 0 010 6H6" />
      <path d="M3 6L5.5 3.5M3 6L5.5 8.5" />
    </svg>
  )
}

// ─── Layout engine ─────────────────────────────────────────────────────────────
// Positions: root node at left, L1 steps to its right, L2 substeps further right.
// Returns nodes with {id, type, x, y, w, h, cx, cy, ex} and edges {x1,y1,x2,y2}.

const NW = 200, NH = 72, RW = 180, RH = 60, HGAP = 90, VGAP = 18, PAD = 48

function computeLayout(steps = []) {
  const span = s => Math.max(1, (s.substeps || []).length)
  const totalRows = steps.reduce((a, s) => a + span(s), 0) || 1
  const hasSubs = steps.some(s => (s.substeps || []).length > 0)

  const H = PAD * 2 + totalRows * NH + Math.max(0, totalRows - 1) * VGAP
  const W = PAD + RW + HGAP + NW + (hasSubs ? HGAP + NW : 0) + PAD + 8

  const rootCy = H / 2
  const L1x = PAD + RW + HGAP
  const L2x = L1x + NW + HGAP

  const nodes = [{
    id: 'root', type: 'root',
    x: PAD, y: rootCy - RH / 2, w: RW, h: RH,
    ex: PAD + RW, cy: rootCy,
    step: null,
  }]
  const edges = []
  let row = 0

  for (const step of steps) {
    const s = span(step)
    const topY = PAD + row * (NH + VGAP)
    const cy = topY + (s * NH + (s - 1) * VGAP) / 2
    nodes.push({ id: `s${step.id}`, type: 'step', x: L1x, y: cy - NH / 2, w: NW, h: NH, ex: L1x + NW, cy, step })
    edges.push({ id: `e-root-${step.id}`, x1: PAD + RW, y1: rootCy, x2: L1x, y2: cy })

    for (let j = 0; j < (step.substeps || []).length; j++) {
      const sub = step.substeps[j]
      const subCy = PAD + (row + j) * (NH + VGAP) + NH / 2
      nodes.push({ id: `s${sub.id}`, type: 'substep', x: L2x, y: subCy - NH / 2, w: NW, h: NH, ex: L2x + NW, cy: subCy, step: sub })
      edges.push({ id: `e-${step.id}-${sub.id}`, x1: L1x + NW, y1: cy, x2: L2x, y2: subCy })
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

function ProgressBar({ value }) {
  const pct = Math.round(value)
  const color = pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-indigo-500' : pct >= 30 ? 'bg-violet-500' : 'bg-white/20'
  const textColor = pct >= 100 ? 'text-emerald-400' : pct >= 60 ? 'text-indigo-400' : 'text-slate-400'
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs tabular-nums flex-shrink-0 font-medium ${textColor}`}>{pct}%</span>
    </div>
  )
}

// ─── Board card (list view) ───────────────────────────────────────────────────

function BoardCard({ board, onOpen }) {
  return (
    <button
      onClick={() => onOpen(board)}
      className="card p-5 text-left w-full transition-all duration-200"
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = '')}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-sm font-semibold text-slate-200 leading-snug">{board.title}</p>
        <div className="flex gap-1 flex-shrink-0">
          {board.source_type === 'canvas_assignment' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/15">Canvas</span>
          )}
          {board.status === 'completed' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">Done</span>
          )}
        </div>
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
  const [tab, setTab] = useState('manual')
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [noteId, setNoteId] = useState('')
  const [notes, setNotes] = useState([])
  const [canvasStatus, setCanvasStatus] = useState(null)
  const [courses, setCourses] = useState([])
  const [courseId, setCourseId] = useState('')
  const [assignments, setAssignments] = useState([])
  const [assignmentId, setAssignmentId] = useState('')
  const [loadingCourses, setLoadingCourses] = useState(false)
  const [loadingAssignments, setLoadingAssignments] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { api.getNotes().then(setNotes).catch(() => {}) }, [])

  useEffect(() => {
    if (tab !== 'canvas' || canvasStatus !== null) return
    api.canvasStatus()
      .then(s => {
        setCanvasStatus(s.connected)
        if (s.connected) {
          setLoadingCourses(true)
          api.canvasCourses().then(c => { setCourses(c); setLoadingCourses(false) }).catch(() => setLoadingCourses(false))
        }
      })
      .catch(() => setCanvasStatus(false))
  }, [tab, canvasStatus])

  async function loadAssignments(cid) {
    setCourseId(cid); setAssignmentId(''); setAssignments([])
    if (!cid) return
    setLoadingAssignments(true)
    try { setAssignments(await api.canvasAssignments(Number(cid))) } catch {}
    setLoadingAssignments(false)
  }

  async function handleGenerate(e) {
    e.preventDefault(); setError(null); setGenerating(true)
    try {
      const payload = tab === 'manual'
        ? { title: title.trim(), description: desc.trim() || undefined, note_id: noteId ? Number(noteId) : undefined }
        : { canvas_assignment_id: Number(assignmentId), canvas_course_id: Number(courseId) }
      onCreated(await api.visionCreate(payload))
      setTitle(''); setDesc(''); setNoteId(''); setCourseId(''); setAssignmentId('')
    } catch (err) { setError(err.message) }
    setGenerating(false)
  }

  const canSubmit = tab === 'manual' ? title.trim().length > 0 : Boolean(courseId && assignmentId)

  return (
    <div className="card p-6 mb-8">
      <h2 className="text-sm font-medium text-slate-300 mb-4">Create Vision Board</h2>
      <div className="flex gap-1 mb-5 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {[['manual', 'From Scratch'], ['canvas', 'From Canvas']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
            style={tab === key
              ? { background: 'rgba(99,102,241,0.2)', color: 'rgba(165,180,252,1)', border: '1px solid rgba(99,102,241,0.3)' }
              : { color: 'rgba(255,255,255,0.35)', border: '1px solid transparent' }}>
            {label}
          </button>
        ))}
      </div>
      <form onSubmit={handleGenerate}>
        {tab === 'manual' ? (
          <div className="space-y-3">
            <div>
              <label className="label">Assignment Title *</label>
              <input className="input" placeholder="e.g. Research Paper on Climate Change" value={title} onChange={e => setTitle(e.target.value)} disabled={generating} required />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="input resize-none" rows={3} placeholder="Paste the assignment prompt or requirements…" value={desc} onChange={e => setDesc(e.target.value)} disabled={generating} />
            </div>
            {notes.length > 0 && (
              <div>
                <label className="label">Link a Note <span className="normal-case font-normal text-slate-600 ml-1">— gives the AI full context</span></label>
                <select className="input" value={noteId} onChange={e => setNoteId(e.target.value)} disabled={generating}>
                  <option value="">None</option>
                  {notes.map(n => <option key={n.id} value={n.id}>{n.title}{n.subject ? ` — ${n.subject}` : ''}</option>)}
                </select>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {canvasStatus === null && <div className="flex items-center gap-2 text-sm text-slate-500 py-2"><Spinner sm /> Checking Canvas connection…</div>}
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
                  {loadingCourses
                    ? <div className="flex items-center gap-2 py-2 text-sm text-slate-500"><Spinner sm /> Loading courses…</div>
                    : <select className="input" value={courseId} onChange={e => loadAssignments(e.target.value)} disabled={generating}>
                        <option value="">Select a course…</option>
                        {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>}
                </div>
                {courseId && (
                  <div>
                    <label className="label">Assignment</label>
                    {loadingAssignments
                      ? <div className="flex items-center gap-2 py-2 text-sm text-slate-500"><Spinner sm /> Loading assignments…</div>
                      : <select className="input" value={assignmentId} onChange={e => setAssignmentId(e.target.value)} disabled={generating}>
                          <option value="">Select an assignment…</option>
                          {assignments.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
        <div className="flex items-center gap-3 mt-5">
          <button type="submit" className="btn-primary" disabled={!canSubmit || generating}>
            {generating ? <><Spinner sm />Generating breakdown…</> : <><PlusIcon />Generate Breakdown</>}
          </button>
          {generating && <p className="text-xs text-slate-600">This usually takes 20–30 seconds.</p>}
        </div>
      </form>
    </div>
  )
}

// ─── Update context modal ─────────────────────────────────────────────────────

function UpdateContextModal({ boardId, onUpdated, onClose }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!text.trim()) return
    setLoading(true); setError(null)
    try {
      const updated = await api.visionUpdateContext(boardId, text.trim())
      onUpdated(updated)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to update plan.')
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => e.target === e.currentTarget && !loading && onClose()}>
      <div className="absolute inset-0" style={{ background: 'rgba(4,4,16,0.75)', backdropFilter: 'blur(10px)' }} />
      <div className="relative card p-6 w-full max-w-md mx-4 shadow-2xl" style={{ borderColor: 'rgba(99,102,241,0.25)' }}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-slate-200">What changed?</p>
          {!loading && (
            <button onClick={onClose} className="btn-ghost p-1">
              <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8" /></svg>
            </button>
          )}
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <textarea
            className="input resize-none text-sm"
            rows={4}
            placeholder="e.g. the professor moved the deadline by a week, I need to add a literature review section, decided to use Python instead of Java…"
            value={text}
            onChange={e => setText(e.target.value)}
            disabled={loading}
            autoFocus
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          {loading && (
            <div className="flex items-center gap-2.5 py-2">
              <Spinner />
              <span className="text-sm text-slate-400">AI is restructuring your plan…</span>
            </div>
          )}
          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={!text.trim() || loading}>
              {loading ? 'Updating…' : 'Update Plan'}
            </button>
            {!loading && <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>}
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Node panel (step detail sidebar) ────────────────────────────────────────

function NodePanel({ node, boardId, onClose, onRefresh }) {
  const step = node.step
  const [mode, setMode] = useState('view')
  const [editTitle, setEditTitle] = useState(step?.title || '')
  const [editDesc, setEditDesc] = useState(step?.description || '')
  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState(null)

  useEffect(() => {
    setMode('view'); setEditTitle(step?.title || ''); setEditDesc(step?.description || '')
    setAnswer(null); setQuestion(''); setConfirmDelete(false)
  }, [step?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!step) return null

  async function handleToggle() {
    setToggling(true)
    try { await api.visionUpdateStep(step.id, { is_completed: !step.is_completed }); await onRefresh() } catch {}
    setToggling(false)
  }

  async function handleSave() {
    if (!editTitle.trim()) return
    setSaving(true)
    try { await api.visionUpdateStep(step.id, { title: editTitle.trim(), description: editDesc.trim() || null }); await onRefresh(); setMode('view') } catch {}
    setSaving(false)
  }

  async function handleDelete() {
    setDeleting(true)
    try { await api.visionDeleteStep(step.id); onClose(); await onRefresh() } catch {}
    setDeleting(false)
  }

  async function handleAsk(e) {
    e.preventDefault()
    if (!question.trim() || asking) return
    setAsking(true); setAnswer(null)
    try {
      const res = await api.visionAskStep(step.id, question.trim())
      setAnswer(res.answer)
    } catch (err) { setAnswer(`Error: ${err.message}`) }
    setAsking(false)
  }

  const isDone = step.is_completed

  return (
    <div className="h-full flex flex-col border-l border-white/[0.06] overflow-y-auto" style={{ background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(20px)', scrollbarWidth: 'none' }}>
      <div className="flex-shrink-0 flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/[0.05]">
        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">{node.type === 'substep' ? 'Sub-step' : 'Step'}</p>
        <button onClick={onClose} className="btn-ghost p-1">
          <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8" /></svg>
        </button>
      </div>
      <div className="flex-1 px-4 py-3 space-y-4">
        <button onClick={handleToggle} disabled={toggling}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 ${isDone ? 'text-emerald-400' : 'text-slate-400 hover:text-white/70'}`}
          style={{ background: isDone ? 'rgba(52,211,153,0.08)' : 'rgba(255,255,255,0.04)', border: `1px solid ${isDone ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.08)'}` }}>
          {toggling ? <Spinner sm /> : <CheckIcon done={isDone} />}
          {isDone ? 'Completed' : 'Mark as Complete'}
        </button>

        {mode === 'view' ? (
          <div>
            <p className="text-sm font-semibold text-slate-100 leading-snug mb-1.5">{step.title}</p>
            {step.description && <p className="text-xs text-slate-400 leading-relaxed">{step.description}</p>}
            {step.estimated_minutes && (
              <div className="flex items-center gap-1 mt-2 text-xs text-slate-600">
                <ClockIcon /><span>{step.estimated_minutes} min</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div><label className="label">Title</label><input className="input text-xs" value={editTitle} onChange={e => setEditTitle(e.target.value)} /></div>
            <div><label className="label">Description</label><textarea className="input text-xs resize-none" rows={3} value={editDesc} onChange={e => setEditDesc(e.target.value)} /></div>
            <div className="flex gap-2 pt-1">
              <button onClick={handleSave} disabled={saving || !editTitle.trim()} className="btn-primary text-xs px-3 py-1.5">{saving ? <Spinner sm /> : 'Save'}</button>
              <button onClick={() => setMode('view')} className="btn-ghost text-xs">Cancel</button>
            </div>
          </div>
        )}

        {mode === 'view' && (
          <div className="flex gap-1.5">
            <button onClick={() => setMode('edit')} className="btn-ghost text-xs flex items-center gap-1"><EditIcon />Edit</button>
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} className="btn-ghost text-xs flex items-center gap-1" style={{ color: 'rgba(248,113,113,0.5)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'rgb(248,113,113)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(248,113,113,0.5)')}>
                <TrashIcon />Delete
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-500">Sure?</span>
                <button onClick={handleDelete} disabled={deleting} className="text-[11px] text-red-400 hover:text-red-300 transition-colors px-1">{deleting ? <Spinner sm /> : 'Yes'}</button>
                <button onClick={() => setConfirmDelete(false)} className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors px-1">No</button>
              </div>
            )}
          </div>
        )}

        <div className="pt-1 border-t border-white/[0.05]">
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-2.5">Ask Tutor</p>
          <form onSubmit={handleAsk} className="space-y-2">
            <textarea className="input text-xs resize-none" rows={2} placeholder="Ask StudyNerve AI about this step…" value={question}
              onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk(e) } }} disabled={asking} />
            <button type="submit" disabled={!question.trim() || asking} className="btn-primary text-xs px-3 py-1.5 w-full justify-center">
              {asking ? <><Spinner sm />Thinking…</> : <><SendIcon />Ask</>}
            </button>
          </form>
          {asking && <div className="mt-3 text-xs text-slate-500 flex items-center gap-1.5"><Spinner sm />StudyNerve AI is thinking…</div>}
          {answer && (
            <div className="mt-3 p-3 rounded-xl" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}>
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
  const topLevelSteps = steps.filter(s => !s.parent_step_id)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true); setError(null)
    try {
      await api.visionAddStep(boardId, { title: title.trim(), description: desc.trim() || undefined, parent_step_id: parentId ? Number(parentId) : undefined, estimated_minutes: mins ? Number(mins) : undefined })
      await onAdd(); onClose()
    } catch (err) { setError(err.message) }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0" style={{ background: 'rgba(4,4,16,0.7)', backdropFilter: 'blur(8px)' }} />
      <div className="relative card p-6 w-full max-w-sm mx-4 shadow-2xl" style={{ borderColor: 'rgba(99,102,241,0.2)' }}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-slate-200">Add Step</p>
          <button onClick={onClose} className="btn-ghost p-1"><svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8" /></svg></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div><label className="label">Title *</label><input className="input" placeholder="Step title" value={title} onChange={e => setTitle(e.target.value)} autoFocus required /></div>
          <div><label className="label">Description</label><textarea className="input resize-none text-xs" rows={2} placeholder="What needs to be done…" value={desc} onChange={e => setDesc(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Est. Minutes</label><input className="input" type="number" min="1" placeholder="30" value={mins} onChange={e => setMins(e.target.value)} /></div>
            <div>
              <label className="label">Parent Step</label>
              <select className="input text-xs" value={parentId} onChange={e => setParentId(e.target.value)}>
                <option value="">Top level</option>
                {topLevelSteps.map(s => <option key={s.id} value={s.id}>{s.title.length > 24 ? s.title.slice(0, 24) + '…' : s.title}</option>)}
              </select>
            </div>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="submit" className="btn-primary text-sm flex-1 justify-center" disabled={!title.trim() || saving}>{saving ? <><Spinner sm />Adding…</> : 'Add Step'}</button>
            <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Interactive canvas mind map ──────────────────────────────────────────────

function MindMap({ board, selectedId, onSelect, onBoardUpdated }) {
  const { nodes, edges, W, H } = computeLayout(board.steps || [])
  const canvasRef = useRef(null)

  // Pan state
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const panStart = useRef(null)
  const isPanning = useRef(false)

  // Drag-to-connect state
  const [dragLine, setDragLine] = useState(null) // {x1,y1,x2,y2}
  const [newNodeState, setNewNodeState] = useState(null) // {fromStepId, x, y}
  const [newNodeTitle, setNewNodeTitle] = useState('')
  const [savingNode, setSavingNode] = useState(false)
  const newNodeInputRef = useRef(null)
  const dragSourceRef = useRef(null) // {stepId, handleX, handleY}

  // Newly created node id for fade-in animation
  const [newNodeId, setNewNodeId] = useState(null)

  // Focus input when new node appears
  useEffect(() => {
    if (newNodeState && newNodeInputRef.current) {
      setTimeout(() => newNodeInputRef.current?.focus(), 50)
    }
  }, [newNodeState])

  // ── Pan handlers ────────────────────────────────────────────────────────────

  function onCanvasMouseDown(e) {
    // Only pan on empty canvas (not on nodes/handles)
    if (e.target !== canvasRef.current && !e.target.closest('[data-canvas-bg]')) return
    isPanning.current = true
    panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
    e.currentTarget.style.cursor = 'grabbing'
  }

  function onCanvasMouseMove(e) {
    if (dragSourceRef.current) {
      // We're drawing a connection line
      const rect = canvasRef.current.getBoundingClientRect()
      const x2 = e.clientX - rect.left - pan.x
      const y2 = e.clientY - rect.top - pan.y
      setDragLine({ ...dragSourceRef.current, x2, y2 })
      return
    }
    if (!isPanning.current || !panStart.current) return
    setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y })
  }

  function onCanvasMouseUp(e) {
    if (dragSourceRef.current) {
      // Drop — show new node input at drop position
      const rect = canvasRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left - pan.x
      const y = e.clientY - rect.top - pan.y
      setNewNodeState({ fromStepId: dragSourceRef.current.stepId, x, y })
      setDragLine(null)
      dragSourceRef.current = null
      return
    }
    isPanning.current = false
    panStart.current = null
    if (canvasRef.current) canvasRef.current.style.cursor = 'default'
  }

  // ── Drag handle mouse down ──────────────────────────────────────────────────

  function onHandleMouseDown(e, step, node) {
    e.stopPropagation()
    e.preventDefault()
    const rect = canvasRef.current.getBoundingClientRect()
    const handleX = node.ex
    const handleY = node.cy
    dragSourceRef.current = { stepId: step.id, x1: handleX, y1: handleY, x2: handleX, y2: handleY }
    setDragLine({ x1: handleX, y1: handleY, x2: handleX, y2: handleY })
  }

  // ── Confirm new node ────────────────────────────────────────────────────────

  async function confirmNewNode(e) {
    if (e) e.preventDefault()
    if (!newNodeTitle.trim() || !newNodeState || savingNode) return
    setSavingNode(true)
    try {
      // API returns VisionStepResponse (a single step, not the full board)
      const newStep = await api.visionConnectNode(board.id, {
        from_step_id: newNodeState.fromStepId,
        title: newNodeTitle.trim(),
      })

      // Build the updated board immutably — insert the new step in the right place
      const stepWithSubsteps = { ...newStep, substeps: [] }
      const updatedBoard = {
        ...board,
        steps: newStep.parent_step_id
          ? (board.steps || []).map(s =>
              s.id === newStep.parent_step_id
                ? { ...s, substeps: [...(s.substeps || []), stepWithSubsteps] }
                : s
            )
          : [...(board.steps || []), stepWithSubsteps],
      }

      setNewNodeId(`s${newStep.id}`)
      await onBoardUpdated(updatedBoard)
    } catch {}
    setSavingNode(false)
    setNewNodeState(null)
    setNewNodeTitle('')
  }

  function cancelNewNode() {
    setNewNodeState(null)
    setNewNodeTitle('')
    setDragLine(null)
    dragSourceRef.current = null
  }

  const hasSteps = (board.steps || []).length > 0

  return (
    <div
      ref={canvasRef}
      className="absolute inset-0 overflow-hidden select-none"
      style={{ cursor: 'default' }}
      onMouseDown={onCanvasMouseDown}
      onMouseMove={onCanvasMouseMove}
      onMouseUp={onCanvasMouseUp}
      onMouseLeave={onCanvasMouseUp}
    >
      {/* Dot-grid background — marks it as pannable canvas */}
      <svg data-canvas-bg="1" className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%', opacity: 0.18 }}>
        <defs>
          <pattern id="dot-grid" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="rgba(99,102,241,0.6)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dot-grid)" />
      </svg>

      {/* Pannable + zoomable content */}
      <div style={{ transform: `translate(${pan.x}px,${pan.y}px)`, width: W, height: H, position: 'relative' }}>

        {/* SVG layer: edges + drag line */}
        <svg className="absolute inset-0 pointer-events-none" width={W} height={H} style={{ overflow: 'visible' }}>
          <defs>
            <linearGradient id="edge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(99,102,241,0.4)" />
              <stop offset="100%" stopColor="rgba(139,92,246,0.28)" />
            </linearGradient>
          </defs>

          {/* Existing edges — animated dash flow */}
          {edges.map((edge, i) => {
            const fromNode = nodes.find(n => n.ex === edge.x1 && n.cy === edge.y1)
            const isActive = fromNode && (fromNode.id === selectedId || `s${fromNode.step?.id}` === selectedId)
            const d = bezier(edge)
            return (
              <g key={edge.id}>
                {/* Static base line */}
                <path d={d} fill="none" stroke={isActive ? 'rgba(99,102,241,0.6)' : 'url(#edge-grad)'}
                  strokeWidth={isActive ? 2 : 1.5} strokeLinecap="round"
                  style={{ animation: `vb-edge-in 0.5s ease-out ${0.1 + i * 0.05}s both` }} />
                {/* Animated flow overlay */}
                <path d={d} fill="none" stroke="rgba(99,102,241,0.35)" strokeWidth="1.5"
                  strokeDasharray="6 18" strokeLinecap="round"
                  style={{ animation: `vb-edge-in 0.5s ease-out ${0.1 + i * 0.05}s both, vb-flow 3s linear infinite` }} />
              </g>
            )
          })}

          {/* Live drag line */}
          {dragLine && (
            <path
              d={bezier(dragLine)}
              fill="none" stroke="rgba(99,102,241,0.55)" strokeWidth="2"
              strokeDasharray="6 6" strokeLinecap="round"
              style={{ animation: 'vb-flow 1.5s linear infinite' }}
            />
          )}
        </svg>

        {/* Nodes */}
        {!hasSteps && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ paddingLeft: PAD + RW + HGAP }}>
            <p className="text-sm text-slate-600 pointer-events-none">No steps generated yet.</p>
          </div>
        )}

        {nodes.map((node, i) => {
          const step = node.step
          const isRoot = node.type === 'root'
          const isSelected = !isRoot && selectedId === node.id
          const isDone = step?.is_completed
          const isNew = node.id === newNodeId
          const baseDelay = 0.05 + i * 0.07

          if (isRoot) {
            return (
              <div key={node.id} className="absolute flex items-center justify-center"
                style={{ left: node.x, top: node.y, width: node.w, height: node.h, animation: `vb-node-in 0.45s cubic-bezier(0.34,1.56,0.64,1) ${baseDelay}s both` }}>
                <div className="w-full h-full rounded-2xl flex items-center justify-center px-4"
                  style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.22) 0%,rgba(139,92,246,0.18) 100%)', border: '1px solid rgba(99,102,241,0.35)', boxShadow: '0 0 24px rgba(99,102,241,0.18),inset 0 1px 0 rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)' }}>
                  <p className="text-sm font-bold text-white/90 text-center leading-tight" style={{ fontFamily: "'Sora',sans-serif" }}>
                    {board.title.length > 28 ? board.title.slice(0, 28) + '…' : board.title}
                  </p>
                </div>
              </div>
            )
          }

          return (
            <div
              key={node.id}
              className="absolute group"
              style={{
                left: node.x, top: node.y, width: node.w, height: node.h,
                animation: isNew
                  ? 'vb-node-new 0.2s ease-out both'
                  : `vb-node-in 0.45s cubic-bezier(0.34,1.56,0.64,1) ${baseDelay}s both`,
                transition: 'left 0.3s ease, top 0.3s ease',
              }}
            >
              {/* Node card */}
              <button
                onClick={() => onSelect(isSelected ? null : node.id)}
                className="w-full h-full text-left"
                style={{ display: 'block' }}
              >
                <div
                  className="w-full h-full rounded-2xl px-3.5 py-2.5 flex flex-col justify-center gap-1 transition-all duration-200"
                  style={{
                    background: isDone ? 'rgba(52,211,153,0.06)' : isSelected ? 'rgba(99,102,241,0.14)' : 'rgba(255,255,255,0.04)',
                    border: isDone ? '2px solid rgba(52,211,153,0.35)' : isSelected ? '1px solid rgba(99,102,241,0.45)' : '1px solid rgba(255,255,255,0.07)',
                    borderLeft: isDone ? '3px solid rgba(52,211,153,0.6)' : undefined,
                    boxShadow: isSelected ? '0 0 20px rgba(99,102,241,0.2)' : undefined,
                    backdropFilter: 'blur(20px)',
                    opacity: isDone ? 0.7 : 1,
                    transform: 'scale(1)',
                    transformOrigin: 'center',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = 'rgba(99,102,241,0.35)'
                      e.currentTarget.style.boxShadow = '0 0 18px rgba(99,102,241,0.15)'
                      e.currentTarget.style.background = isDone ? 'rgba(52,211,153,0.09)' : 'rgba(99,102,241,0.08)'
                      e.currentTarget.style.transform = 'scale(1.02)'
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = isDone ? 'rgba(52,211,153,0.35)' : 'rgba(255,255,255,0.07)'
                      e.currentTarget.style.boxShadow = ''
                      e.currentTarget.style.background = isDone ? 'rgba(52,211,153,0.06)' : 'rgba(255,255,255,0.04)'
                      e.currentTarget.style.transform = 'scale(1)'
                    }
                  }}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 mt-0.5 w-4 h-4 rounded flex items-center justify-center"
                      style={{ background: isDone ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.06)', border: isDone ? '1px solid rgba(52,211,153,0.35)' : '1px solid rgba(255,255,255,0.12)' }}>
                      <CheckIcon done={isDone} />
                    </div>
                    <p className={`text-xs font-semibold leading-snug ${isDone ? 'text-emerald-300/70 line-through decoration-emerald-400/40' : 'text-slate-200'}`}>
                      {step.title.length > 36 ? step.title.slice(0, 36) + '…' : step.title}
                    </p>
                  </div>
                  {step.estimated_minutes && (
                    <div className="flex items-center gap-1 text-slate-600 ml-6">
                      <ClockIcon /><span className="text-[10px]">{step.estimated_minutes} min</span>
                    </div>
                  )}
                </div>
              </button>

              {/* Drag handle — right edge dot */}
              <div
                className="absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 cursor-crosshair z-10"
                style={{ right: -10 }}
                onMouseDown={e => onHandleMouseDown(e, step, node)}
                title="Drag to create connected step"
              >
                <div className="w-4 h-4 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(99,102,241,0.8)', border: '2px solid rgba(165,180,252,0.6)', boxShadow: '0 0 8px rgba(99,102,241,0.5)' }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-white/80" />
                </div>
              </div>
            </div>
          )
        })}

        {/* New node inline input (appears at drop position) */}
        {newNodeState && (
          <div
            className="absolute z-20 pointer-events-auto"
            style={{ left: newNodeState.x, top: newNodeState.y - 28, animation: 'vb-node-new 0.2s ease-out both' }}
          >
            <form onSubmit={confirmNewNode}>
              <div className="rounded-xl px-3 py-2 flex items-center gap-2"
                style={{ background: 'rgba(15,15,35,0.95)', border: '1px solid rgba(99,102,241,0.5)', boxShadow: '0 4px 24px rgba(99,102,241,0.25)', backdropFilter: 'blur(20px)', minWidth: 180 }}>
                <input
                  ref={newNodeInputRef}
                  className="bg-transparent outline-none text-xs text-white/90 placeholder-white/25 flex-1"
                  placeholder="Step title…"
                  value={newNodeTitle}
                  onChange={e => setNewNodeTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') cancelNewNode() }}
                  disabled={savingNode}
                />
                {savingNode
                  ? <Spinner sm />
                  : <button type="submit" disabled={!newNodeTitle.trim()} className="text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-30">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 7h8M8 4l3 3-3 3" /></svg>
                    </button>
                }
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Board view ───────────────────────────────────────────────────────────────

function BoardView({ board: initialBoard, onBack, onBoardUpdate }) {
  const [board, setBoard] = useState(initialBoard)
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [addingStep, setAddingStep] = useState(false)
  const [updatingContext, setUpdatingContext] = useState(false)
  const [hasHistory, setHasHistory] = useState(false)
  const [undoing, setUndoing] = useState(false)

  useEffect(() => { refresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Check if undo history exists
    api.visionHistory(board.id).then(h => setHasHistory(h.length > 0)).catch(() => {})
  }, [board.id, board.steps]) // re-check whenever steps change

  async function refresh() {
    setLoading(true)
    try {
      const full = await api.visionBoard(board.id)
      setBoard(full)
      onBoardUpdate(full)
    } catch {}
    setLoading(false)
  }

  async function handleBoardUpdated(updated) {
    setBoard(updated)
    onBoardUpdate(updated)
    setHasHistory(true)
    return updated
  }

  async function handleUndo() {
    setUndoing(true)
    try {
      // Trigger the undo, then fetch fresh board state from the server
      await api.visionUndo(board.id)
      const fresh = await api.visionBoard(board.id)
      setBoard(fresh)
      onBoardUpdate(fresh)
      const h = await api.visionHistory(board.id)
      setHasHistory(h.length > 0)
    } catch {}
    setUndoing(false)
  }

  const selectedNode = selectedId
    ? computeLayout(board.steps || []).nodes.find(n => n.id === selectedId) || null
    : null

  const allSteps = []
  for (const s of board.steps || []) {
    allSteps.push(s)
    for (const sub of s.substeps || []) allSteps.push(sub)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-5 py-3 border-b border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(20px)' }}>
        <button onClick={onBack} className="btn-ghost p-1.5 flex items-center gap-1.5 text-xs flex-shrink-0"><BackIcon />Back</button>
        <div className="h-4 w-px bg-white/[0.08] flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-200 truncate">{board.title}</p>
        </div>
        <div className="w-32 flex-shrink-0">
          <ProgressBar value={board.progress ?? 0} />
        </div>
        {board.source_type === 'canvas_assignment' && (
          <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/15">Canvas</span>
        )}
        {loading && <Spinner sm />}

        {/* Undo */}
        <button
          onClick={handleUndo}
          disabled={!hasHistory || undoing}
          className="btn-ghost text-xs flex-shrink-0 flex items-center gap-1.5 disabled:opacity-30"
          title="Undo last change"
        >
          {undoing ? <Spinner sm /> : <UndoIcon />}
          Undo
        </button>

        {/* Update Plan */}
        <button onClick={() => setUpdatingContext(true)} className="btn-secondary text-xs flex-shrink-0 flex items-center gap-1.5"
          style={{ borderColor: 'rgba(99,102,241,0.3)', color: 'rgba(165,180,252,0.9)' }}>
          <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 7A4 4 0 113 7" /><path d="M11 7l1.5-1.5M11 7l-1.5-1.5" />
          </svg>
          Update Plan
        </button>

        {/* Add Step */}
        <button onClick={() => setAddingStep(true)} className="btn-secondary text-xs flex-shrink-0 flex items-center gap-1.5">
          <PlusIcon />Add Step
        </button>
      </div>

      {/* Body: pannable canvas + side panel */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Canvas */}
        <div className="flex-1 relative overflow-hidden">
          <MindMap
            board={board}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onBoardUpdated={handleBoardUpdated}
          />
        </div>

        {/* Node detail panel — desktop */}
        <div className="hidden md:block flex-shrink-0 overflow-hidden transition-all duration-300 ease-out"
          style={{ width: selectedNode && selectedNode.type !== 'root' ? 296 : 0 }}>
          {selectedNode && selectedNode.type !== 'root' && (
            <div className="w-[296px] h-full">
              <NodePanel node={selectedNode} boardId={board.id} onClose={() => setSelectedId(null)} onRefresh={refresh} />
            </div>
          )}
        </div>

        {/* Node detail panel — mobile overlay */}
        {selectedNode && selectedNode.type !== 'root' && (
          <>
            <div className="md:hidden fixed inset-0 z-30" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} onClick={() => setSelectedId(null)} />
            <div className="md:hidden fixed top-16 right-0 bottom-0 z-40 w-[min(296px,90vw)]">
              <NodePanel node={selectedNode} boardId={board.id} onClose={() => setSelectedId(null)} onRefresh={refresh} />
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {addingStep && <AddStepModal boardId={board.id} steps={allSteps} onAdd={refresh} onClose={() => setAddingStep(false)} />}
      {updatingContext && <UpdateContextModal boardId={board.id} onUpdated={handleBoardUpdated} onClose={() => setUpdatingContext(false)} />}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function VisionBoard() {
  const [boards, setBoards] = useState([])
  const [loadingBoards, setLoadingBoards] = useState(true)
  const [openBoard, setOpenBoard] = useState(null)

  useEffect(() => {
    api.visionBoards().then(setBoards).catch(() => {}).finally(() => setLoadingBoards(false))
  }, [])

  function handleCreated(newBoard) {
    setBoards(prev => [newBoard, ...prev.filter(b => b.id !== newBoard.id)])
    setOpenBoard(newBoard)
  }

  function handleBoardUpdate(updated) {
    setBoards(prev => prev.map(b => b.id === updated.id ? { ...b, progress: updated.progress, status: updated.status } : b))
  }

  const animStyles = (
    <style>{`
      @keyframes vb-node-in {
        from { opacity: 0; transform: translateX(-12px) scale(0.95); }
        to   { opacity: 1; transform: translateX(0) scale(1); }
      }
      @keyframes vb-node-new {
        from { opacity: 0; transform: scale(0.85); }
        to   { opacity: 1; transform: scale(1); }
      }
      @keyframes vb-edge-in {
        from { opacity: 0; stroke-dasharray: 1000; stroke-dashoffset: 1000; }
        to   { opacity: 1; stroke-dasharray: 1000; stroke-dashoffset: 0; }
      }
      @keyframes vb-flow {
        from { stroke-dashoffset: 0; }
        to   { stroke-dashoffset: -48; }
      }
    `}</style>
  )

  if (openBoard) {
    return (
      <>
        {animStyles}
        <div style={{ height: 'calc(100vh - 64px)' }}>
          <BoardView board={openBoard} onBack={() => setOpenBoard(null)} onBoardUpdate={handleBoardUpdate} />
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
          <p className="text-sm text-slate-500 mt-1">Break assignments into steps. StudyNerve AI maps it out.</p>
        </div>
        <CreateForm onCreated={handleCreated} />
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-slate-300">Your Boards</h2>
            {boards.length > 0 && <span className="text-xs text-slate-600">{boards.length} board{boards.length !== 1 ? 's' : ''}</span>}
          </div>
          {loadingBoards ? (
            <div className="flex items-center gap-2 text-slate-500 text-sm"><Spinner />Loading boards…</div>
          ) : boards.length === 0 ? (
            <div className="card p-12 text-center">
              <p className="text-slate-500 text-sm">No vision boards yet.</p>
              <p className="text-slate-600 text-xs mt-1">Create one above to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {boards.map(b => <BoardCard key={b.id} board={b} onOpen={setOpenBoard} />)}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
