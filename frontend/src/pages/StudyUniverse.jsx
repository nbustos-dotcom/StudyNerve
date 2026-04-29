import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'

// ── Constants ─────────────────────────────────────────────────────────────────

const TAU = Math.PI * 2

const SUN_PALETTES = [
  { color: '#d4a056', deep: '#7a4a18', halo: '#c89040', accent: '#f5e8d0' }, // warm amber
  { color: '#c06030', deep: '#6a2c10', halo: '#b05020', accent: '#f0d0b8' }, // deep coral
  { color: '#7060b8', deep: '#302858', halo: '#6050a8', accent: '#d8d4f0' }, // blue-violet
  { color: '#6898b8', deep: '#284058', halo: '#5888a8', accent: '#cce0f0' }, // icy blue
  { color: '#508878', deep: '#1e3c34', halo: '#407868', accent: '#c8e4dc' }, // soft teal
  { color: '#9060a0', deep: '#482858', halo: '#805090', accent: '#e4d0f0' }, // dusty violet
  { color: '#6070a8', deep: '#283058', halo: '#5060a0', accent: '#d0d8f0' }, // steel blue
  { color: '#a86870', deep: '#583038', halo: '#986068', accent: '#f0d4d8' }, // dusty rose
]

// ── Math helpers ──────────────────────────────────────────────────────────────

function hexA(hex, a) {
  if (typeof hex !== 'string') return `rgba(255,255,255,${a})`
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex
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

function solveKepler(M, e) {
  let E = M
  for (let i = 0; i < 5; i++) E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  return { x: Math.cos(E) - e, y: Math.sqrt(1 - e * e) * Math.sin(E) }
}

// ── Sun layout: normalized offsets from scene center ──────────────────────────

function computeSunLayout(n) {
  if (n === 0) return []
  if (n === 1) return [{ nx: 0, ny: 0 }]
  if (n === 2) return [{ nx: -0.33, ny: 0 }, { nx: 0.33, ny: 0 }]
  if (n === 3) return [0, 1, 2].map(i => {
    const a = -Math.PI / 2 + (i / 3) * Math.PI * 2
    return { nx: Math.cos(a) * 0.33, ny: Math.sin(a) * 0.27 }
  })
  if (n <= 6) return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2
    return { nx: Math.cos(a) * 0.36, ny: Math.sin(a) * 0.30 }
  })
  const inner = 4, outer = n - inner
  const positions = []
  for (let i = 0; i < inner; i++) {
    const a = -Math.PI / 2 + (i / inner) * Math.PI * 2
    positions.push({ nx: Math.cos(a) * 0.20, ny: Math.sin(a) * 0.18 })
  }
  for (let i = 0; i < outer; i++) {
    const a = -Math.PI / 2 + (i / outer) * Math.PI * 2
    positions.push({ nx: Math.cos(a) * 0.38, ny: Math.sin(a) * 0.34 })
  }
  return positions
}

// ── API data → scene objects ──────────────────────────────────────────────────

function mapApiToScene(data) {
  const sunData = []
  const planetData = []

  ;(data.subjects || []).forEach((sub, i) => {
    const pal = SUN_PALETTES[i % SUN_PALETTES.length]
    const rng = mulberry32(hashStr(sub.name))
    sunData.push({
      name: sub.name,
      color: pal.color, deep: pal.deep, halo: pal.halo, accent: pal.accent,
      radius: 28 + Math.min((sub.note_count || 0) * 2, 18),
      mass: 0.8 + rng() * 0.8,
      surfTemp: 0.5 + rng() * 0.5,
      pulseT: rng() * 15,
    })
  })

  const notesBySubject = {}
  for (const note of (data.notes || [])) {
    const key = note.subject || 'General'
    if (!notesBySubject[key]) notesBySubject[key] = []
    notesBySubject[key].push(note)
  }

  const ORBIT_MIN = 55, ORBIT_MAX = 165
  const kinds = ['rocky', 'gas', 'icy']

  sunData.forEach((sun, sunIdx) => {
    const group = notesBySubject[sun.name] || []
    const count = group.length
    group.forEach((note, pos) => {
      const rng = mulberry32(note.id * 137 + 7)
      const a = count === 1 ? 90 : ORBIT_MIN + (pos / (count - 1)) * (ORBIT_MAX - ORBIT_MIN)
      const size = Math.max(8, Math.min(6 + Math.floor((note.content_length || 0) / 250), 18))
      const kind = kinds[Math.floor(rng() * 3)]
      const hasRing = rng() > 0.72
      const pPal = SUN_PALETTES[(sunIdx + pos + 1) % SUN_PALETTES.length]
      planetData.push({
        sun: sunIdx, a,
        e: 0.05 + rng() * 0.22,
        w: rng() * TAU,
        inc: 0.5 + rng() * 0.4,
        M0: rng() * TAU,
        size, kind,
        hue: pPal.color, deep: pPal.deep,
        ring: hasRing, ringColor: pPal.color,
      })
    })
  })

  return { sunData, planetData }
}

