import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'

// ── Colors ────────────────────────────────────────────────────────────────────

const SUN_COLORS = ['#fbbf24', '#f97316', '#f43f5e', '#8b5cf6', '#06b6d4', '#10b981']

// ── Helpers ───────────────────────────────────────────────────────────────────

function seededRng(seed) {
  let s = (Math.abs(seed | 0) % 233279) + 1
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
}

function hashStr(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`
}

function lighten(hex, amt) {
  const v = c => Math.min(255, Math.max(0, c + Math.round(amt * 200)))
  return `rgb(${v(parseInt(hex.slice(1, 3), 16))},${v(parseInt(hex.slice(3, 5), 16))},${v(parseInt(hex.slice(5, 7), 16))})`
}

function darken(hex, amt) {
  const v = c => Math.min(255, Math.max(0, c - Math.round(amt * 180)))
  return `rgb(${v(parseInt(hex.slice(1, 3), 16))},${v(parseInt(hex.slice(3, 5), 16))},${v(parseInt(hex.slice(5, 7), 16))})`
}

// ── Sun layout ────────────────────────────────────────────────────────────────

function computeSunPositions(n, cx, cy, W, H) {
  if (n === 0) return []
  if (n === 1) return [{ x: cx, y: cy }]

  const maxR = Math.min(W, H) * 0.32

  if (n === 2) {
    const d = Math.min(240, maxR)
    return [{ x: cx - d / 2, y: cy }, { x: cx + d / 2, y: cy }]
  }

  if (n === 3) {
    const r = Math.min(210, maxR)
    return [0, 1, 2].map(i => {
      const a = -Math.PI / 2 + (i / 3) * Math.PI * 2
      return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }
    })
  }

  if (n <= 6) {
    const r = Math.min(W, H) * 0.28
    return Array.from({ length: n }, (_, i) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2
      return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }
    })
  }

  // n >= 7: two concentric circles
  const innerCount = 4
  const outerCount = n - innerCount
  const r1 = Math.min(W, H) * 0.16
  const r2 = Math.min(W, H) * 0.32
  const positions = []
  for (let i = 0; i < innerCount; i++) {
    const a = -Math.PI / 2 + (i / innerCount) * Math.PI * 2
    positions.push({ x: cx + Math.cos(a) * r1, y: cy + Math.sin(a) * r1 })
  }
  for (let i = 0; i < outerCount; i++) {
    const a = -Math.PI / 2 + (i / outerCount) * Math.PI * 2
    positions.push({ x: cx + Math.cos(a) * r2, y: cy + Math.sin(a) * r2 })
  }
  return positions
}

// ── Scene generation ──────────────────────────────────────────────────────────

function generateScene(data, W, H) {
  console.log('[StudyUniverse] raw data:', JSON.stringify(data, null, 2))

  const {
    total_flashcards_reviewed = 0,
    subjects = [],
  } = data
  const notes = data.notes || []

  const cx = W / 2
  const cy = H / 2

  // ── Suns
  const positions = computeSunPositions(subjects.length, cx, cy, W, H)
  const suns = subjects.map((sub, i) => {
    const pos = positions[i] || { x: cx, y: cy }
    const color = SUN_COLORS[i % SUN_COLORS.length]
    const radius = 18 + Math.min((sub.note_count || 0) * 1.5, 14)
    return {
      name: sub.name,
      x: pos.x, y: pos.y,
      radius, color,
      correct: sub.correct || 0,
      pulsePhase: (i * 1.57) % (Math.PI * 2),
    }
  })

  // ── Planets (one per note, orbiting its subject's sun)
  const notesBySun = {}
  for (const note of notes) {
    const key = note.subject || 'General'
    if (!notesBySun[key]) notesBySun[key] = []
    notesBySun[key].push(note)
  }

  const ORBIT_MIN = 50
  const ORBIT_MAX = 120
  const planets = []

  for (const sun of suns) {
    const group = notesBySun[sun.name] || []
    const count = group.length
    const colorIdx = SUN_COLORS.indexOf(sun.color)

    group.forEach((note, i) => {
      const rng = seededRng(note.id * 137 + 7)
      const orbitRadius = count === 1
        ? (ORBIT_MIN + ORBIT_MAX) / 2
        : ORBIT_MIN + (i / (count - 1)) * (ORBIT_MAX - ORBIT_MIN)
      const angle0 = rng() * Math.PI * 2
      const orbitSpeed = 0.04 / Math.sqrt(Math.max(orbitRadius / 60, 1))
      const bodyRadius = 3 + Math.min((note.content_length || 0) / 500, 5)
      const color = SUN_COLORS[(colorIdx + 1 + (i % 3)) % SUN_COLORS.length]
      planets.push({ sunX: sun.x, sunY: sun.y, orbitRadius, angle0, orbitSpeed, bodyRadius, color })
    })
  }

  // ── Stars (one per correct answer, Gaussian scatter near subject sun)
  const scatter = Math.min(W, H) * 0.2
  const stars = []

  for (const sun of suns) {
    const count = Math.min(sun.correct, 300)
    if (count === 0) continue
    const rng = seededRng(hashStr(sun.name))
    for (let j = 0; j < count; j++) {
      const u1 = Math.max(rng(), 1e-10)
      const u2 = rng()
      const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
      const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2)
      stars.push({
        x: sun.x + z0 * scatter,
        y: sun.y + z1 * scatter,
        size: 0.5 + rng() * 1.5,
        phase: rng() * Math.PI * 2,
        period: 2 + rng() * 5,
        tint: sun.color,
        useTint: rng() < 0.25,
      })
    }
  }

  // ── Flashcard sparks (one per 10 reviewed)
  const sparkCount = Math.min(Math.floor(total_flashcards_reviewed / 10), 50)
  const sparks = []
  const sparkRng = seededRng(total_flashcards_reviewed * 13 + 99)
  for (let i = 0; i < sparkCount; i++) {
    sparks.push({
      x: sparkRng() * W,
      y: sparkRng() * H,
      color: SUN_COLORS[i % SUN_COLORS.length],
      phase: sparkRng() * Math.PI * 2,
      oscAmp: 8 + sparkRng() * 12,
      oscFreq: 0.4 + sparkRng() * 0.5,
    })
  }

  return { cx, cy, suns, planets, stars, sparks }
}

// ── Draw: sun ─────────────────────────────────────────────────────────────────

function drawSun(ctx, sun, t) {
  const { x, y, radius, color, pulsePhase } = sun
  const pulse = 1 + 0.04 * Math.sin(t * Math.PI * 0.5 + pulsePhase)
  const r = radius * pulse

  // Outer haze
  const g1 = ctx.createRadialGradient(x, y, r, x, y, r * 5)
  g1.addColorStop(0, hexToRgba(color, 0.1))
  g1.addColorStop(0.5, hexToRgba(color, 0.03))
  g1.addColorStop(1, hexToRgba(color, 0))
  ctx.beginPath(); ctx.arc(x, y, r * 5, 0, Math.PI * 2)
  ctx.fillStyle = g1; ctx.fill()

  // Inner glow
  const g2 = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5)
  g2.addColorStop(0, hexToRgba(color, 0.45))
  g2.addColorStop(0.4, hexToRgba(color, 0.18))
  g2.addColorStop(1, hexToRgba(color, 0))
  ctx.beginPath(); ctx.arc(x, y, r * 2.5, 0, Math.PI * 2)
  ctx.fillStyle = g2; ctx.fill()

  // Core body
  const core = ctx.createRadialGradient(x - r * 0.25, y - r * 0.25, 0, x, y, r)
  core.addColorStop(0, '#ffffff')
  core.addColorStop(0.25, lighten(color, 0.5))
  core.addColorStop(0.65, color)
  core.addColorStop(1, darken(color, 0.25))
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = core; ctx.fill()
}

// ── Draw: planet ──────────────────────────────────────────────────────────────

function drawPlanet(ctx, p, px, py) {
  const { bodyRadius: r, color } = p
  const g = ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, 0, px, py, r)
  g.addColorStop(0, lighten(color, 0.45))
  g.addColorStop(0.5, color)
  g.addColorStop(1, darken(color, 0.35))
  ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2)
  ctx.fillStyle = g; ctx.fill()
}

// ── Draw: star ────────────────────────────────────────────────────────────────

function drawStar(ctx, star, t) {
  const { x, y, size, phase, period, tint, useTint } = star
  const alpha = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(t * (2 * Math.PI / period) + phase))
  ctx.globalAlpha = alpha
  ctx.fillStyle = useTint ? tint : 'rgba(220,235,255,1)'
  ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1
}

// ── Draw: flashcard spark ─────────────────────────────────────────────────────

function drawSpark(ctx, spark, t) {
  const { color, phase, oscAmp, oscFreq } = spark
  const sx = spark.x + Math.sin(t * oscFreq + phase) * oscAmp
  const sy = spark.y + Math.cos(t * oscFreq * 0.7 + phase) * oscAmp * 0.6
  const tw = 0.3 + 0.3 * Math.sin(t * 1.4 + phase)

  ctx.globalAlpha = tw

  ctx.fillStyle = color
  ctx.beginPath(); ctx.arc(sx, sy, 2, 0, Math.PI * 2); ctx.fill()

  const len = 5 + 4 * tw
  ctx.strokeStyle = color
  ctx.lineWidth = 0.8
  // 4-line cross-shaped diffraction spike
  ctx.beginPath(); ctx.moveTo(sx - len, sy); ctx.lineTo(sx + len, sy); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(sx, sy - len); ctx.lineTo(sx, sy + len); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(sx - len * 0.6, sy - len * 0.6); ctx.lineTo(sx + len * 0.6, sy + len * 0.6); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(sx + len * 0.6, sy - len * 0.6); ctx.lineTo(sx - len * 0.6, sy + len * 0.6); ctx.stroke()

  ctx.globalAlpha = 1
}

// ── Main frame render ─────────────────────────────────────────────────────────

function drawFrame(ctx, W, H, scene, ts) {
  ctx.clearRect(0, 0, W, H)
  const { cx, cy, suns, planets, stars, sparks } = scene
  const t = ts / 1000
  const angle = t * (0.3 * Math.PI / 180)

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)
  ctx.translate(-cx, -cy)

  // 1. Stars
  for (const star of stars) drawStar(ctx, star, t)

  // 2. Flashcard sparks
  for (const spark of sparks) drawSpark(ctx, spark, t)

  // 3. Planets
  for (const p of planets) {
    const pa = p.angle0 + t * p.orbitSpeed
    const px = p.sunX + Math.cos(pa) * p.orbitRadius
    const py = p.sunY + Math.sin(pa) * p.orbitRadius
    drawPlanet(ctx, p, px, py)
  }

  // 4. Suns
  for (const sun of suns) drawSun(ctx, sun, t)

  ctx.restore()

  // 5. Labels drawn post-restore so text stays upright
  const cosA = Math.cos(angle)
  const sinA = Math.sin(angle)
  ctx.font = '11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  for (const sun of suns) {
    const rx = cx + (sun.x - cx) * cosA - (sun.y - cy) * sinA
    const ry = cy + (sun.x - cx) * sinA + (sun.y - cy) * cosA
    ctx.fillText(sun.name, rx, ry + sun.radius + 6)
  }
}

// ── Stats card ────────────────────────────────────────────────────────────────

function StatCard({ label, value }) {
  return (
    <div
      className="flex-shrink-0 rounded-xl px-5 py-3"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <p className="text-lg font-semibold text-slate-100 leading-none">{value}</p>
      <p className="text-xs font-medium text-slate-500 mt-1">{label}</p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StudyUniverse() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const sceneRef = useRef(null)

  useEffect(() => {
    api.studyUniverse()
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  useEffect(() => {
    if (!data) return
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctxBox = { ctx: null }
    const dimBox = { W: 0, H: 0 }

    function setup() {
      const dpr = window.devicePixelRatio || 1
      const W = container.clientWidth
      const H = container.clientHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)
      ctxBox.ctx = ctx
      dimBox.W = W
      dimBox.H = H
      sceneRef.current = generateScene(data, W, H)
    }

    setup()

    let raf = null
    function frame(ts) {
      if (ctxBox.ctx && sceneRef.current) drawFrame(ctxBox.ctx, dimBox.W, dimBox.H, sceneRef.current, ts)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      setup()
      raf = requestAnimationFrame(frame)
    })
    ro.observe(container)

    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [data])

  const isEmpty = !loading && data && data.total_notes === 0
  const accuracy = data && data.total_questions_answered > 0
    ? Math.round((data.total_correct / data.total_questions_answered) * 100) : 0

  return (
    <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto fade-in-up">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-100">My Universe</h1>
        <p className="text-sm text-slate-500 mt-1">
          Every star is a correct answer. Every planet is a note. Every sun is a subject.
        </p>
      </div>

      <div
        ref={containerRef}
        className="relative rounded-2xl overflow-hidden mb-5"
        style={{
          minHeight: '70vh',
          background: 'radial-gradient(ellipse at 48% 35%, rgba(16,12,44,1) 0%, rgba(5,4,16,1) 65%, rgba(2,2,8,1) 100%)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-3">
              <svg className="animate-spin w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <p className="text-sm text-slate-500">Mapping your universe…</p>
            </div>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
        {isEmpty && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 z-10 pointer-events-none">
            <div
              className="animate-pulse"
              style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(148,163,184,0.3)', boxShadow: '0 0 12px rgba(148,163,184,0.3)' }}
            />
            <p className="text-sm text-slate-600 text-center max-w-xs leading-relaxed">
              Your universe is waiting.<br />Add notes and take quizzes to bring it to life.
            </p>
          </div>
        )}
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      </div>

      {data && !loading && (
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
          <StatCard label="Subjects" value={data.subjects.length} />
          <StatCard label="Notes" value={data.total_notes} />
          <StatCard label="Accuracy" value={`${accuracy}%`} />
          <StatCard label="Study Streak" value={`${data.study_streak}d`} />
        </div>
      )}
    </div>
  )
}
