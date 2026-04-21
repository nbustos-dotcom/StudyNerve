import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'

// ── Palette ───────────────────────────────────────────────────────────────────

const PALETTE = [
  { planet: '#a78bfa', glow: '#7c3aed', nebula: '#6d28d9' },
  { planet: '#22d3ee', glow: '#0891b2', nebula: '#0e7490' },
  { planet: '#2dd4bf', glow: '#0d9488', nebula: '#0f766e' },
  { planet: '#f472b6', glow: '#db2777', nebula: '#be185d' },
  { planet: '#fbbf24', glow: '#d97706', nebula: '#b45309' },
  { planet: '#34d399', glow: '#059669', nebula: '#047857' },
  { planet: '#818cf8', glow: '#4f46e5', nebula: '#4338ca' },
  { planet: '#fb7185', glow: '#e11d48', nebula: '#be123c' },
]

// ── Seeded PRNG + hash ────────────────────────────────────────────────────────

function seededRng(seed) {
  let s = (Math.abs(seed | 0) % 233279) + 1
  return function () {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function hashStr(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = (((h << 5) + h) + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

// ── Color helpers ─────────────────────────────────────────────────────────────

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`
}

function lightenHex(hex, amt) {
  const clamp = v => Math.min(255, Math.max(0, v))
  const r = clamp(parseInt(hex.slice(1, 3), 16) + Math.round(amt * 200))
  const g = clamp(parseInt(hex.slice(3, 5), 16) + Math.round(amt * 200))
  const b = clamp(parseInt(hex.slice(5, 7), 16) + Math.round(amt * 200))
  return `rgb(${r},${g},${b})`
}

function darkenHex(hex, amt) {
  const clamp = v => Math.min(255, Math.max(0, v))
  const r = clamp(parseInt(hex.slice(1, 3), 16) - Math.round(amt * 180))
  const g = clamp(parseInt(hex.slice(3, 5), 16) - Math.round(amt * 180))
  const b = clamp(parseInt(hex.slice(5, 7), 16) - Math.round(amt * 180))
  return `rgb(${r},${g},${b})`
}

// ── Scene generation (deterministic) ──────────────────────────────────────────

function generateScene(data, W, H) {
  const {
    total_correct = 0,
    total_flashcards_reviewed = 0,
    study_streak = 0,
    daily_activity = [],
    subjects = [],
  } = data

  const cx = W / 2
  const cy = H / 2
  // Keep clusters within a circle that fits the canvas
  const clusterDistance = Math.min(W, H) * 0.32

  // ── Subject clusters (planets + stars + nebula) ───────────────────────────
  const totalQuizCount = subjects.reduce((s, sub) => s + (sub.quiz_count || 0), 0)
  const MAX_STARS = 480

  const sceneSubjects = subjects.map((sub, i) => {
    const angle = subjects.length <= 1
      ? -Math.PI / 2
      : (i / subjects.length) * Math.PI * 2 - Math.PI / 2
    const dist = subjects.length <= 1 ? 0 : clusterDistance
    const scx = cx + Math.cos(angle) * dist
    const scy = cy + Math.sin(angle) * dist

    const colors = PALETTE[hashStr(sub.name) % PALETTE.length]
    const planetRadius = 8 + Math.min((sub.note_count || 0) * 2.5, 14)

    // Stars for this subject, proportional to quiz activity
    const ratio = totalQuizCount > 0
      ? (sub.quiz_count || 0) / totalQuizCount
      : 1 / Math.max(subjects.length, 1)
    const starCount = Math.round(Math.min(total_correct, MAX_STARS) * ratio)

    const scatter = Math.min(W, H) * 0.16
    const rng = seededRng(hashStr(sub.name) ^ ((sub.note_count || 0) * 97))
    const stars = []

    for (let j = 0; j < starCount; j++) {
      // Box-Muller Gaussian scatter around cluster center
      const u1 = Math.max(rng(), 1e-10)
      const u2 = rng()
      const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
      const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2)
      stars.push({
        x: scx + z0 * scatter,
        y: scy + z1 * scatter,
        size: 1 + rng() * 2.2,
        phase: rng() * Math.PI * 2,
        period: 3 + rng() * 5,
        bright: rng() < 0.15,  // occasional brighter star
      })
    }

    // Nebula radius scaled by flashcard activity per subject
    const nebulaRadius = 70 + Math.min(
      (total_flashcards_reviewed / Math.max(subjects.length, 1)) * 2,
      120
    )

    return { name: sub.name, colors, cx: scx, cy: scy, planetRadius, stars, nebulaRadius }
  })

  // ── Orbit rings (1 per 7-day streak segment) ──────────────────────────────
  const ringCount = Math.min(Math.ceil(study_streak / 7), 6)
  const orbitRings = Array.from({ length: ringCount }, (_, i) => ({
    radius: 44 + i * 36,
    speed: (0.004 + i * 0.0015) * (i % 2 === 0 ? 1 : -1),
  }))

  // ── Activity pulses (last 7 days) ─────────────────────────────────────────
  const now = Date.now()
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
  const pulses = daily_activity
    .filter(d => now - new Date(d.date).getTime() <= sevenDaysMs)
    .map((d, i, arr) => {
      const daysAgo = (now - new Date(d.date).getTime()) / (24 * 60 * 60 * 1000)
      const recency = 1 - Math.min(daysAgo, 7) / 7
      return {
        phaseOffset: (i / Math.max(arr.length, 1)) * 4000,
        maxRadius: 55 + Math.min((d.actions || 0) * 4, 110),
        maxOpacity: 0.05 + recency * 0.12,
      }
    })

  return { subjects: sceneSubjects, orbitRings, pulses, cx, cy }
}

// ── Frame rendering ───────────────────────────────────────────────────────────

const CONSTEL_THRESHOLD = 75
const CONSTEL_MAX_PER_STAR = 3

function drawFrame(ctx, W, H, scene, ts) {
  ctx.clearRect(0, 0, W, H)

  const { subjects, orbitRings, pulses, cx, cy } = scene
  const t = ts / 1000

  // Global scene rotation: 0.5 deg/sec
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(t * (0.5 * Math.PI / 180))
  ctx.translate(-cx, -cy)

  // ── 1. Nebula clouds ───────────────────────────────────────────────────────
  for (const sub of subjects) {
    const g = ctx.createRadialGradient(sub.cx, sub.cy, 0, sub.cx, sub.cy, sub.nebulaRadius)
    g.addColorStop(0, hexToRgba(sub.colors.nebula, 0.055))
    g.addColorStop(0.45, hexToRgba(sub.colors.nebula, 0.025))
    g.addColorStop(1, hexToRgba(sub.colors.nebula, 0))
    ctx.beginPath()
    ctx.arc(sub.cx, sub.cy, sub.nebulaRadius, 0, Math.PI * 2)
    ctx.fillStyle = g
    ctx.fill()
  }

  // ── 2. Orbit rings ─────────────────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 12])
  for (const ring of orbitRings) {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(t * ring.speed)
    ctx.beginPath()
    ctx.arc(0, 0, ring.radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
  ctx.setLineDash([])

  // ── 3. Constellation lines ─────────────────────────────────────────────────
  ctx.lineWidth = 0.6
  for (const sub of subjects) {
    const stars = sub.stars.length > 120 ? sub.stars.slice(0, 120) : sub.stars
    for (let i = 0; i < stars.length; i++) {
      let conn = 0
      for (let j = i + 1; j < stars.length && conn < CONSTEL_MAX_PER_STAR; j++) {
        const dx = stars[i].x - stars[j].x
        const dy = stars[i].y - stars[j].y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < CONSTEL_THRESHOLD) {
          const op = 0.14 * (1 - d / CONSTEL_THRESHOLD)
          ctx.beginPath()
          ctx.strokeStyle = `rgba(200,215,255,${op.toFixed(3)})`
          ctx.moveTo(stars[i].x, stars[i].y)
          ctx.lineTo(stars[j].x, stars[j].y)
          ctx.stroke()
          conn++
        }
      }
    }
  }

  // ── 4. Stars (twinkle via opacity) ────────────────────────────────────────
  ctx.shadowColor = 'rgba(190,225,255,0.9)'
  for (const sub of subjects) {
    for (const star of sub.stars) {
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (2 * Math.PI / star.period) + star.phase))
      ctx.shadowBlur = star.bright ? 8 : star.size > 1.8 ? 5 : 0
      ctx.globalAlpha = tw
      ctx.fillStyle = star.bright ? sub.colors.glow : 'rgb(225,240,255)'
      ctx.beginPath()
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0

  // ── 5. Planets ────────────────────────────────────────────────────────────
  for (const sub of subjects) {
    const { cx: px, cy: py, planetRadius: pr, colors } = sub

    // outer glow halo
    const glow = ctx.createRadialGradient(px, py, 0, px, py, pr * 3.5)
    glow.addColorStop(0, hexToRgba(colors.glow, 0.28))
    glow.addColorStop(0.5, hexToRgba(colors.glow, 0.08))
    glow.addColorStop(1, hexToRgba(colors.glow, 0))
    ctx.beginPath()
    ctx.arc(px, py, pr * 3.5, 0, Math.PI * 2)
    ctx.fillStyle = glow
    ctx.fill()

    // planet body with inner gradient
    const body = ctx.createRadialGradient(px - pr * 0.32, py - pr * 0.32, pr * 0.05, px, py, pr)
    body.addColorStop(0, lightenHex(colors.planet, 0.42))
    body.addColorStop(0.55, colors.planet)
    body.addColorStop(1, darkenHex(colors.planet, 0.28))
    ctx.beginPath()
    ctx.arc(px, py, pr, 0, Math.PI * 2)
    ctx.fillStyle = body
    ctx.fill()

    // highlight rim
    ctx.beginPath()
    ctx.arc(px, py, pr, 0, Math.PI * 2)
    ctx.strokeStyle = hexToRgba(lightenHex(colors.planet, 0.55), 0.45)
    ctx.lineWidth = 1
    ctx.stroke()
  }

  ctx.restore() // end global rotation

  // ── 6. Activity pulses (drawn after rotation — symmetric so doesn't matter)
  for (const pulse of pulses) {
    const cycle = ((ts + pulse.phaseOffset) % 4000) / 4000
    const r = cycle * pulse.maxRadius
    const op = (1 - cycle) * pulse.maxOpacity
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(165,180,252,${op.toFixed(3)})`
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
}

// ── Stats card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }) {
  return (
    <div
      className="flex-shrink-0 rounded-xl px-4 py-3"
      style={{
        minWidth: '120px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <p className="text-lg font-semibold text-slate-100 leading-none">{value}</p>
      <p className="text-xs font-medium text-indigo-400 mt-1">{label}</p>
      <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>
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

  // Canvas setup + animation loop
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
      if (ctxBox.ctx && sceneRef.current) {
        drawFrame(ctxBox.ctx, dimBox.W, dimBox.H, sceneRef.current, ts)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      setup()
      raf = requestAnimationFrame(frame)
    })
    ro.observe(container)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [data])

  const isEmpty = data &&
    data.total_notes === 0 &&
    data.total_correct === 0 &&
    data.daily_activity.length === 0

  const accuracy = data && data.total_questions_answered > 0
    ? Math.round((data.total_correct / data.total_questions_answered) * 100)
    : 0

  return (
    <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto fade-in-up">

      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-100">My Universe</h1>
        <p className="text-sm text-slate-500 mt-1">
          Every star is a correct answer. Every planet is a note. Every ring is a week of consistency.
        </p>
      </div>

      {/* Canvas container */}
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

        {isEmpty && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 z-10 pointer-events-none">
            <div
              style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'rgba(148,163,184,0.25)',
                boxShadow: '0 0 10px rgba(148,163,184,0.25)',
              }}
            />
            <p className="text-sm text-slate-600 text-center max-w-xs leading-relaxed">
              Your universe is waiting.<br />Start studying to bring it to life.
            </p>
          </div>
        )}

        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      </div>

      {/* Stats bar */}
      {data && !loading && (
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
          <StatCard
            label="Total Stars"
            value={data.total_correct.toLocaleString()}
            sub="correct answers"
          />
          <StatCard
            label="Study Streak"
            value={`${data.study_streak}d`}
            sub="consecutive days"
          />
          <StatCard
            label="Accuracy"
            value={`${accuracy}%`}
            sub="of all questions"
          />
          <StatCard
            label="Study Days"
            value={data.total_study_days}
            sub="last 30 days"
          />
          <StatCard
            label="Notes"
            value={data.total_notes}
            sub="in your library"
          />
          <StatCard
            label="Flashcards"
            value={data.total_flashcards_reviewed}
            sub="reviewed"
          />
          <StatCard
            label="Chat Sessions"
            value={data.total_chat_sessions}
            sub="tutoring sessions"
          />
          <StatCard
            label="Vision Boards"
            value={data.total_vision_boards}
            sub="plans created"
          />
        </div>
      )}

      {/* Subject legend */}
      {data && !loading && data.subjects.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {data.subjects.map((sub, i) => {
            const colors = PALETTE[hashStr(sub.name) % PALETTE.length]
            return (
              <div
                key={sub.name}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs"
                style={{
                  background: hexToRgba(colors.nebula, 0.18),
                  border: `1px solid ${hexToRgba(colors.planet, 0.3)}`,
                  color: colors.planet,
                }}
              >
                <span
                  style={{
                    display: 'inline-block', width: 7, height: 7,
                    borderRadius: '50%', background: colors.planet,
                    boxShadow: `0 0 5px ${hexToRgba(colors.glow, 0.7)}`,
                  }}
                />
                {sub.name}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