// ── Pre-render: nebula canvas ─────────────────────────────────────────────────

function buildNebula(W, H) {
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const cx = c.getContext('2d')
  const rng = mulberry32(7)
  const clouds = [
    { x: W * 0.30, y: H * 0.32, r: Math.max(W, H) * 0.65, color: 'rgba(99,102,241,1)',  a: 0.045 },
    { x: W * 0.78, y: H * 0.62, r: Math.max(W, H) * 0.60, color: 'rgba(167,139,250,1)', a: 0.040 },
    { x: W * 0.55, y: H * 0.18, r: Math.max(W, H) * 0.45, color: 'rgba(34,211,238,1)',  a: 0.022 },
    { x: W * 0.20, y: H * 0.78, r: Math.max(W, H) * 0.40, color: 'rgba(244,114,182,1)', a: 0.018 },
  ]
  clouds.forEach(cl => {
    const g = cx.createRadialGradient(cl.x, cl.y, 0, cl.x, cl.y, cl.r)
    g.addColorStop(0,    cl.color.replace('1)', cl.a + ')'))
    g.addColorStop(0.45, cl.color.replace('1)', (cl.a * 0.45) + ')'))
    g.addColorStop(1,    'rgba(0,0,0,0)')
    cx.fillStyle = g; cx.fillRect(0, 0, W, H)
  })
  cx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 28; i++) {
    const x = rng() * W, y = rng() * H
    const len = 80 + rng() * 260, ang = rng() * TAU
    const grad = cx.createLinearGradient(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len)
    const col = ['99,102,241', '167,139,250', '34,211,238', '244,114,182'][Math.floor(rng() * 4)]
    grad.addColorStop(0, `rgba(${col},0)`)
    grad.addColorStop(0.5, `rgba(${col},0.04)`)
    grad.addColorStop(1, `rgba(${col},0)`)
    cx.strokeStyle = grad; cx.lineWidth = 18 + rng() * 40
    cx.beginPath()
    cx.moveTo(x, y)
    cx.quadraticCurveTo(x + Math.cos(ang) * len * 0.5 + (rng() - 0.5) * 120, y + Math.sin(ang) * len * 0.5 + (rng() - 0.5) * 120, x + Math.cos(ang) * len, y + Math.sin(ang) * len)
    cx.stroke()
  }
  cx.globalCompositeOperation = 'source-over'
  cx.globalAlpha = 0.05
  for (let i = 0; i < 900; i++) {
    cx.fillStyle = ['rgba(167,139,250,1)', 'rgba(99,102,241,1)', 'rgba(255,255,255,1)'][Math.floor(rng() * 3)]
    cx.fillRect(rng() * W, rng() * H, 1, 1)
  }
  cx.globalAlpha = 1
  return c
}

// ── Pre-render: star layers ───────────────────────────────────────────────────

function makeStarLayer(count, sizeMul, biasPow, W, H) {
  const list = []
  for (let i = 0; i < count; i++) {
    const b = Math.pow(Math.random(), biasPow)
    list.push({
      x: Math.random() * W, y: Math.random() * H,
      r: (0.4 + Math.random() * 1.4) * sizeMul,
      b: 0.20 + b * 0.80,
      tw: Math.random() * TAU,
      tws: 0.4 + Math.random() * 1.2,
      tint: Math.random() < 0.14 ? (Math.random() < 0.5 ? '#c7d2fe' : '#fde68a') : '#ffffff',
    })
  }
  return list
}

function buildStars(W, H) {
  const area = W * H
  const starsBackData = makeStarLayer(Math.max(180, Math.floor(area / 5800)), 0.7, 2.6, W, H)
  const starsFrontData = makeStarLayer(Math.max(80, Math.floor(area / 12000)), 1.3, 1.6, W, H)
  const constellations = []
  const bright = starsFrontData.map((s, i) => ({ s, i })).filter(o => o.s.b > 0.6)
  for (let k = 0; k < 5; k++) {
    const seed = bright[Math.floor(Math.random() * bright.length)]
    if (!seed) break
    const radius = Math.min(W, H) * 0.18
    const near = bright
      .map(o => ({ i: o.i, d: Math.hypot(o.s.x - seed.s.x, o.s.y - seed.s.y) }))
      .filter(o => o.d < radius)
      .sort((a, b) => a.d - b.d)
      .slice(0, 4 + Math.floor(Math.random() * 4))
      .map(o => o.i)
    if (near.length >= 3) constellations.push(near)
  }
  return { starsBackData, starsFrontData, constellations }
}

