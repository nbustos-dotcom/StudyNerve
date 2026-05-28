import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import {
  NotebookPen, GraduationCap, MessagesSquare,
  FileStack, CircleHelp, Target, TrendingUp,
  FileText, Brain,
} from 'lucide-react'

// ── Greeting helpers ──────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function getUserFirstName() {
  try {
    const raw = localStorage.getItem('user') || ''
    if (!raw) return ''
    const u = JSON.parse(raw)
    const full = u.name || u.full_name || u.username || u.email || ''
    return full.split(/[\s@]/)[0]
  } catch { return '' }
}

// ── Due-date helpers ──────────────────────────────────────────────────────────

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
  past:     'text-zinc-600',
  normal:   'text-zinc-500',
  none:     'text-zinc-500',
}

// ── Relative time helper ──────────────────────────────────────────────────────

function formatRelative(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7)  return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Smart Hero Card ───────────────────────────────────────────────────────────

function SmartHeroCard({ gaps, onDismiss, onStudyNow, studyNowLoading }) {
  const topGap = gaps?.[0] ?? null
  const showCta = !!topGap

  let message
  if (topGap) {
    const pct = Math.round(topGap.accuracy * 100)
    message = `Your weakest topic is ${topGap.topic_name} (${pct}% accuracy)`
  } else {
    message = "You're on track. Add notes or take a quiz to keep going."
  }

  return (
    <div className="hero-card mb-4">
      <div className="hero-card-inner relative">
        <p className="text-[11px] font-semibold tracking-widest uppercase text-zinc-500 mb-2">Smart Pick</p>
        <p className="text-[15px] text-zinc-100 leading-snug">{message}</p>
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <button
            onClick={onStudyNow}
            disabled={studyNowLoading}
            className="btn-primary inline-flex items-center gap-2 text-sm btn-glow"
          >
            {studyNowLoading ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Finding your weakest spot…
              </>
            ) : (
              'Study Now'
            )}
          </button>
          {showCta && (
            <Link to="/quiz" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
              Custom quiz →
            </Link>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 text-white/20 hover:text-white/50 transition-colors"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── Quick Actions ─────────────────────────────────────────────────────────────

function QuickActions() {
  return (
    <div className="flex gap-3 mt-4 mb-4 flex-wrap">
      {[
        { Icon: NotebookPen,    label: 'Add Notes',  href: '/notes' },
        { Icon: GraduationCap,  label: 'Take Quiz',  href: '/quiz'  },
        { Icon: MessagesSquare, label: 'Open Tutor', href: '/chat'  },
      ].map(({ Icon, label, href }) => (
        <Link key={href} to={href} className="pill-action">
          <Icon size={16} strokeWidth={1.5} />
          <span>{label}</span>
        </Link>
      ))}
    </div>
  )
}

// ── Weekly Study Grid ─────────────────────────────────────────────────────────

function WeeklyStudyGrid({ quizHistory, notes }) {
  const activeDays = new Set()
  quizHistory.forEach((q) => { if (q.completed_at) activeDays.add(new Date(q.completed_at).toDateString()) })
  notes.forEach((n) => { if (n.created_at) activeDays.add(new Date(n.created_at).toDateString()) })

  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push({ date: d, active: activeDays.has(d.toDateString()) })
  }

  let streak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].active) streak++
    else break
  }

  const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

  return (
    <div className="card p-4 mb-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">This Week</p>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          {days.map(({ date, active }, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div
                className={`w-5 h-5 rounded-full transition-colors ${active ? 'bg-accent' : 'bg-white/[0.06]'}`}
                title={date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              />
              <span className="text-[9px] text-zinc-600 select-none">{DAY_LABELS[date.getDay()]}</span>
            </div>
          ))}
        </div>
        {streak > 0
          ? <span className="text-sm font-medium text-zinc-400">{streak} day{streak !== 1 ? 's' : ''} streak</span>
          : <span className="text-xs text-zinc-600">No streak yet</span>
        }
      </div>
    </div>
  )
}

