export default function Sparkline({ data = [], color = '#6366f1', height = 32 }) {
  if (!data || data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 100
  const h = height

  const points = data.map((v, i) => ({
    x: (i / (data.length - 1)) * w,
    y: h - ((v - min) / range) * h * 0.85 - h * 0.075,
  }))

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`

  const gradId = `sg-${color.replace('#', '')}`

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height, marginTop: 8, display: 'block' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        <filter id={`${gradId}-blur`}>
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>
      {/* Filled area */}
      <path d={areaPath} fill={`url(#${gradId})`} />
      {/* Glow line */}
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.4" strokeOpacity="0.55" filter={`url(#${gradId}-blur)`} strokeLinecap="round" />
      {/* Main line */}
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