// ── Pre-render: sun texture ───────────────────────────────────────────────────

function buildSunTexture(sub, idx) {
  const R = Math.round(sub.radius)
  const size = R * 12
  const c = document.createElement('canvas')
  c.width = c.height = size
  const cx = size / 2, cy = size / 2
  const g = c.getContext('2d')
  const rng = mulberry32(idx * 9173 + 13)

  // Corona layers
  g.globalCompositeOperation = 'lighter'
  for (let layer = 0; layer < 3; layer++) {
    const rad = R * (5.2 + layer * 1.6)
    const gr = g.createRadialGradient(cx, cy, R * 0.6, cx, cy, rad)
    gr.addColorStop(0, hexA(sub.halo, 0.20 - layer * 0.05))
    gr.addColorStop(0.4, hexA(sub.color, 0.08 - layer * 0.02))
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, rad, 0, TAU); g.fill()
  }

  // Soft corona shell (no directional rays)
  const softShell = g.createRadialGradient(cx, cy, R * 1.0, cx, cy, R * 4.8)
  softShell.addColorStop(0, hexA(sub.accent, 0.10))
  softShell.addColorStop(0.5, hexA(sub.color, 0.05))
  softShell.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = softShell; g.beginPath(); g.arc(cx, cy, R * 4.8, 0, TAU); g.fill()

  // Solar flares
  for (let i = 0; i < 5; i++) {
    const ang = rng() * TAU, baseR = R, peakR = R * (1.25 + rng() * 0.55), span = 0.18 + rng() * 0.35
    g.save(); g.translate(cx, cy); g.rotate(ang)
    const flare = g.createRadialGradient(peakR, 0, 0, peakR, 0, R * 0.6)
    flare.addColorStop(0, hexA(sub.accent, 0.55)); flare.addColorStop(0.4, hexA(sub.color, 0.25)); flare.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = flare
    g.beginPath()
    g.moveTo(Math.cos(-span) * baseR, Math.sin(-span) * baseR)
    g.quadraticCurveTo(peakR * 1.1, 0, Math.cos(span) * baseR, Math.sin(span) * baseR)
    g.lineTo(Math.cos(span * 0.7) * (baseR * 0.85), Math.sin(span * 0.7) * (baseR * 0.85))
    g.quadraticCurveTo(peakR * 0.6, 0, Math.cos(-span * 0.7) * (baseR * 0.85), Math.sin(-span * 0.7) * (baseR * 0.85))
    g.closePath(); g.fill(); g.restore()
  }

  // Photosphere disk with granulation
  g.globalCompositeOperation = 'source-over'
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.clip()
  const base = g.createRadialGradient(cx - R * 0.15, cy - R * 0.15, R * 0.1, cx, cy, R * 1.05)
  base.addColorStop(0, '#ffffff'); base.addColorStop(0.4, sub.accent); base.addColorStop(0.85, sub.color); base.addColorStop(1, sub.deep)
  g.fillStyle = base; g.fillRect(cx - R, cy - R, R * 2, R * 2)
  g.globalCompositeOperation = 'overlay'
  const cells = Math.floor(R * R * 0.55)
  for (let i = 0; i < cells; i++) {
    const r = Math.sqrt(rng()) * R * 0.98, a = rng() * TAU
    const sz = 0.8 + rng() * 2.4
    g.fillStyle = rng() > 0.55 ? hexA(sub.accent, 0.08 + rng() * 0.18) : hexA(sub.deep, 0.06 + rng() * 0.18)
    g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, sz, 0, TAU); g.fill()
  }
  g.globalCompositeOperation = 'multiply'
  const spots = 3 + Math.floor(rng() * 3)
  for (let i = 0; i < spots; i++) {
    const r = Math.sqrt(rng()) * R * 0.7, a = rng() * TAU
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, sz = R * (0.05 + rng() * 0.10)
    const sg = g.createRadialGradient(x, y, 0, x, y, sz)
    sg.addColorStop(0, hexA(sub.deep, 0.85)); sg.addColorStop(0.6, hexA(sub.deep, 0.35)); sg.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = sg; g.beginPath(); g.arc(x, y, sz, 0, TAU); g.fill()
  }
  g.globalCompositeOperation = 'source-over'
  const limb = g.createRadialGradient(cx, cy, R * 0.85, cx, cy, R)
  limb.addColorStop(0, 'rgba(0,0,0,0)'); limb.addColorStop(1, hexA(sub.deep, 0.55))
  g.fillStyle = limb; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill()
  const hi = g.createRadialGradient(cx - R * 0.5, cy - R * 0.5, 0, cx - R * 0.3, cy - R * 0.3, R * 0.9)
  hi.addColorStop(0, 'rgba(255,255,255,0.55)'); hi.addColorStop(0.5, 'rgba(255,255,255,0)')
  g.fillStyle = hi; g.fillRect(cx - R, cy - R, R * 2, R * 2)
  g.restore()

  g.globalCompositeOperation = 'lighter'
  const core = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.55)
  core.addColorStop(0, 'rgba(255,255,255,0.95)'); core.addColorStop(0.5, 'rgba(255,255,255,0.25)'); core.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = core; g.beginPath(); g.arc(cx, cy, R * 0.55, 0, TAU); g.fill()
  g.globalCompositeOperation = 'source-over'

  return { canvas: c, R, size }
}

