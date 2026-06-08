import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import Spinner from '../components/Spinner'

// ── Due-date helpers ──────────────────────────────────────────────────────────

function formatDue(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function dueUrgency(iso) {
  if (!iso) return 'none'
  const diff = new Date(iso).getTime() - Date.now()
  if (diff < 0) return 'past'
  const days = diff / 86400000
  if (days < 2) return 'critical'
  if (days < 7) return 'warning'
  return 'normal'
}

const U = {
  critical: { text: 'text-red-400',   dot: 'bg-red-400',    shadow: '0 0 6px rgba(248,113,113,0.6)' },
  warning:  { text: 'text-amber-400', dot: 'bg-amber-400',  shadow: '0 0 6px rgba(251,191,36,0.5)'  },
  past:     { text: 'text-ink-faint', dot: 'bg-zinc-700',   shadow: 'none'                           },
  normal:   { text: 'text-ink-muted', dot: 'bg-zinc-600',   shadow: 'none'                           },
  none:     { text: 'text-ink-muted', dot: 'bg-zinc-700',   shadow: 'none'                           },
}

// ── Tiny shared components ────────────────────────────────────────────────────

function ChevronRight() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3l5 5-5 5" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 6l3 3 5-5" />
    </svg>
  )
}

function ImportIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2v6M3 6l3 3 3-3" />
      <path d="M1 10h10" />
    </svg>
  )
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({ on, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-checked={on}
      role="switch"
      style={{
        width: 34,
        height: 18,
        borderRadius: 9,
        background: on ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.10)',
        position: 'relative',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'background 0.18s ease',
      }}
    >
      <span style={{
        position: 'absolute',
        top: 2,
        left: on ? 16 : 2,
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: 'white',
        transition: 'left 0.18s ease',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  )
}

// ── Course accent color from name hash ────────────────────────────────────────

const COURSE_ACCENTS = [
  'rgba(99,102,241,0.5)',
  'rgba(168,85,247,0.5)',
  'rgba(59,130,246,0.5)',
  'rgba(20,184,166,0.5)',
  'rgba(234,179,8,0.5)',
  'rgba(239,68,68,0.5)',
  'rgba(34,197,94,0.5)',
  'rgba(249,115,22,0.5)',
]

function courseAccent(name = '') {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return COURSE_ACCENTS[h % COURSE_ACCENTS.length]
}

// Per-user hidden-Canvas-courses key. Canvas connections are user-scoped
// (each account has its own Canvas token), so the hidden-course list must
// be too — same namespacing pattern as quizProgressKey()/flashcardProgressKey().
function hiddenCanvasCoursesKey() {
  try {
    const stored = localStorage.getItem('mt_user')
    const id = stored ? JSON.parse(stored)?.id : null
    return id != null ? `hidden_canvas_courses:${id}` : null
  } catch {
    return null
  }
}

function readHidden() {
  try {
    const key = hiddenCanvasCoursesKey()
    if (!key) return new Set()
    const raw = localStorage.getItem(key)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function writeHidden(set) {
  const key = hiddenCanvasCoursesKey()
  if (key) localStorage.setItem(key, JSON.stringify([...set]))
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Canvas() {
  const [status, setStatus] = useState(null)
  const [statusLoading, setStatusLoading] = useState(true)

  const [courses, setCourses] = useState([])
  const [coursesLoading, setCoursesLoading] = useState(false)

  const [selectedCourse, setSelectedCourse] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [assignmentsLoading, setAssignmentsLoading] = useState(false)

  const [imported, setImported] = useState(new Set())
  const [importing, setImporting] = useState(new Set())

  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)

  // Feature 1: hide/show courses
  const [hiddenCourses, setHiddenCourses] = useState(readHidden)
  const [showManage, setShowManage] = useState(false)

  // Feature 2: assignment filters
  const [dueDateFilter, setDueDateFilter] = useState('upcoming')
  const [assignmentSort, setAssignmentSort] = useState('soonest')

  useEffect(() => { checkStatus() }, [])

  async function checkStatus() {
    setStatusLoading(true)
    try {
      const s = await api.canvasStatus()
      setStatus(s)
      if (s.connected) loadCourses()
    } catch {
      setStatus({ connected: false, reason: 'could not reach backend' })
    } finally {
      setStatusLoading(false)
    }
  }

  async function loadCourses() {
    setCoursesLoading(true)
    try {
      const data = await api.canvasCourses()
      setCourses(data)
    } catch {
      setCourses([])
    } finally {
      setCoursesLoading(false)
    }
  }

  async function selectCourse(course) {
    setSelectedCourse(course)
    setAssignments([])
    setAssignmentsLoading(true)
    setDueDateFilter('upcoming')
    setAssignmentSort('soonest')
    try {
      const data = await api.canvasAssignments(course.id)
      setAssignments(data)
    } catch {
      setAssignments([])
    } finally {
      setAssignmentsLoading(false)
    }
  }

  async function importAssignment(a) {
    const id = a.id
    setImporting((prev) => new Set([...prev, id]))
    try {
      await api.canvasImport(id, a.course_id)
      setImported((prev) => new Set([...prev, id]))
    } catch {}
    setImporting((prev) => { const n = new Set(prev); n.delete(id); return n })
  }

  async function handleSyncAll() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const r = await api.canvasSync()
      setSyncResult({
        ok: true,
        msg: `Synced ${r.courses_synced} course${r.courses_synced !== 1 ? 's' : ''}, imported ${r.total_imported} assignment${r.total_imported !== 1 ? 's' : ''} as notes.`,
      })
    } catch (err) {
      setSyncResult({ ok: false, msg: `Sync failed: ${err.message}` })
    } finally {
      setSyncing(false)
    }
  }

  // Toggle a course's hidden state and persist
  function toggleHideCourse(courseId) {
    setHiddenCourses(prev => {
      const next = new Set(prev)
      if (next.has(courseId)) next.delete(courseId)
      else next.add(courseId)
      writeHidden(next)
      return next
    })
  }

  function showAllCourses() {
    setHiddenCourses(new Set())
    writeHidden(new Set())
  }

  // Filtered courses (Feature 1)
  const visibleCourses = useMemo(
    () => courses.filter(c => !hiddenCourses.has(c.id)),
    [courses, hiddenCourses]
  )

  // Filtered + sorted assignments (Feature 2)
  const filteredAssignments = useMemo(() => {
    let result = [...assignments]
    const now = Date.now()

    if (dueDateFilter === 'upcoming') {
      result = result.filter(a => !a.due_at || new Date(a.due_at).getTime() > now)
    } else if (dueDateFilter === 'past') {
      result = result.filter(a => a.due_at && new Date(a.due_at).getTime() <= now)
    }

    if (assignmentSort === 'soonest') {
      result.sort((a, b) => {
        if (!a.due_at && !b.due_at) return 0
        if (!a.due_at) return 1
        if (!b.due_at) return -1
        return new Date(a.due_at) - new Date(b.due_at)
      })
    } else if (assignmentSort === 'latest') {
      result.sort((a, b) => {
        if (!a.due_at && !b.due_at) return 0
        if (!a.due_at) return 1
        if (!b.due_at) return -1
        return new Date(b.due_at) - new Date(a.due_at)
      })
    } else if (assignmentSort === 'az') {
      result.sort((a, b) => a.name.localeCompare(b.name))
    }

    return result
  }, [assignments, dueDateFilter, assignmentSort])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto fade-in-up">

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-8">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">Canvas LMS</h1>
          <p className="text-sm text-ink-muted mt-1">Michigan Technological University</p>
        </div>
        {status?.connected && (
          <div className="flex items-center gap-2">
            {/* Manage Courses */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowManage(v => !v)}
                className="btn-secondary text-sm"
              >
                Manage Courses
              </button>

              {showManage && (
                <>
                  {/* Backdrop */}
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                    onClick={() => setShowManage(false)}
                  />
                  {/* Dropdown panel */}
                  <div
                    className="card-solid"
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      right: 0,
                      width: 300,
                      maxHeight: 380,
                      overflowY: 'auto',
                      zIndex: 50,
                      padding: '0.75rem',
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-ink-muted uppercase tracking-widest">
                        Courses
                      </span>
                      {hiddenCourses.size > 0 && (
                        <button
                          onClick={showAllCourses}
                          className="text-xs text-accent hover:text-accent-hover transition-colors"
                        >
                          Show All
                        </button>
                      )}
                    </div>
                    {coursesLoading ? (
                      <p className="text-xs text-white/30 py-2">Loading…</p>
                    ) : courses.length === 0 ? (
                      <p className="text-xs text-white/30 py-2">No courses found.</p>
                    ) : (
                      <div className="flex flex-col">
                        {courses.map((course, i) => (
                          <div
                            key={course.id}
                            className="flex items-center justify-between gap-3 py-2"
                            style={{ borderBottom: i < courses.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
                          >
                            <span
                              className="text-sm flex-1 min-w-0 truncate"
                              style={{ color: hiddenCourses.has(course.id) ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.85)' }}
                            >
                              {course.name}
                            </span>
                            <Toggle
                              on={!hiddenCourses.has(course.id)}
                              onChange={() => toggleHideCourse(course.id)}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Sync All */}
            <button onClick={handleSyncAll} disabled={syncing} className="btn-primary">
              {syncing ? (
                <><Spinner size="sm" />Syncing…</>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M2 8a6 6 0 0110.5-4M14 8a6 6 0 01-10.5 4" />
                    <path d="M12.5 4H14.5V2M3.5 12H1.5v2" strokeLinejoin="round" />
                  </svg>
                  Sync All
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Sync result banner */}
      {syncResult && (
        <div
          className={`mb-6 card p-3.5 flex items-center gap-2.5 text-sm ${
            syncResult.ok ? 'text-emerald-300' : 'text-red-400'
          }`}
        >
          {syncResult.ok ? (
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.2 5.3l-3.7 3.7a.75.75 0 01-1.06 0L4.8 8.3a.75.75 0 111.06-1.06l1.1 1.1 3.18-3.17a.75.75 0 111.06 1.06z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a7 7 0 100 14A7 7 0 008 1zM7.25 4.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zm.75 7a.75.75 0 100-1.5.75.75 0 000 1.5z" />
            </svg>
          )}
          {syncResult.msg}
          <button onClick={() => setSyncResult(null)} className="ml-auto text-white/20 hover:text-white/50 transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Connection status card ──────────────────────────────────────────── */}
      {statusLoading ? (
        <div className="card p-5 mb-8 flex items-center gap-3">
          <Spinner size="sm" />
          <span className="text-sm text-ink-muted">Checking Canvas connection…</span>
        </div>
      ) : status?.connected ? (
        <div className="card p-5 mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0"
              style={{ boxShadow: '0 0 8px rgba(52,211,153,0.7)' }}
            />
            <div>
              <p className="text-sm font-medium text-ink-primary">Connected to Canvas</p>
              <p className="text-xs text-ink-muted mt-0.5">
                {status.courses_visible} active course{status.courses_visible !== 1 ? 's' : ''} visible
              </p>
            </div>
          </div>
          <Link to="/settings" className="btn-ghost text-xs">
            Manage in Settings
          </Link>
        </div>
      ) : (
        <div className="card p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-2 rounded-full bg-zinc-600 flex-shrink-0" />
            <p className="text-sm font-medium text-ink-secondary">Not connected to Canvas</p>
            {status?.reason && (
              <span className="text-xs text-ink-faint">— {status.reason}</span>
            )}
          </div>
          <p className="text-sm text-ink-muted mb-4">
            Connect your Canvas account in{' '}
            <Link to="/settings" className="text-accent hover:text-accent-hover underline underline-offset-2">
              Settings
            </Link>{' '}
            to import assignments and sync your courses.
          </p>
          <Link to="/settings" className="btn-primary inline-flex">
            Go to Settings
          </Link>
        </div>
      )}

      {/* ── Courses grid ────────────────────────────────────────────────────── */}
      {status?.connected && !selectedCourse && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-ink-secondary">Your Courses</h2>
            {!coursesLoading && courses.length > 0 && (
              <span className="text-xs text-white/30">
                Showing {visibleCourses.length} of {courses.length} course{courses.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {coursesLoading ? (
            <div className="flex items-center gap-2 text-ink-muted text-sm">
              <Spinner size="sm" />Loading courses…
            </div>
          ) : visibleCourses.length === 0 ? (
            <div className="card p-10 flex flex-col items-center gap-3 text-center">
              <svg className="w-8 h-8 text-white/10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 19V6a2 2 0 012-2h12a2 2 0 012 2v13"/><path d="M9 22H5a2 2 0 01-2-2v-1h18v1a2 2 0 01-2 2h-4"/></svg>
              {courses.length > 0 ? (
                <>
                  <p className="text-sm text-white/30">All courses are hidden.</p>
                  <button onClick={showAllCourses} className="text-xs text-accent hover:text-accent-hover transition-colors">
                    Show All
                  </button>
                </>
              ) : (
                <p className="text-sm text-white/30">No active courses found.</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleCourses.map((course) => {
                const accent = courseAccent(course.name)
                return (
                  <button
                    key={course.id}
                    onClick={() => selectCourse(course)}
                    className="card p-5 text-left group transition-all duration-200 hover:border-accent/30 card-lift"
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(99,102,241,0.06)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                    style={{ borderLeft: `3px solid ${accent}` }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink-primary leading-snug">{course.name}</p>
                        {course.code && (
                          <p className="text-[11px] font-mono text-ink-faint mt-1">{course.code}</p>
                        )}
                      </div>
                      <span className="flex-shrink-0 text-zinc-700 group-hover:text-accent transition-colors mt-0.5">
                        <ChevronRight />
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* ── Assignments panel ───────────────────────────────────────────────── */}
      {status?.connected && selectedCourse && (
        <section>
          <div className="flex items-center gap-2 mb-5">
            <button
              onClick={() => { setSelectedCourse(null); setAssignments([]) }}
              className="btn-ghost text-xs flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13L5 8l5-5" />
              </svg>
              Courses
            </button>
            <span className="text-zinc-700 text-xs">/</span>
            <span className="text-sm font-medium text-ink-secondary truncate max-w-xs">
              {selectedCourse.name}
            </span>
          </div>

          {/* Filter bar */}
          {!assignmentsLoading && assignments.length > 0 && (
            <div className="card p-3 mb-5 flex flex-col sm:flex-row gap-2.5">
              <select
                className="input sm:w-44"
                value={dueDateFilter}
                onChange={e => setDueDateFilter(e.target.value)}
              >
                <option value="upcoming">Upcoming</option>
                <option value="past">Past due</option>
                <option value="all">All</option>
              </select>
              <select
                className="input sm:w-44"
                value={assignmentSort}
                onChange={e => setAssignmentSort(e.target.value)}
              >
                <option value="soonest">Due soonest</option>
                <option value="latest">Due latest</option>
                <option value="az">A–Z</option>
              </select>
              <span className="self-center text-xs text-white/25 sm:ml-auto">
                {filteredAssignments.length} of {assignments.length}
              </span>
            </div>
          )}

          {assignmentsLoading ? (
            <div className="flex items-center gap-2 text-ink-muted text-sm">
              <Spinner size="sm" />Loading assignments…
            </div>
          ) : filteredAssignments.length === 0 ? (
            <div className="card p-10 flex flex-col items-center gap-3 text-center">
              <svg className="w-8 h-8 text-white/10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
              {assignments.length > 0 ? (
                <>
                  <p className="text-sm text-white/30">No assignments match the current filter.</p>
                  <button
                    onClick={() => { setDueDateFilter('all'); setAssignmentSort('soonest') }}
                    className="text-xs text-accent hover:text-accent-hover transition-colors"
                  >
                    Show all assignments
                  </button>
                </>
              ) : (
                <p className="text-sm text-white/30">No assignments found for this course.</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAssignments.map((a) => {
                const urgency = dueUrgency(a.due_at)
                const u = U[urgency]
                const isImported = imported.has(a.id)
                const isImporting = importing.has(a.id)

                return (
                  <div key={a.id} className="card p-5 flex items-start gap-4">
                    <div
                      className={`flex-shrink-0 w-1.5 h-1.5 rounded-full mt-[7px] ${u.dot}`}
                      style={{ boxShadow: u.shadow }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink-primary leading-snug">{a.name}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {a.due_at ? (
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${u.text}`}
                            style={{
                              background: urgency === 'critical' ? 'rgba(248,113,113,0.1)'
                                : urgency === 'warning' ? 'rgba(251,191,36,0.1)'
                                : 'rgba(255,255,255,0.05)',
                              border: `1px solid ${urgency === 'critical' ? 'rgba(248,113,113,0.25)' : urgency === 'warning' ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.08)'}`,
                            }}
                          >
                            Due {formatDue(a.due_at)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[11px] text-white/25 px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
                            No due date
                          </span>
                        )}
                        {a.points_possible != null && (
                          <span className="text-[11px] text-white/30 px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>{a.points_possible} pts</span>
                        )}
                        {a.submission_types?.length > 0 && (
                          <span className="text-[11px] text-white/25 capitalize px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            {a.submission_types[0].replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                      {a.description && (
                        <p className="text-xs text-ink-muted mt-2 leading-relaxed line-clamp-2">
                          {a.description}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => !isImported && !isImporting && importAssignment(a)}
                      disabled={isImported || isImporting}
                      className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                        isImported ? 'text-emerald-400 cursor-default' : 'btn-secondary'
                      }`}
                      style={
                        isImported
                          ? { background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.18)' }
                          : undefined
                      }
                    >
                      {isImporting ? (
                        <Spinner size="sm" />
                      ) : isImported ? (
                        <><CheckIcon />Imported</>
                      ) : (
                        <><ImportIcon />Import</>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