// ── Activity Feed ─────────────────────────────────────────────────────────────

function ActivityFeed({ quizHistory, notes }) {
  const items = []

  quizHistory.slice(0, 5).forEach((q) => {
    const pct = q.total_questions > 0 ? Math.round((q.score / q.total_questions) * 100) : 0
    items.push({ type: 'quiz', label: `Scored ${pct}% on ${q.note_title} quiz`, time: q.completed_at, pct })
  })

  notes.slice(0, 5).forEach((n) => {
    items.push({ type: 'note', label: `Added note: ${n.title}`, time: n.created_at, pct: null })
  })

  items.sort((a, b) => new Date(b.time) - new Date(a.time))
  const top5 = items.slice(0, 5)

  return (
    <div className="card p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3"><span className="w-1 h-1 rounded-full bg-accent inline-block mr-2 align-middle" />Recent Activity</h2>
      {top5.length === 0 ? (
        <p className="text-sm text-zinc-600 py-2">No activity yet.</p>
      ) : (
        <div className="space-y-0.5">
          {top5.map((item, i) => {
            const Icon = item.type === 'note' ? FileText : Brain
            return (
              <div key={i} className="flex items-center gap-3 rounded-md px-2 -mx-2 py-1.5 hover:bg-white/[0.04] transition-colors">
                <Icon size={14} strokeWidth={1.5} className="text-zinc-500 flex-shrink-0" />
                <span className="text-sm text-zinc-400 flex-1 truncate">{item.label}</span>
                <span className="text-xs text-zinc-600 flex-shrink-0 tabular-nums">{formatRelative(item.time)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Upcoming Deadlines widget ─────────────────────────────────────────────────

function UpcomingDeadlines() {
  const [items, setItems] = useState(null)
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
    <div className="mb-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Upcoming Deadlines</h2>
        {connected && items?.length > 0 && (
          <Link to="/canvas" className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
            View Canvas →
          </Link>
        )}
      </div>

      {items === null && (
        <div className="card p-4 flex items-center gap-2 text-zinc-500 text-sm">
          <svg className="animate-spin w-4 h-4 flex-shrink-0 text-accent" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading deadlines…
        </div>
      )}

      {items !== null && !connected && (
        <div className="card p-5 flex items-center justify-between">
          <p className="text-sm text-zinc-400">Connect Canvas to see your upcoming deadlines.</p>
          <Link to="/canvas" className="btn-secondary text-xs ml-4 flex-shrink-0">
            Connect Canvas
          </Link>
        </div>
      )}

      {items !== null && connected && items.length === 0 && (
        <div className="card p-8 flex flex-col items-center justify-center text-sm text-zinc-600 gap-3">
          <svg className="w-8 h-8 text-zinc-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
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
                  <p className="text-sm text-zinc-100 truncate">{a.name}</p>
                  {a.course_name && (
                    <p className="text-[11px] text-zinc-600 truncate mt-0.5">{a.course_name}</p>
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

// ── Stat cards ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon }) {
  return (
    <div className="card stat-card overflow-hidden flex flex-col">
      <div className="p-5 flex-1">
        <div className="flex items-center gap-1.5 mb-3">
          {Icon && <Icon size={14} strokeWidth={1.5} className="text-zinc-500" />}
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
        </div>
        <p className="text-3xl font-semibold leading-none text-zinc-100">{value}</p>
        {sub && <p className="text-xs text-zinc-500 mt-2 uppercase tracking-wider">{sub}</p>}
      </div>
      <div className="h-[3px] mx-5 mb-4 rounded-full bg-zinc-800 overflow-hidden">
        <div className="h-full w-1/3 rounded-full bg-accent/40 progress-glow" />
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: 'linear-gradient(to right, transparent, rgba(124,58,237,0.4) 50%, transparent)' }} />
    </div>
  )
}

function AccuracyRing({ value }) {
  const pct = Math.round(value * 100)
  return (
    <div className="card p-5 stat-card overflow-hidden relative">
      <div className="flex items-center gap-1.5 mb-3">
        <TrendingUp size={14} strokeWidth={1.5} className="text-zinc-500" />
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Overall Accuracy</p>
      </div>
      <p className="text-3xl font-semibold leading-none text-accent">{pct}%</p>
      <div className="mt-3 h-[3px] bg-zinc-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full bar-animate bg-accent progress-glow" style={{ width: `${pct}%` }} />
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: 'linear-gradient(to right, transparent, rgba(124,58,237,0.4) 50%, transparent)' }} />
    </div>
  )
}

function WeakAreaCard({ topic, className = '' }) {
  const pct = Math.round(topic.accuracy * 100)
  return (
    <div className={`card p-4 card-hover ${className}`}>
      <div className="flex justify-between items-start mb-2">
        <p className="text-sm text-zinc-100 font-medium truncate max-w-[70%]">{topic.topic_name}</p>
        <span className="text-sm font-semibold tabular-nums text-zinc-400">{pct}%</span>
      </div>
      <div className="h-[3px] bg-zinc-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full bar-animate bg-accent progress-glow" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-zinc-600 mt-2">{topic.total_attempts} attempt{topic.total_attempts !== 1 ? 's' : ''}</p>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [gaps, setGaps] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [topicExpanded, setTopicExpanded] = useState(false)
  const [topicStats, setTopicStats] = useState(null)
  const [topicLoading, setTopicLoading] = useState(false)
  const [topicSortBy, setTopicSortBy] = useState('accuracy')
  const [topicSortDir, setTopicSortDir] = useState('desc')
  const [heroHidden, setHeroHidden] = useState(false)
  const [quizHistory, setQuizHistory] = useState([])
  const [recentNotes, setRecentNotes] = useState([])
  const [studyNowLoading, setStudyNowLoading] = useState(false)

  useEffect(() => {
    Promise.allSettled([
      api.getOverviewStats(),
      api.getGaps(),
      api.getQuizHistory(),
      api.getNotes(),
    ]).then(([statsRes, gapsRes, historyRes, notesRes]) => {
      if (statsRes.status === 'fulfilled') setStats(statsRes.value)
      else setError(statsRes.reason?.message ?? 'Failed to load stats')
      setGaps(gapsRes.status === 'fulfilled' ? (gapsRes.value ?? []) : [])
      setQuizHistory(historyRes.status === 'fulfilled' ? (historyRes.value ?? []) : [])
      setRecentNotes(notesRes.status === 'fulfilled' ? (notesRes.value ?? []).slice(0, 5) : [])
    }).finally(() => setLoading(false))
  }, [])

  async function handleStudyNow() {
    setStudyNowLoading(true)
    try {
      const result = await api.studyNow()
      if (result.error) {
        navigate('/notes')
        return
      }
      navigate('/quiz', { state: { studyNow: result } })
    } catch (e) {
      console.error(e)
    } finally {
      setStudyNowLoading(false)
    }
  }

  function toggleTopics() {
    if (!topicExpanded && topicStats === null) {
      setTopicLoading(true)
      api.getTopicStats()
        .then(setTopicStats)
        .catch(() => setTopicStats([]))
        .finally(() => setTopicLoading(false))
    }
    setTopicExpanded((v) => !v)
  }

  function handleTopicSort(col) {
    if (topicSortBy === col) setTopicSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setTopicSortBy(col); setTopicSortDir('desc') }
  }

  const sortedTopicStats = topicStats
    ? [...topicStats].sort((a, b) => {
        let av, bv
        if (topicSortBy === 'accuracy') { av = a.accuracy; bv = b.accuracy }
        else if (topicSortBy === 'attempts') { av = a.total_attempts; bv = b.total_attempts }
        else { av = a.topic_name.toLowerCase(); bv = b.topic_name.toLowerCase() }
        if (av < bv) return topicSortDir === 'asc' ? -1 : 1
        if (av > bv) return topicSortDir === 'asc' ? 1 : -1
        return 0
      })
    : []

  const greeting = getGreeting()
  const firstName = getUserFirstName()

  return (
    <div className="relative min-h-screen">
    <div className="px-4 sm:px-8 pt-6 pb-8 max-w-5xl mx-auto fade-in-up">
      <div className="dashboard-spotlight" />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-100">{greeting}{firstName ? `, ${firstName}` : ''}</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · StudyNerve
        </p>
        <div className="h-0.5 w-16 bg-accent/30 rounded-full mt-2" />
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

      {!loading && !error && (
        <>
          {/* Hero card */}
          {!heroHidden && (
            <SmartHeroCard
              gaps={gaps}
              onDismiss={() => setHeroHidden(true)}
              onStudyNow={handleStudyNow}
              studyNowLoading={studyNowLoading}
            />
          )}

          {/* Quick actions */}
          <QuickActions />

          {stats && (
            <>
              {/* Weekly study grid + streak */}
              <WeeklyStudyGrid quizHistory={quizHistory} notes={recentNotes} />

              {/* Stat cards */}
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3"><span className="w-1 h-1 rounded-full bg-accent inline-block mr-2 align-middle" />Your Stats</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatCard label="Notes"     value={stats.total_notes}     sub="uploaded"  icon={FileStack}  />
                <StatCard label="Questions" value={stats.total_questions} sub="generated" icon={CircleHelp} />
                <StatCard label="Attempts"  value={stats.total_attempts}  sub="answered"  icon={Target}     />
                <AccuracyRing value={stats.overall_accuracy} />
              </div>

              {/* Recent Activity + Weak Areas — 5-col grid */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-5">
                <div className="lg:col-span-3"><ActivityFeed quizHistory={quizHistory} notes={recentNotes} /></div>
                <div className="card p-4 lg:col-span-2">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500"><span className="w-1 h-1 rounded-full bg-accent inline-block mr-2 align-middle" />Weak Areas</h2>
                    {gaps && gaps.length > 0 && (
                      <span className="text-xs text-zinc-600">ranked by gap score</span>
                    )}
                  </div>
                  {!gaps || gaps.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 text-center py-4">
                      <svg className="w-8 h-8 text-zinc-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                      <p className="text-sm text-zinc-600">Take some quizzes to see your weak areas.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {gaps.slice(0, 4).map((g, idx) => (
                        <WeakAreaCard key={g.topic_id} topic={g} className={`fade-in-up stagger-${Math.min(idx + 1, 6)}`} />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Upcoming Deadlines */}
              <UpcomingDeadlines />

              {/* Top Topics */}
              {stats.topic_accuracies.length > 0 && (
                <div className="card p-6 mb-5">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4">Top Topics</h2>
                  <div className="space-y-3">
                    {stats.topic_accuracies.slice(0, 6).map((t) => {
                      const pct = Math.round(t.accuracy * 100)
                      return (
                        <div key={t.topic_id}>
                          <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
                            <span className="truncate max-w-[60%]">{t.topic_name}</span>
                            <span className="tabular-nums">{t.correct_attempts}/{t.total_attempts} · {pct}%</span>
                          </div>
                          <div className="h-[3px] bg-zinc-800 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bar-animate bg-accent progress-glow" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* All Topics — collapsible, lazy-loaded */}
              <div className="mt-4 mb-2">
                <button
                  onClick={toggleTopics}
                  className="flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {topicExpanded ? 'Hide Topics ▴' : 'View All Topics ▾'}
                </button>
                {topicExpanded && (
                  <div className="mt-4 fade-in-up">
                    {topicLoading && (
                      <div className="flex justify-center py-8"><Spinner small /></div>
                    )}
                    {!topicLoading && topicStats !== null && sortedTopicStats.length === 0 && (
                      <p className="text-sm text-zinc-600 py-4 text-center">No quiz attempts yet.</p>
                    )}
                    {!topicLoading && sortedTopicStats.length > 0 && (
                      <div className="card overflow-hidden">
                        <table className="w-full">
                          <thead className="border-b border-border-subtle">
                            <tr>
                              <th
                                className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider py-3 px-4 cursor-pointer hover:text-zinc-300 select-none transition-colors"
                                onClick={() => handleTopicSort('name')}
                              >
                                Topic{' '}
                                {topicSortBy !== 'name' ? <span className="text-zinc-700">↕</span> : <span className="text-accent">{topicSortDir === 'asc' ? '↑' : '↓'}</span>}
                              </th>
                              <th
                                className="text-right text-xs font-medium text-zinc-500 uppercase tracking-wider py-3 px-4 cursor-pointer hover:text-zinc-300 select-none transition-colors"
                                onClick={() => handleTopicSort('attempts')}
                              >
                                Attempts{' '}
                                {topicSortBy !== 'attempts' ? <span className="text-zinc-700">↕</span> : <span className="text-accent">{topicSortDir === 'asc' ? '↑' : '↓'}</span>}
                              </th>
                              <th className="text-right text-xs font-medium text-zinc-500 uppercase tracking-wider py-3 px-4">Correct</th>
                              <th
                                className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider py-3 px-4 min-w-[180px] cursor-pointer hover:text-zinc-300 select-none transition-colors"
                                onClick={() => handleTopicSort('accuracy')}
                              >
                                Accuracy{' '}
                                {topicSortBy !== 'accuracy' ? <span className="text-zinc-700">↕</span> : <span className="text-accent">{topicSortDir === 'asc' ? '↑' : '↓'}</span>}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.06]">
                            {sortedTopicStats.map((t) => {
                              const pct = Math.round(t.accuracy * 100)
                              return (
                                <tr key={t.topic_id} className="hover:bg-white/[0.02] transition-colors">
                                  <td className="py-3 px-4 text-sm text-zinc-100">{t.topic_name}</td>
                                  <td className="py-3 px-4 text-right text-sm text-zinc-500 tabular-nums">{t.total_attempts}</td>
                                  <td className="py-3 px-4 text-right text-sm text-zinc-500 tabular-nums">{t.correct_attempts}</td>
                                  <td className="py-3 px-4">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className="flex-1 h-[3px] bg-zinc-800 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full bar-animate bg-accent progress-glow" style={{ width: `${pct}%` }} />
                                      </div>
                                      <span className="text-xs font-medium tabular-nums w-8 text-right text-zinc-400">{pct}%</span>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                        <div className="px-4 py-3 border-t border-border-subtle flex justify-between text-xs text-zinc-600">
                          <span>{topicStats.length} topic{topicStats.length !== 1 ? 's' : ''}</span>
                          <span>
                            {topicStats.reduce((s, t) => s + t.total_attempts, 0)} total attempts ·{' '}
                            {topicStats.reduce((s, t) => s + t.correct_attempts, 0)} correct
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {stats.total_notes === 0 && (
                <div className="card p-10 flex flex-col items-center gap-4 text-center">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-accent/[0.08] border border-accent/[0.15]">
                    <svg className="w-7 h-7 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M12 12v6M9 15h6"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-zinc-300 font-medium mb-1">No notes yet</p>
                    <p className="text-sm text-zinc-500">Add your first set of study material to get started.</p>
                  </div>
                  <Link to="/notes" className="btn-primary">Add a Note</Link>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
    </div>
  )
}

function Spinner({ small }) {
  return (
    <svg
      className={`animate-spin text-accent ${small ? 'w-4 h-4' : 'w-6 h-6'}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}
