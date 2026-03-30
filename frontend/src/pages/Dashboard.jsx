import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="card p-6">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">{label}</p>
      <p className={`text-3xl font-semibold ${accent || 'text-slate-100'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}

function AccuracyRing({ value }) {
  const pct = Math.round(value * 100)
  const color = pct >= 70 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-red-400'
  return (
    <div className="card p-6">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Overall Accuracy</p>
      <p className={`text-3xl font-semibold ${color}`}>{pct}%</p>
      <div className="mt-3 h-1.5 bg-[#1e1e2e] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function WeakAreaCard({ topic }) {
  const pct = Math.round(topic.accuracy * 100)
  const barColor = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'
  const textColor = pct >= 70 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-red-400'
  return (
    <div className="card p-4">
      <div className="flex justify-between items-start mb-2">
        <p className="text-sm text-slate-200 font-medium truncate max-w-[70%]">{topic.topic_name}</p>
        <span className={`text-sm font-semibold tabular-nums ${textColor}`}>{pct}%</span>
      </div>
      <div className="h-1.5 bg-[#1e1e2e] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-slate-600 mt-2">{topic.total_attempts} attempt{topic.total_attempts !== 1 ? 's' : ''}</p>
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
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-slate-100">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Your study overview</p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Spinner small /> Loading stats…
        </div>
      )}

      {error && (
        <div className="card p-4 border-red-500/20 bg-red-500/5 text-red-400 text-sm">
          Could not load stats: {error}
        </div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard label="Notes" value={stats.total_notes} sub="uploaded" />
            <StatCard label="Questions" value={stats.total_questions} sub="generated" />
            <StatCard label="Attempts" value={stats.total_attempts} sub="answered" />
            <AccuracyRing value={stats.overall_accuracy} />
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
              <div className="card p-6 text-center text-slate-500 text-sm">
                Take some quizzes to see your weak areas.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {gaps.slice(0, 5).map((g) => (
                  <WeakAreaCard key={g.topic_id} topic={g} />
                ))}
              </div>
            )}
          </div>

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
                      <div className="h-1 bg-[#1e1e2e] rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {stats.total_notes === 0 && (
            <div className="card p-8 text-center">
              <p className="text-slate-500 text-sm mb-3">No notes yet. Add your first note to get started.</p>
              <Link to="/notes" className="btn-primary inline-block">Add a Note</Link>
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
