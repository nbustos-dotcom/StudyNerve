import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'

// ── Due-date helpers (shared with Canvas page) ────────────────────────────────

function dueUrgency(iso) {
  if (!iso) return 'none'
  const diff = new Date(iso).getTime() - Date.now()
  if (diff < 0) return 'past'
  const days = diff / 86400000
  if (days < 2) return 'critical'
  if (days < 7) return 'warning'
  return 'normal'
}

function formatDueShort(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const DUE_COLORS = {
  critical: 'text-red-400',
  warning:  'text-amber-400',
  past:     'text-slate-600',
  normal:   'text-slate-400',
  none:     'text-slate-500',
}

// ── Upcoming Deadlines widget ─────────────────────────────────────────────────

function UpcomingDeadlines() {
  const [items, setItems] = useState(null)    // null = loading, [] = empty / not connected
  const [connected, setConnected] = useState(null)

  useEffect(() => {
    api.canvasStatus()
      .then((s) => {
        setConnected(s.connected)
        if (s.connected) {
          return api.canvasUpcoming(14).then(setItems)
        } else {
          setItems([])
        }
      })
      .catch(() => { setConnected(false); setItems([]) })
  }, [])

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-slate-300">Upcoming Deadlines</h2>
        {connected && items?.length > 0 && (
          <Link to="/canvas" className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
            View Canvas →
          </Link>
        )}
      </div>

      {items === null && (
        <div className="card p-4 flex items-center gap-2 text-slate-500 text-sm">
          <svg className="animate-spin w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading deadlines…
        </div>
      )}

      {items !== null && !connected && (
        <div className="card p-5 flex items-center justify-between">
          <p className="text-sm text-slate-500">Connect Canvas to see your upcoming deadlines.</p>
          <Link to="/canvas" className="btn-secondary text-xs ml-4 flex-shrink-0">
            Connect Canvas
          </Link>
        </div>
      )}

      {items !== null && connected && items.length === 0 && (
        <div className="card p-8 flex flex-col items-center justify-center text-sm text-white/30 gap-3">
          <svg className="w-8 h-8 text-white/10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          Nothing due in the next 14 days.
        </div>
      )}

      {items !== null && connected && items.length > 0 && (
        <div className="card divide-y divide-white/[0.04]">
          {items.slice(0, 5).map((a) => {
            const urgency = dueUrgency(a.due_at)
            return (
              <div
              key={`${a.id}-${a.course_id}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.02]"
              style={{
                borderLeft: `2px solid ${
                  urgency === 'critical' ? 'rgba(248,113,113,0.7)'
                  : urgency === 'warning' ? 'rgba(251,191,36,0.6)'
                  : 'rgba(255,255,255,0.08)'
                }`,
              }}
            >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate">{a.name}</p>
                  {a.course_name && (
                    <p className="text-[11px] text-slate-600 truncate mt-0.5">{a.course_name}</p>
                  )}
                </div>
                <span className={`text-xs flex-shrink-0 tabular-nums ${DUE_COLORS[urgency]}`}>
                  {formatDueShort(a.due_at)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="card p-6 card-lift">
      <p className="text-[11px] font-medium text-white/30 uppercase tracking-widest mb-3">{label}</p>
      <p className={`text-[2rem] font-bold leading-none ${accent || 'text-slate-100'}`}>{value}</p>
      {sub && <p className="text-xs text-white/30 mt-2 uppercase tracking-wider">{sub}</p>}
    </div>
  )
}

function AccuracyRing({ value }) {
  const pct = Math.round(value * 100)
  const color = pct >= 70 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-red-400'
  const barColor = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="card p-6 card-lift">
      <p className="text-[11px] font-medium text-white/30 uppercase tracking-widest mb-3">Overall Accuracy</p>
      <p className={`text-[2rem] font-bold leading-none ${color}`}>{pct}%</p>
      <div className="mt-3 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full bar-animate ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function WeakAreaCard({ topic }) {
  const pct = Math.round(topic.accuracy * 100)
  const barColor = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'
  const textColor = pct >= 70 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-red-400'
  return (
    <div className="card p-4 card-lift">
      <div className="flex justify-between items-start mb-2">
        <p className="text-sm text-slate-200 font-medium truncate max-w-[70%]">{topic.topic_name}</p>
        <span className={`text-sm font-semibold tabular-nums ${textColor}`}>{pct}%</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full bar-animate ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-white/25 mt-2">{topic.total_attempts} attempt{topic.total_attempts !== 1 ? 's' : ''}</p>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [gaps, setGaps] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      api.getOverviewStats(),
      api.getGaps().catch(() => []),
    ])
      .then(([s, g]) => { setStats(s); setGaps(g) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto fade-in-up">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-slate-100">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Your study overview</p>
      </div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-6">
              <div className="skeleton h-3 w-20 mb-4 rounded" />
              <div className="skeleton h-8 w-16 mb-2 rounded" />
              <div className="skeleton h-2 w-12 rounded" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="card p-4 border-red-500/20 bg-red-500/5 text-red-400 text-sm">
          Could not load stats: {error}
        </div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="stagger-1"><StatCard label="Notes" value={stats.total_notes} sub="uploaded" /></div>
            <div className="stagger-2"><StatCard label="Questions" value={stats.total_questions} sub="generated" /></div>
            <div className="stagger-3"><StatCard label="Attempts" value={stats.total_attempts} sub="answered" /></div>
            <div className="stagger-4"><AccuracyRing value={stats.overall_accuracy} /></div>
          </div>

          {/* Weak Areas */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-slate-300">Weak Areas</h2>
              {gaps && gaps.length > 0 && (
                <span className="text-xs text-slate-600">ranked by gap score</span>
              )}
            </div>
            {!gaps || gaps.length === 0 ? (
              <div className="card p-8 flex flex-col items-center gap-3 text-center">
                <svg className="w-8 h-8 text-white/10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                <p className="text-sm text-white/30">Take some quizzes to see your weak areas.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {gaps.slice(0, 5).map((g) => (
                  <WeakAreaCard key={g.topic_id} topic={g} />
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Deadlines — Canvas integration */}
          <UpcomingDeadlines />

          {stats.topic_accuracies.length > 0 && (
            <div className="card p-6">
              <h2 className="text-sm font-medium text-slate-300 mb-4">Top Topics</h2>
              <div className="space-y-3">
                {stats.topic_accuracies.slice(0, 6).map((t) => {
                  const pct = Math.round(t.accuracy * 100)
                  const barColor =
                    pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'
                  return (
                    <div key={t.topic_id}>
                      <div className="flex justify-between text-xs text-slate-400 mb-1">
                        <span className="truncate max-w-[60%]">{t.topic_name}</span>
                        <span className="text-slate-500">
                          {t.correct_attempts}/{t.total_attempts} · {pct}%
                        </span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full bar-animate ${barColor}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {stats.total_notes === 0 && (
            <div className="card p-10 flex flex-col items-center gap-4 text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <svg className="w-7 h-7 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M12 12v6M9 15h6"/>
                </svg>
              </div>
              <div>
                <p className="text-slate-300 font-medium mb-1">No notes yet</p>
                <p className="text-sm text-slate-500">Add your first set of study material to get started.</p>
              </div>
              <Link to="/notes" className="btn-primary">Add a Note</Link>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Spinner({ small }) {
  return (
    <svg
      className={`animate-spin ${small ? 'w-4 h-4' : 'w-6 h-6'} text-indigo-400`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}
