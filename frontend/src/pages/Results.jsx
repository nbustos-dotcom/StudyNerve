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
      <div className="flex-1 h-1.5 bg-[#1e1e2e] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-medium tabular-nums w-8 text-right ${textColor}`}>
        {pct}%
      </span>
    </div>
  )
}

export default function Results() {
  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sortBy, setSortBy] = useState('accuracy') // 'accuracy' | 'attempts' | 'name'
  const [sortDir, setSortDir] = useState('desc')

  useEffect(() => {
    api.getTopicStats()
      .then(setTopics)
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
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-slate-100">Results</h1>
        <p className="text-sm text-slate-500 mt-1">Per-topic accuracy from all your quiz attempts</p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Spinner /> Loading…
        </div>
      )}

      {error && (
        <div className="card p-4 border-red-500/20 bg-red-500/5 text-red-400 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && topics.length === 0 && (
        <div className="text-center py-20 text-slate-500 text-sm">
          No attempts yet. Complete a quiz to see your results here.
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
