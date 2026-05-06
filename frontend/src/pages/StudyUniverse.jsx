import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'

// ── Constants ─────────────────────────────────────────────────────────────────

const TAU = Math.PI * 2
const RING_GAP = 160
const MAX_PLANETS = 6

const SUN_PALETTES = [
  { color: '#d4a056', accent: '#f5e8d0' },
  { color: '#c06030', accent: '#f0d0b8' },
  { color: '#7060b8', accent: '#d8d4f0' },
  { color: '#6898b8', accent: '#cce0f0' },
  { color: '#508878', accent: '#c8e4dc' },
  { color: '#9060a0', accent: '#e4d0f0' },
  { color: '#6070a8', accent: '#d0d8f0' },
  { color: '#a86870', accent: '#f0d4d8' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexA(hex, a) {
  if (typeof hex !== 'string') return `rgba(255,255,255,${a})`
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const r = parseInt(h.substr(0, 2), 16)
  const g = parseInt(h.substr(2, 2), 16)
  const b = parseInt(h.substr(4, 2), 16)
  return `rgba(${r},${g},${b},${a})`
}

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0
    let t = Math.imul(a ^ a >>> 15, 1 | a)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

function hashStr(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

// ── Layout ────────────────────────────────────────────────────────────────────

function computeGalaxyLayout(n) {
  if (n === 0) return []
  const angleOffset = Math.PI * 0.15
  return Array.from({ length: n }, (_, i) => {
    const ringRadius = RING_GAP * (i + 1)
    const angle = angleOffset + (TAU / Math.max(n, 1)) * i
    return { ringRadius, x: Math.cos(angle) * ringRadius, y: Math.sin(angle) * ringRadius }
  })
}

// ── Scene builder ─────────────────────────────────────────────────────────────

function mapApiToScene(data) {
  const sunData = []
  const planetData = []

  const notesBySubject = {}
  for (const note of (data.notes || [])) {
    const key = note.subject || 'General'
    if (!notesBySubject[key]) notesBySubject[key] = []
    notesBySubject[key].push(note)
  }

  ;(data.subjects || []).forEach((sub, i) => {
    const pal = SUN_PALETTES[i % SUN_PALETTES.length]
    const noteCount = sub.note_count || 0
    sunData.push({
      name: sub.name,
      noteCount,
      accuracy: sub.accuracy,
      color: pal.color,
      accent: pal.accent,
      radius: 12 + Math.min(noteCount * 0.8, 8),
      overflowCount: 0,
    })

    const group = notesBySubject[sub.name] || []
    const visible = group.slice(0, MAX_PLANETS)
    sunData[i].overflowCount = group.length - visible.length

    visible.forEach((note, pos) => {
      const rng = mulberry32(note.id * 137 + 7)
      const orbitRadius = 38 + pos * (42 / Math.max(visible.length - 1, 1))
      planetData.push({
        sun: i,
        orbitRadius: Math.max(38, orbitRadius),
        orbitPeriod: 30 + rng() * 30,
        orbitOffset: rng() * TAU,
        radius: 3 + rng() * 2,
        color: pal.accent,
      })
    })
  })

  return { sunData, planetData }
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ label, value }) {
  return (
    <div className="flex-shrink-0 rounded-xl px-5 py-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(12px)' }}>
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
  const [tooltip, setTooltip] = useState(null)
  const canvasRef = useRef(null)
  const containerRef = useRef(null)

  const panRef = useRef({ x: 0, y: 0 })
  const panVelRef = useRef({ x: 0, y: 0 })
  const zoomRef = useRef(1)
  const draggingRef = useRef(false)
  const lastPosRef = useRef({ x: 0, y: 0 })
  const dragMovedRef = useRef(false)
  const selectedSunRef = useRef(-1)

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
    const ctx = canvas.getContext('2d')

    const { sunData, planetData } = mapApiToScene(data)
    const n = sunData.length
    const galaxyLayout = computeGalaxyLayout(n)

    // Stars: built once as data, drawn each frame
    const stars = Array.from({ length: 120 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.5 + Math.random() * 1.2,
      baseAlpha: 0.2 + Math.random() * 0.6,
      phase: Math.random() * TAU,
      speed: 0.4 + Math.random() * 1.2,
    }))

    let W = 0, H = 0

    function initFitZoom() {
      if (n === 0) { zoomRef.current = 1; return }
      const maxExtent = RING_GAP * n + 80
      const available = Math.min(W, H) * 0.44
      zoomRef.current = Math.min(1.2, available / maxExtent)
    }

    function rebuild() {
      const dpr = Math.min(window.devicePixelRatio, 2)
      const rect = container.getBoundingClientRect()
      W = rect.width
      H = rect.height || window.innerHeight * 0.7
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
      ctx.scale(dpr, dpr)
      panRef.current = { x: 0, y: 0 }
      initFitZoom()
    }

    // ── Draw helpers ─────────────────────────────────────────────────────────

    function drawStars(t) {
      for (const s of stars) {
        const alpha = s.baseAlpha * (0.6 + 0.4 * Math.sin(t * s.speed + s.phase))
        ctx.beginPath()
        ctx.arc(s.x * W, s.y * H, s.r, 0, TAU)
        ctx.fillStyle = `rgba(255,255,255,${alpha})`
        ctx.fill()
      }
    }

    function drawOrbitRing(cx, cy, r) {
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, TAU)
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    function drawSun(sx, sy, sun, selected) {
      const R = sun.radius
      // Glow
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 3)
      g.addColorStop(0, hexA(sun.color, selected ? 0.28 : 0.15))
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.beginPath()
      ctx.arc(sx, sy, R * 3, 0, TAU)
      ctx.fillStyle = g
      ctx.fill()
      // Core
      const core = ctx.createRadialGradient(sx - R * 0.25, sy - R * 0.25, 0, sx, sy, R)
      core.addColorStop(0, sun.accent)
      core.addColorStop(1, sun.color)
      ctx.beginPath()
      ctx.arc(sx, sy, R, 0, TAU)
      ctx.fillStyle = core
      ctx.fill()
      // Selection ring
      if (selected) {
        ctx.beginPath()
        ctx.arc(sx, sy, R + 4, 0, TAU)
        ctx.strokeStyle = hexA(sun.color, 0.7)
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }

    function drawSunLabel(sx, sy, sun, invS) {
      ctx.save()
      ctx.translate(sx, sy + sun.radius + 8)
      ctx.scale(invS, invS)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.font = '11px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,0.65)'
      ctx.fillText(sun.name, 0, 0)
      ctx.restore()
    }

    function drawPlanet(px, py, planet, dimmed) {
      const R = planet.radius
      const alpha = dimmed ? 0.3 : 1
      // Subtle glow
      const g = ctx.createRadialGradient(px, py, 0, px, py, R * 2)
      g.addColorStop(0, hexA(planet.color, 0.08 * alpha))
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.beginPath()
      ctx.arc(px, py, R * 2, 0, TAU)
      ctx.fillStyle = g
      ctx.fill()
      // Core
      ctx.beginPath()
      ctx.arc(px, py, R, 0, TAU)
      ctx.fillStyle = hexA(planet.color, alpha)
      ctx.fill()
    }

    // ── Event handlers ───────────────────────────────────────────────────────

    const onPointerDown = (e) => {
      draggingRef.current = true
      dragMovedRef.current = false
      lastPosRef.current = { x: e.clientX, y: e.clientY }
      panVelRef.current = { x: 0, y: 0 }
      setTooltip(null)
      canvas.style.cursor = 'grabbing'
      canvas.setPointerCapture(e.pointerId)
    }

    const onPointerMove = (e) => {
      if (draggingRef.current) {
        const dx = e.clientX - lastPosRef.current.x
        const dy = e.clientY - lastPosRef.current.y
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMovedRef.current = true
        panRef.current.x += dx
        panRef.current.y += dy
        panVelRef.current.x = dx
        panVelRef.current.y = dy
        lastPosRef.current = { x: e.clientX, y: e.clientY }
        return
      }
      const rect = canvas.getBoundingClientRect()
      const cssX = e.clientX - rect.left
      const cssY = e.clientY - rect.top
      const z = zoomRef.current
      const sceneX = (cssX - W / 2 - panRef.current.x) / z
      const sceneY = (cssY - H / 2 - panRef.current.y) / z
      let found = null
      galaxyLayout.forEach((pos, i) => {
        const sun = sunData[i]
        if (Math.hypot(sceneX - pos.x, sceneY - pos.y) < sun.radius * 3.5) {
          const screenX = W / 2 + panRef.current.x + pos.x * z
          const screenY = H / 2 + panRef.current.y + pos.y * z
          found = { screenX, screenY, name: sun.name, noteCount: sun.noteCount, accuracy: sun.accuracy }
        }
      })
      setTooltip(found)
    }

    const onPointerUp = (e) => {
      const wasDrag = dragMovedRef.current
      draggingRef.current = false
      canvas.style.cursor = 'grab'
      if (wasDrag) return
      // Click: hit-test suns
      const rect = canvas.getBoundingClientRect()
      const cssX = e.clientX - rect.left
      const cssY = e.clientY - rect.top
      const z = zoomRef.current
      const sceneX = (cssX - W / 2 - panRef.current.x) / z
      const sceneY = (cssY - H / 2 - panRef.current.y) / z
      let hit = -1
      galaxyLayout.forEach((pos, i) => {
        const sun = sunData[i]
        if (Math.hypot(sceneX - pos.x, sceneY - pos.y) < sun.radius * 3.5) hit = i
      })
      selectedSunRef.current = selectedSunRef.current === hit ? -1 : hit
    }

    const onPointerLeave = () => {
      draggingRef.current = false
      canvas.style.cursor = 'grab'
      setTooltip(null)
    }

    const onWheel = (e) => {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.92 : 1.09
      zoomRef.current = Math.max(0.15, Math.min(4.0, zoomRef.current * factor))
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('pointerleave', onPointerLeave)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    // ── Frame loop ───────────────────────────────────────────────────────────

    rebuild()
    const startTime = performance.now()
    let raf = null

    function frame(now) {
      const t = (now - startTime) / 1000

      if (!draggingRef.current) {
        panRef.current.x += panVelRef.current.x
        panRef.current.y += panVelRef.current.y
        panVelRef.current.x *= 0.90
        panVelRef.current.y *= 0.90
        if (Math.abs(panVelRef.current.x) < 0.08) panVelRef.current.x = 0
        if (Math.abs(panVelRef.current.y) < 0.08) panVelRef.current.y = 0
      }

      const z = zoomRef.current
      const breathe = 1 + Math.sin(t * 0.18) * 0.008
      const totalScale = z * breathe
      const invS = 1 / totalScale
      const sel = selectedSunRef.current

      // Background
      ctx.fillStyle = '#08001a'
      ctx.fillRect(0, 0, W, H)

      // Stars (screen-space)
      drawStars(t)

      // Scene transform
      ctx.save()
      ctx.translate(W / 2 + panRef.current.x, H / 2 + panRef.current.y)
      ctx.scale(totalScale, totalScale)

      // Orbit rings
      galaxyLayout.forEach((pos) => {
        planetData
          .filter(p => galaxyLayout[p.sun] === pos)
          .forEach(p => drawOrbitRing(pos.x, pos.y, p.orbitRadius))
      })

      // Planets
      planetData.forEach((p) => {
        const pos = galaxyLayout[p.sun]
        if (!pos) return
        const angle = (t / p.orbitPeriod) * TAU + p.orbitOffset
        const px = pos.x + Math.cos(angle) * p.orbitRadius
        const py = pos.y + Math.sin(angle) * p.orbitRadius
        const dimmed = sel !== -1 && sel !== p.sun
        drawPlanet(px, py, p, dimmed)
      })

      // Suns + labels + overflow
      sunData.forEach((sun, i) => {
        const pos = galaxyLayout[i]
        if (!pos) return
        const selected = sel === i
        drawSun(pos.x, pos.y, sun, selected)
        drawSunLabel(pos.x, pos.y, sun, invS)
        if (sun.overflowCount > 0) {
          ctx.save()
          ctx.translate(pos.x, pos.y + sun.radius + 20)
          ctx.scale(invS, invS)
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          ctx.font = 'bold 10px system-ui, sans-serif'
          ctx.fillStyle = 'rgba(255,255,255,0.35)'
          ctx.fillText(`+${sun.overflowCount}`, 0, 0)
          ctx.restore()
        }
      })

      ctx.restore()

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)

    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      rebuild()
      raf = requestAnimationFrame(frame)
    })
    ro.observe(container)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [data])

  const isEmpty = !loading && data && data.total_notes === 0 && !data.total_questions_answered
  const accuracy = data && data.total_questions_answered > 0
    ? Math.round((data.total_correct / data.total_questions_answered) * 100) : 0

  return (
    <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto fade-in-up">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-100">My Universe</h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.50)', marginTop: 4 }}>
          Every star is a correct answer. Every planet is a note. Every sun is a subject.
        </p>
      </div>

      <div
        ref={containerRef}
        className="relative rounded-2xl overflow-hidden mb-5"
        style={{ minHeight: '70vh', background: '#08001a' }}
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
            <div className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(148,163,184,0.3)', boxShadow: '0 0 12px rgba(148,163,184,0.3)' }} />
            <p className="text-sm text-slate-400 text-center max-w-xs leading-relaxed">
              Your universe is empty — add notes and take quizzes to see it grow
            </p>
          </div>
        )}

        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: '100%', cursor: 'grab' }}
        />

        {tooltip && (
          <div
            style={{
              position: 'absolute',
              left: tooltip.screenX,
              top: tooltip.screenY,
              transform: 'translate(-50%, calc(-100% - 14px))',
              zIndex: 20,
              pointerEvents: 'none',
              background: 'rgba(10,10,26,0.88)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 10,
              padding: '8px 12px',
              whiteSpace: 'nowrap',
            }}
          >
            <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.90)', marginBottom: 2 }}>
              {tooltip.name}
            </p>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)' }}>
              {tooltip.noteCount} {tooltip.noteCount === 1 ? 'note' : 'notes'}
              {tooltip.accuracy !== undefined && ` · ${Math.round(tooltip.accuracy * 100)}%`}
            </p>
          </div>
        )}

        {!loading && !isEmpty && data && data.subjects.length > 0 && (
          <div style={{
            position: 'absolute', bottom: 14, right: 16,
            fontSize: 10, color: 'rgba(255,255,255,0.22)',
            pointerEvents: 'none', letterSpacing: '0.04em',
          }}>
            scroll to zoom · drag to pan · click to focus
          </div>
        )}
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
