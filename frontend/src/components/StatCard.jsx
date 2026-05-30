export default function StatCard({ label, value, sub, icon: Icon, accent = false, progress = null }) {
  const isProgressNumeric = typeof progress === 'number' && Number.isFinite(progress)
  const pct = isProgressNumeric ? Math.max(0, Math.min(100, Math.round(progress * 100))) : null
  const valueClass = accent ? 'text-accent' : 'text-ink-primary'

  return (
    <div className="card stat-card overflow-hidden flex flex-col">
      <div className="p-5 flex-1">
        <div className="flex items-center gap-1.5 mb-3">
          {Icon && <Icon size={14} strokeWidth={1.5} className="text-ink-muted" />}
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
        </div>
        <p className={`text-3xl font-semibold leading-none ${valueClass}`}>{value}</p>
        {sub && <p className="text-xs text-ink-muted mt-2 uppercase tracking-wider">{sub}</p>}
      </div>
      {isProgressNumeric && (
        <div className="h-[3px] mx-5 mb-4 rounded-full bg-deep-elevated overflow-hidden">
          <div className="h-full rounded-full bar-animate bg-accent progress-glow" style={{ width: `${pct}%` }} />
        </div>
      )}
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px]"
        style={{ background: 'linear-gradient(to right, transparent, rgba(99,102,241,0.4) 50%, transparent)' }}
      />
    </div>
  )
}
