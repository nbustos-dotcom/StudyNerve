import { useEffect, useState } from 'react'
import { api } from '../api/client'

function Spinner() {
  return (
    <svg className="animate-spin w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

function AccuracyBar({ value }) {
  const pct = Math.round(value * 100)
  const color =
    pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'
  const textColor =
    pct >= 70 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-red-400'
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full bar-animate ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-medium tabular-nums w-8 text-right ${textColor}`}>
        {pct}%
      </span>
    </div>
  )
}

export default function Results() {
  const [topics, setTopics] = useState([])
  const [gaps, setGaps] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sortBy, setSortBy] = useState('accuracy') // 'accuracy' | 'attempts' | 'name'
  const [sortDir, setSortDir] = useState('desc')

  useEffect(() => {
    Promise.all([
      api.getTopicStats(),
      api.getGaps().catch(() => []),
    ])
      .then(([t, g]) => { setTopics(t); setGaps(g) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function handleSort(col) {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(col)
      setSortDir('desc')
    }
  }

  const sorted = [...topics].sort((a, b) => {
    let av, bv
    if (sortBy === 'accuracy') { av = a.accuracy; bv = b.accuracy }
    else if (sortBy === 'attempts') { av = a.total_attempts; bv = b.total_attempts }
    else { av = a.topic_name.toLowerCase(); bv = b.topic_name.toLowerCase() }
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const SortIcon = ({ col }) => {
    if (sortBy !== col) return <span className="text-slate-600 ml-1">↕</span>
    return <span className="text-indigo-400 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const thCls = 'text-left text-xs font-medium text-slate-500 uppercase tracking-wider py-3 px-4 cursor-pointer hover:text-slate-300 select-none transition-colors'

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto fade-in-up">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-slate-100">Results</h1>
        <p className="text-sm text-slate-500 mt-1">Per-topic accuracy and weak areas from your quiz attempts</p>
      </div>

      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="card p-4">
                <div className="skeleton h-3 w-28 mb-3 rounded" />
                <div className="skeleton h-2 w-full mb-2 rounded" />
                <div className="skeleton h-2 w-16 rounded" />
              </div>
            ))}
          </div>
          <div className="card overflow-hidden">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-white/[0.04]">
                <div className="skeleton h-3 w-40 rounded" />
                <div className="skeleton h-3 w-12 ml-auto rounded" />
                <div className="skeleton h-3 w-12 rounded" />
                <div className="skeleton h-2 w-32 rounded" />
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="card p-4 border-red-500/20 bg-red-500/5 text-red-400 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && topics.length === 0 && (
        <div className="card p-10 flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}>
            <svg className="w-7 h-7 text-indigo-400/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
            </svg>
          </div>
          <div>
            <p className="text-slate-300 font-medium mb-1">No results yet</p>
            <p className="text-sm text-slate-500">Complete a quiz to see your per-topic results here.</p>
          </div>
        </div>
      )}

      {/* Weak Areas */}
      {gaps.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-slate-300 mb-3">Weak Areas</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {gaps.slice(0, 5).map((g) => {
              const pct = Math.round(g.accuracy * 100)
              const barColor = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'
              const textColor = pct >= 70 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-red-400'
              return (
                <div key={g.topic_id} className="card p-4">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-sm text-slate-200 font-medium truncate max-w-[70%]">{g.topic_name}</p>
                    <span className={`text-sm font-semibold tabular-nums ${textColor}`}>{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full bar-animate ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-slate-600 mt-2">{g.total_attempts} attempt{g.total_attempts !== 1 ? 's' : ''}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {sorted.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-[#1e1e2e]">
              <tr>
                <th className={thCls} onClick={() => handleSort('name')}>
                  Topic <SortIcon col="name" />
                </th>
                <th className={`${thCls} text-right`} onClick={() => handleSort('attempts')}>
                  Attempts <SortIcon col="attempts" />
                </th>
                <th className={`${thCls} text-right`}>Correct</th>
                <th className={`${thCls} min-w-[180px]`} onClick={() => handleSort('accuracy')}>
                  Accuracy <SortIcon col="accuracy" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e2e]">
              {sorted.map((t) => (
                <tr key={t.topic_id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-4">
                    <span className="text-sm text-slate-200">{t.topic_name}</span>
                  </td>
                  <td className="py-3 px-4 text-right text-sm text-slate-400 tabular-nums">
                    {t.total_attempts}
                  </td>
                  <td className="py-3 px-4 text-right text-sm text-slate-400 tabular-nums">
                    {t.correct_attempts}
                  </td>
                  <td className="py-3 px-4">
                    <AccuracyBar value={t.accuracy} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="px-4 py-3 border-t border-[#1e1e2e] flex justify-between text-xs text-slate-600">
            <span>{topics.length} topic{topics.length !== 1 ? 's' : ''}</span>
            <span>
              {topics.reduce((s, t) => s + t.total_attempts, 0)} total attempts ·{' '}
              {topics.reduce((s, t) => s + t.correct_attempts, 0)} correct
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