// ── Pre-render: planet surface texture ────────────────────────────────────────

function buildPlanetTexture(p, idx) {
  const R = Math.max(8, Math.round(p.size * 4))
  const stripW = R * 4, stripH = R * 2
  const surface = document.createElement('canvas')
  surface.width = stripW; surface.height = stripH
  const sg = surface.getContext('2d')
  const rng = mulberry32(idx * 7919 + 31)

  sg.fillStyle = p.deep; sg.fillRect(0, 0, stripW, stripH)

  if (p.kind === 'gas') {
    const bands = 14 + Math.floor(rng() * 6)
    for (let i = 0; i < bands; i++) {
      const y = (i / bands) * stripH, bh = (stripH / bands) * (0.7 + rng() * 0.6)
      const tone = rng()
      sg.fillStyle = tone < 0.45 ? hexA(p.hue, 0.55 + rng() * 0.25) : tone < 0.8 ? hexA(p.deep, 0.4 + rng() * 0.3) : hexA('#ffffff', 0.06 + rng() * 0.08)
      sg.beginPath(); sg.moveTo(0, y)
      for (let s = 0; s <= 48; s++) sg.lineTo((s / 48) * stripW, y + Math.sin(s * 0.4 + i * 1.3) * 0.8)
      for (let s = 48; s >= 0; s--) sg.lineTo((s / 48) * stripW, y + bh + Math.sin(s * 0.4 + i * 1.3 + 1.1) * 0.8)
      sg.closePath(); sg.fill()
    }
    if (rng() > 0.4) {
      const sx = rng() * stripW, sy = stripH * (0.35 + rng() * 0.3), sw = R * 0.5, sh = R * 0.22
      const sgr = sg.createRadialGradient(sx, sy, 0, sx, sy, sw)
      sgr.addColorStop(0, hexA('#ffffff', 0.45)); sgr.addColorStop(0.4, hexA(p.hue, 0.55)); sgr.addColorStop(1, hexA(p.deep, 0))
      sg.fillStyle = sgr; sg.beginPath(); sg.ellipse(sx, sy, sw, sh, 0, 0, TAU); sg.fill()
    }
  } else if (p.kind === 'icy') {
    const bg = sg.createLinearGradient(0, 0, stripW, stripH)
    bg.addColorStop(0, hexA(p.hue, 0.95)); bg.addColorStop(1, hexA(p.deep, 0.95))
    sg.fillStyle = bg; sg.fillRect(0, 0, stripW, stripH)
    const polar = sg.createLinearGradient(0, 0, 0, stripH)
    polar.addColorStop(0, 'rgba(255,255,255,0.55)'); polar.addColorStop(0.18, 'rgba(255,255,255,0)')
    polar.addColorStop(0.82, 'rgba(255,255,255,0)'); polar.addColorStop(1, 'rgba(255,255,255,0.55)')
    sg.fillStyle = polar; sg.fillRect(0, 0, stripW, stripH)
    for (let i = 0; i < 30 + Math.floor(rng() * 20); i++) {
      const x = rng() * stripW, y = stripH * (0.18 + rng() * 0.64), sz = 0.8 + rng() * 2.6
      sg.fillStyle = hexA(p.deep, 0.4 + rng() * 0.3); sg.beginPath(); sg.arc(x, y, sz, 0, TAU); sg.fill()
      sg.fillStyle = hexA('#ffffff', 0.18 + rng() * 0.25); sg.beginPath(); sg.arc(x - sz * 0.3, y - sz * 0.3, sz * 0.5, 0, TAU); sg.fill()
    }
  } else {
    sg.fillStyle = hexA(p.hue, 0.95); sg.fillRect(0, 0, stripW, stripH)
    for (let i = 0; i < 10 + Math.floor(rng() * 6); i++) {
      const x = rng() * stripW, y = stripH * (0.15 + rng() * 0.7), sz = R * (0.18 + rng() * 0.28)
      sg.fillStyle = hexA(p.deep, 0.5 + rng() * 0.3)
      sg.beginPath()
      for (let k = 0; k <= 10; k++) {
        const ang = (k / 10) * TAU, rr = sz * (0.6 + rng() * 0.7)
        if (k === 0) sg.moveTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr * 0.7)
        else sg.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr * 0.7)
      }
      sg.closePath(); sg.fill()
    }
    for (let i = 0; i < stripW * stripH * 0.12; i++) {
      sg.fillStyle = rng() > 0.5 ? hexA('#ffffff', 0.05 + rng() * 0.06) : hexA('#000000', 0.05 + rng() * 0.06)
      sg.fillRect(rng() * stripW, rng() * stripH, 1, 1)
    }
  }

  // Longitude landmark spots so spin reads clearly
  {
    const sx1 = stripW * 0.18, sy1 = stripH * (0.42 + rng() * 0.16), sw1 = R * 0.7, sh1 = R * 0.32
    const g1 = sg.createRadialGradient(sx1, sy1, 0, sx1, sy1, sw1)
    g1.addColorStop(0, hexA('#ffffff', 0.85)); g1.addColorStop(0.35, hexA(p.hue, 0.85)); g1.addColorStop(0.75, hexA(p.deep, 0.6)); g1.addColorStop(1, hexA(p.deep, 0))
    sg.fillStyle = g1; sg.beginPath(); sg.ellipse(sx1, sy1, sw1, sh1, 0, 0, TAU); sg.fill()

    const sx2 = stripW * 0.68, sy2 = stripH * (0.38 + rng() * 0.24), sw2 = R * 0.55, sh2 = R * 0.28
    const g2 = sg.createRadialGradient(sx2, sy2, 0, sx2, sy2, sw2)
    g2.addColorStop(0, hexA(p.deep, 0.95)); g2.addColorStop(0.5, hexA(p.deep, 0.55)); g2.addColorStop(1, hexA(p.deep, 0))
    sg.fillStyle = g2; sg.beginPath(); sg.ellipse(sx2, sy2, sw2, sh2, 0, 0, TAU); sg.fill()

    const mx = stripW * 0.42
    const mg = sg.createLinearGradient(mx - R * 0.25, 0, mx + R * 0.25, 0)
    mg.addColorStop(0, hexA(p.hue, 0)); mg.addColorStop(0.5, hexA('#ffffff', 0.45)); mg.addColorStop(1, hexA(p.hue, 0))
    sg.fillStyle = mg; sg.fillRect(mx - R * 0.25, stripH * 0.15, R * 0.5, stripH * 0.7)
  }

  const pad = Math.round(R * 0.6)
  const size = (R + pad) * 2
  const c = document.createElement('canvas')
  c.width = c.height = size
  return { canvas: c, surface, stripW, stripH, R, size }
}

