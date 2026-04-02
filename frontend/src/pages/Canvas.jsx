import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'

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
  past:     { text: 'text-slate-600', dot: 'bg-slate-700',  shadow: 'none'                           },
  normal:   { text: 'text-slate-400', dot: 'bg-slate-600',  shadow: 'none'                           },
  none:     { text: 'text-slate-500', dot: 'bg-slate-700',  shadow: 'none'                           },
}

// ── Tiny shared components ────────────────────────────────────────────────────

function Spinner({ small }) {
  return (
    <svg className={`animate-spin ${small ? 'w-4 h-4' : 'w-5 h-5'} text-indigo-400`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-5xl mx-auto">

      {/* Page header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Canvas LMS</h1>
          <p className="text-sm text-slate-500 mt-1">Michigan Technological University</p>
        </div>
        {status?.connected && (
          <button onClick={handleSyncAll} disabled={syncing} className="btn-primary">
            {syncing ? (
              <><Spinner small />Syncing…</>
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
          <Spinner small />
          <span className="text-sm text-slate-500">Checking Canvas connection…</span>
        </div>
      ) : status?.connected ? (
        <div className="card p-5 mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0"
              style={{ boxShadow: '0 0 8px rgba(52,211,153,0.7)' }}
            />
            <div>
              <p className="text-sm font-medium text-slate-200">Connected to Canvas</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {status.courses_visible} active course{status.courses_visible !== 1 ? 's' : ''} visible
              </p>
            </div>
          </div>
          <Link
            to="/settings"
            className="btn-ghost text-xs"
          >
            Manage in Settings
          </Link>
        </div>
      ) : (
        <div className="card p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-2 rounded-full bg-slate-600 flex-shrink-0" />
            <p className="text-sm font-medium text-slate-300">Not connected to Canvas</p>
            {status?.reason && (
              <span className="text-xs text-slate-600">— {status.reason}</span>
            )}
          </div>
          <p className="text-sm text-slate-500 mb-4">
            Connect your Canvas account in{' '}
            <Link to="/settings" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
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
          <h2 className="text-sm font-medium text-slate-300 mb-4">Your Courses</h2>

          {coursesLoading ? (
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <Spinner small />Loading courses…
            </div>
          ) : courses.length === 0 ? (
            <div className="card p-8 text-center text-sm text-slate-500">
              No active courses found.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {courses.map((course) => (
                <button
                  key={course.id}
                  onClick={() => selectCourse(course)}
                  className="card p-5 text-left group transition-all duration-200 hover:border-indigo-500/30"
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(99,102,241,0.07)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-200 leading-snug">{course.name}</p>
                      {course.code && (
                        <p className="text-[11px] font-mono text-slate-600 mt-1">{course.code}</p>
                      )}
                    </div>
                    <span className="flex-shrink-0 text-slate-700 group-hover:text-indigo-400 transition-colors mt-0.5">
                      <ChevronRight />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Assignments panel ───────────────────────────────────────────────── */}
      {status?.connected && selectedCourse && (
        <section>
          <div className="flex items-center gap-2 mb-6">
            <button
              onClick={() => { setSelectedCourse(null); setAssignments([]) }}
              className="btn-ghost text-xs flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13L5 8l5-5" />
              </svg>
              Courses
            </button>
            <span className="text-slate-700 text-xs">/</span>
            <span className="text-sm font-medium text-slate-300 truncate max-w-xs">
              {selectedCourse.name}
            </span>
          </div>

          {assignmentsLoading ? (
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <Spinner small />Loading assignments…
            </div>
          ) : assignments.length === 0 ? (
            <div className="card p-8 text-center text-sm text-slate-500">
              No assignments found for this course.
            </div>
          ) : (
            <div className="space-y-3">
              {assignments.map((a) => {
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
                      <p className="text-sm font-medium text-slate-200 leading-snug">{a.name}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                        <span className={`text-xs ${u.text}`}>
                          {a.due_at ? `Due ${formatDue(a.due_at)}` : 'No due date'}
                        </span>
                        {a.points_possible != null && (
                          <span className="text-xs text-slate-600">{a.points_possible} pts</span>
                        )}
                        {a.submission_types?.length > 0 && (
                          <span className="text-xs text-slate-700 capitalize">
                            {a.submission_types[0].replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                      {a.description && (
                        <p className="text-xs text-slate-500 mt-2 leading-relaxed line-clamp-2">
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
                        <Spinner small />
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