// ── Stat card ─────────────────────────────────────────────────────────────────

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
  const canvasRef = useRef(null)
  const containerRef = useRef(null)

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

    const DPR = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0, H = 0, ctx = null

    // Cached layer data
    let nebulaCanvas = null
    let starsBackData = [], starsFrontData = [], constellations = []
    const sunTextures = [], planetTextures = []

    // Drag / inertia
    let dragging = false, lastX = 0, globalRot = 0, dragRot = 0, dragVel = 0

    // Meteors
    const meteors = []

    const { sunData, planetData } = mapApiToScene(data)
    const sunLayout = computeSunLayout(sunData.length)

    function rebuild() {
      const rect = container.getBoundingClientRect()
      W = Math.max(rect.width || container.clientWidth, 1)
      H = Math.max(container.clientHeight, 400)
      canvas.width = Math.round(W * DPR)
      canvas.height = Math.round(H * DPR)
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
      ctx = canvas.getContext('2d', { alpha: true })
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)

      nebulaCanvas = buildNebula(W, H)
      const stars = buildStars(W, H)
      starsBackData = stars.starsBackData
      starsFrontData = stars.starsFrontData
      constellations = stars.constellations

      sunTextures.length = 0
      sunData.forEach((sub, i) => sunTextures.push(buildSunTexture(sub, i)))
      planetTextures.length = 0
      planetData.forEach((p, i) => planetTextures.push(buildPlanetTexture(p, i)))
    }

    // ── Drawing functions (close over ctx / W / H) ───────────────────────────

    function drawNebula() {
      if (nebulaCanvas) ctx.drawImage(nebulaCanvas, 0, 0)
    }

    function drawStarLayer(list, t) {
      for (const s of list) {
        const tw = 0.7 + 0.3 * Math.sin(t * s.tws + s.tw)
        ctx.fillStyle = hexA(s.tint, s.b * tw)
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill()
        if (s.b > 0.85 && s.r > 1.1) {
          ctx.strokeStyle = hexA(s.tint, s.b * tw * 0.45); ctx.lineWidth = 0.6
          ctx.beginPath()
          ctx.moveTo(s.x - s.r * 3.5, s.y); ctx.lineTo(s.x + s.r * 3.5, s.y)
          ctx.moveTo(s.x, s.y - s.r * 3.5); ctx.lineTo(s.x, s.y + s.r * 3.5)
          ctx.stroke()
        }
      }
    }

    function drawConstellations() {
      ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 0.7
      constellations.forEach(chain => {
        ctx.beginPath()
        chain.forEach((i, k) => {
          const s = starsFrontData[i]
          if (k === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y)
        })
        ctx.stroke()
      })
    }

    function drawOrbitEllipse(ocx, ocy, a, e, w, inc) {
      const b = a * Math.sqrt(1 - e * e)
      ctx.save()
      ctx.translate(ocx, ocy); ctx.rotate(w); ctx.translate(-a * e, 0)
      ctx.strokeStyle = 'rgba(199,210,254,0.055)'; ctx.lineWidth = 1
      ctx.setLineDash([2, 4])
      ctx.beginPath(); ctx.ellipse(0, 0, a, b * inc, 0, 0, TAU); ctx.stroke()
      ctx.setLineDash([]); ctx.restore()
    }

    function drawSun(x, y, sub, tex, t) {
      if (!tex) return
      const pulse = 1 + Math.sin(t * 0.5 + sub.pulseT) * 0.04
      const drawSize = tex.size * pulse
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.translate(x, y); ctx.rotate(t * 0.02 + sub.pulseT * 0.1)
      ctx.drawImage(tex.canvas, -drawSize / 2, -drawSize / 2, drawSize, drawSize)
      ctx.restore()
      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      const R = sub.radius * pulse
      const bloom = ctx.createRadialGradient(x, y, 0, x, y, R * 6.5)
      bloom.addColorStop(0, hexA(sub.accent, 0.22)); bloom.addColorStop(0.35, hexA(sub.color, 0.10)); bloom.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = bloom; ctx.beginPath(); ctx.arc(x, y, R * 6.5, 0, TAU); ctx.fill()
      ctx.restore()
    }

    function drawPlanet(p, tex, sunX, sunY, px, py, t, planetIdx) {
      if (!tex) return
      const angToSun = Math.atan2(sunY - py, sunX - px)
      const R = p.size
      const ringTilt = 0.3 + planetIdx * 0.17

      ctx.save(); ctx.globalCompositeOperation = 'lighter'
      const glow = ctx.createRadialGradient(px, py, 0, px, py, R * 3)
      glow.addColorStop(0, hexA(p.hue, 0.18)); glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(px, py, R * 3, 0, TAU); ctx.fill()
      ctx.restore()

      if (p.ring) {
        ctx.save(); ctx.translate(px, py); ctx.rotate(ringTilt); ctx.scale(1, 0.32)
        const rg = ctx.createRadialGradient(0, 0, R * 1.45, 0, 0, R * 2.2)
        rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(0.4, hexA(p.ringColor, 0.55)); rg.addColorStop(0.65, hexA(p.ringColor, 0.7)); rg.addColorStop(0.9, hexA(p.ringColor, 0.25)); rg.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.strokeStyle = rg; ctx.lineWidth = R * 0.9
        ctx.beginPath(); ctx.arc(0, 0, R * 1.85, Math.PI, TAU); ctx.stroke()
        ctx.strokeStyle = hexA('#ffffff', 0.18); ctx.lineWidth = 0.8
        ctx.beginPath(); ctx.arc(0, 0, R * 1.85, Math.PI, TAU); ctx.stroke()
        ctx.restore()
      }

      const spinRate = 0.09 + 0.55 / p.size
      const drawH = R * 2, drawW = drawH * 2
      const sx = ((t * spinRate + planetIdx * 0.9) % 1) * drawW
      ctx.save(); ctx.beginPath(); ctx.arc(px, py, R, 0, TAU); ctx.clip()
      ctx.fillStyle = p.deep; ctx.fillRect(px - R, py - R, R * 2, R * 2)
      if (p.ring) { ctx.translate(px, py); ctx.rotate(ringTilt); ctx.translate(-px, -py) }
      const x0 = px - R - sx, y0 = py - drawH / 2
      for (let copy = -1; copy <= 3; copy++) ctx.drawImage(tex.surface, x0 + copy * drawW, y0, drawW, drawH)
      if (p.ring) { ctx.translate(px, py); ctx.rotate(-ringTilt); ctx.translate(-px, -py) }

      const lx = Math.cos(angToSun), ly = Math.sin(angToSun)
      const lit = ctx.createRadialGradient(px + lx * R * 0.45, py + ly * R * 0.45, R * 0.05, px, py, R * 1.1)
      lit.addColorStop(0, 'rgba(255,255,255,0.45)'); lit.addColorStop(0.4, 'rgba(255,255,255,0)')
      ctx.fillStyle = lit; ctx.fillRect(px - R, py - R, R * 2, R * 2)

      const dark = ctx.createLinearGradient(px + lx * R, py + ly * R, px - lx * R, py - ly * R)
      dark.addColorStop(0, 'rgba(0,0,0,0)'); dark.addColorStop(0.45, 'rgba(0,0,0,0)'); dark.addColorStop(0.55, 'rgba(0,0,0,0.55)'); dark.addColorStop(1, 'rgba(0,0,0,0.92)')
      ctx.fillStyle = dark; ctx.fillRect(px - R, py - R, R * 2, R * 2)
      ctx.restore()

      ctx.save(); ctx.globalCompositeOperation = 'lighter'
      const atmoCx = px + lx * R * 0.3, atmoCy = py + ly * R * 0.3
      const atmo = ctx.createRadialGradient(atmoCx, atmoCy, R * 0.7, atmoCx, atmoCy, R * 1.45)
      atmo.addColorStop(0, hexA(p.hue, 0)); atmo.addColorStop(0.55, hexA(p.hue, 0.20)); atmo.addColorStop(1, hexA(p.hue, 0))
      ctx.fillStyle = atmo; ctx.beginPath(); ctx.arc(px, py, R * 1.45, 0, TAU); ctx.arc(px, py, R, 0, TAU, true); ctx.fill('evenodd')
      ctx.restore()

      if (p.ring) {
        ctx.save(); ctx.translate(px, py); ctx.rotate(ringTilt); ctx.scale(1, 0.32)
        const rg = ctx.createRadialGradient(0, 0, R * 1.45, 0, 0, R * 2.2)
        rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(0.4, hexA(p.ringColor, 0.7)); rg.addColorStop(0.65, hexA(p.ringColor, 0.85)); rg.addColorStop(0.9, hexA(p.ringColor, 0.3)); rg.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.strokeStyle = rg; ctx.lineWidth = R * 0.9
        ctx.beginPath(); ctx.arc(0, 0, R * 1.85, 0, Math.PI); ctx.stroke()
        ctx.strokeStyle = hexA('#ffffff', 0.25); ctx.lineWidth = 0.8
        ctx.beginPath(); ctx.arc(0, 0, R * 1.85, 0, Math.PI); ctx.stroke()
        ctx.restore()
      }
    }

    function drawVignette() {
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.82)
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(0.65, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,8,0.85)')
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H)
    }

    // ── Meteor system ────────────────────────────────────────────────────────

    function spawnMeteor() {
      const baseDist = Math.min(W, H)
      const ang = Math.random() * TAU
      const x = Math.cos(ang) * baseDist * 0.85, y = Math.sin(ang) * baseDist * 0.85
      const targetAng = ang + Math.PI + (Math.random() - 0.5) * 0.6
      const speed = 4.5 + Math.random() * 2.5
      meteors.push({ x, y, vx: Math.cos(targetAng) * speed, vy: Math.sin(targetAng) * speed, life: 0, maxLife: 90 + Math.random() * 40 })
    }

    function updateMeteors() {
      if (Math.random() < 0.006 && meteors.length < 2) spawnMeteor()
      const limit = Math.min(W, H) * 1.1
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i]; m.x += m.vx; m.y += m.vy; m.life++
        if (m.life > m.maxLife || Math.hypot(m.x, m.y) > limit) meteors.splice(i, 1)
      }
    }

    function drawMeteors() {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'
      for (const m of meteors) {
        const lifeT = m.life / m.maxLife
        const fade = lifeT < 0.15 ? lifeT / 0.15 : lifeT > 0.75 ? (1 - lifeT) / 0.25 : 1
        const spd = Math.hypot(m.vx, m.vy), tailLen = 80
        const tx = m.x - m.vx * (tailLen / spd), ty = m.y - m.vy * (tailLen / spd)
        const grad = ctx.createLinearGradient(tx, ty, m.x, m.y)
        grad.addColorStop(0, 'rgba(199,210,254,0)'); grad.addColorStop(0.7, hexA('#c7d2fe', 0.4 * fade)); grad.addColorStop(1, hexA('#ffffff', 0.95 * fade))
        ctx.strokeStyle = grad; ctx.lineWidth = 1.6; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(m.x, m.y); ctx.stroke()
        ctx.fillStyle = hexA('#ffffff', fade); ctx.beginPath(); ctx.arc(m.x, m.y, 1.6, 0, TAU); ctx.fill()
      }
      ctx.restore()
    }

    // ── Frame loop ───────────────────────────────────────────────────────────

    rebuild()
    const startTime = performance.now()

    const onPointerDown = (e) => { dragging = true; lastX = e.clientX; dragVel = 0; canvas.setPointerCapture(e.pointerId) }
    const onPointerMove = (e) => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; dragRot += dx * 0.003; dragVel = dx * 0.003 }
    const onPointerUp = () => { dragging = false }
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)

    let raf = null
    function frame(now) {
      const t = (now - startTime) / 1000
      globalRot += 0.00038
      if (!dragging) { dragRot += dragVel; dragVel *= 0.96; if (Math.abs(dragVel) < 1e-4) dragVel = 0 }
      const rot = globalRot + dragRot
      const breathe = 1 + Math.sin(t * 0.18) * 0.012
      const driftX = Math.sin(t * 0.07) * 6, driftY = Math.cos(t * 0.05) * 4

      ctx.clearRect(0, 0, W, H)
      drawNebula()

      ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(rot * 0.10); ctx.translate(-W / 2, -H / 2)
      drawStarLayer(starsBackData, t); ctx.restore()

      ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(rot * 0.22); ctx.translate(-W / 2, -H / 2)
      drawConstellations(); drawStarLayer(starsFrontData, t); ctx.restore()

      const cxW = W / 2, cyW = H / 2
      ctx.save()
      ctx.translate(cxW + driftX, cyW + driftY)
      ctx.scale(breathe, breathe)
      ctx.rotate(rot)

      const baseDist = Math.min(W, H)
      const sunPos = sunLayout.map(sl => ({ x: sl.nx * baseDist, y: sl.ny * baseDist }))

      planetData.forEach(pl => {
        const sp = sunPos[pl.sun]
        if (sp) drawOrbitEllipse(sp.x, sp.y, pl.a, pl.e, pl.w, pl.inc)
      })

      const planetPositions = planetData.map((pl, idx) => {
        const sub = sunData[pl.sun], sp = sunPos[pl.sun]
        if (!sub || !sp) return null
        const n = 0.075 * Math.sqrt(sub.mass) / Math.pow(pl.a / 60, 1.5)
        const M = pl.M0 + t * n, k = solveKepler(M, pl.e)
        const ox = k.x * pl.a, oy = k.y * pl.a * pl.inc
        const cw = Math.cos(pl.w), sw = Math.sin(pl.w)
        return { px: sp.x + ox * cw - oy * sw, py: sp.y + ox * sw + oy * cw, sp, pl, idx }
      }).filter(Boolean)

      planetPositions.sort((a, b) => a.py - b.py)
      planetPositions.forEach(pp => drawPlanet(pp.pl, planetTextures[pp.idx], pp.sp.x, pp.sp.y, pp.px, pp.py, t, pp.idx))
      sunData.forEach((sub, i) => { if (sunPos[i]) drawSun(sunPos[i].x, sunPos[i].y, sub, sunTextures[i], t) })

      updateMeteors(); drawMeteors()
      ctx.restore()
      drawVignette()

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); rebuild(); raf = requestAnimationFrame(frame) })
    ro.observe(container)

    return () => {
      cancelAnimationFrame(raf); ro.disconnect()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
    }
  }, [data])

  const isEmpty = !loading && data && data.total_notes === 0
  const accuracy = data && data.total_questions_answered > 0
    ? Math.round((data.total_correct / data.total_questions_answered) * 100) : 0

  return (
    <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto fade-in-up">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-100">My Universe</h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.50)', marginTop: 4 }}>
          Every star is a correct answer. Every planet is a note. Every sun is a subject.
        </p>
      </div>

      <div
        ref={containerRef}
        className="relative rounded-2xl overflow-hidden mb-5"
        style={{
          minHeight: '70vh',
          background: 'radial-gradient(ellipse at 48% 35%, rgba(10,6,30,1) 0%, rgba(4,3,14,1) 65%, rgba(2,2,8,1) 100%)',
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
            <div className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(148,163,184,0.3)', boxShadow: '0 0 12px rgba(148,163,184,0.3)' }} />
            <p className="text-sm text-slate-600 text-center max-w-xs leading-relaxed">
              Your universe is waiting.<br />Add notes and take quizzes to bring it to life.
            </p>
          </div>
        )}
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: '100%', cursor: 'grab' }}
        />
        {data && !loading && data.subjects.length > 0 && (
          <div style={{
            position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)',
            background: 'rgba(0,0,0,0.40)', backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12,
            padding: 16, zIndex: 10, minWidth: 148, maxWidth: 210, pointerEvents: 'none',
          }}>
            {data.subjects.map((sub, i) => {
              const color = SUN_PALETTES[i % SUN_PALETTES.length].color
              const hasStats = sub.note_count > 0 || sub.accuracy !== undefined
              return (
                <div key={sub.name} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: i < data.subjects.length - 1 ? 10 : 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: `0 0 6px ${color}88` }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.80)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sub.name}
                    </span>
                    {hasStats && (
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', display: 'block' }}>
                        {sub.note_count} {sub.note_count === 1 ? 'note' : 'notes'}
                        {sub.accuracy !== undefined && ` · ${sub.accuracy}%`}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
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
