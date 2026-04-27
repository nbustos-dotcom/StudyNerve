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

// Sun: warm star tones (vary per subject hash)
const SUN_TONES = [
  { core: '#fff9e6', inner: '#fbbf24', outer: '#d97706' },
  { core: '#fff7ed', inner: '#fb923c', outer: '#ea580c' },
  { core: '#fefce8', inner: '#facc15', outer: '#ca8a04' },
  { core: '#f0fdf4', inner: '#4ade80', outer: '#15803d' },
  { core: '#f0f9ff', inner: '#38bdf8', outer: '#0284c7' },
  { core: '#fdf4ff', inner: '#e879f9', outer: '#a21caf' },
]

const COMET_COLORS = ['#e0e7ff', '#c7d2fe', '#a5f3fc', '#d1fae5', '#fde68a']

// ── Seeded PRNG + hash ────────────────────────────────────────────────────────

function seededRng(seed) {
  let s = (Math.abs(seed | 0) % 233279) + 1
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
}

function hashStr(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) + str.charCodeAt(i)) | 0
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
  const c = v => Math.min(255, Math.max(0, v))
  return `rgb(${c(parseInt(hex.slice(1,3),16)+Math.round(amt*200))},${c(parseInt(hex.slice(3,5),16)+Math.round(amt*200))},${c(parseInt(hex.slice(5,7),16)+Math.round(amt*200))})`
}

function darkenHex(hex, amt) {
  const c = v => Math.min(255, Math.max(0, v))
  return `rgb(${c(parseInt(hex.slice(1,3),16)-Math.round(amt*180))},${c(parseInt(hex.slice(3,5),16)-Math.round(amt*180))},${c(parseInt(hex.slice(5,7),16)-Math.round(amt*180))})`
}

// ── Galaxy dot pre-computation ────────────────────────────────────────────────

function makeGalaxyDots(radius, seed) {
  const rng = seededRng(seed * 9871 + 333)
  const dots = []
  for (let arm = 0; arm < 2; arm++) {
    const ao = (arm / 2) * Math.PI * 2
    for (let j = 0; j < 42; j++) {
      const t = j / 42
      const r = (0.06 + t * 0.94) * radius
      const theta = ao + t * Math.PI * 3.8 + (rng() - 0.5) * 0.65
      const sc = r * 0.16 * (rng() - 0.5)
      dots.push({
        x: Math.cos(theta) * (r + sc),
        y: Math.sin(theta) * (r + sc) * 0.52,
        size: 0.4 + (1 - t) * 1.7,
        op: 0.14 + (1 - t) * 0.58,
      })
    }
  }
  // Dense core
  for (let j = 0; j < 24; j++) {
    const r = rng() * radius * 0.22
    const a = rng() * Math.PI * 2
    dots.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.52, size: 0.7 + rng() * 2.1, op: 0.48 + rng() * 0.42 })
  }
  return dots
}

// ── Scene generation ──────────────────────────────────────────────────────────

function generateScene(data, W, H) {
  const {
    total_correct = 0,
    total_flashcards_reviewed = 0,
    study_streak = 0,
    daily_activity = [],
    subjects = [],
  } = data
  const notes = data.notes || []

  console.log('[StudyUniverse] notes:', notes.length, '| subjects:', subjects.length, '| streak:', study_streak, '| flashcards reviewed:', total_flashcards_reviewed)

  const cx = W / 2
  const cy = H / 2

  // ── Suns: most active subject at center ───────────────────────────────────
  const sortedSubj = [...subjects].sort((a, b) => (b.quiz_count || 0) - (a.quiz_count || 0))
  const primaryName = sortedSubj[0]?.name || ''
  const nonPrimary = subjects.filter(s => s.name !== primaryName)
  const clusterDist = subjects.length <= 1 ? 0 : Math.min(W, H) * 0.3

  const suns = subjects.map(sub => {
    const isPrimary = sub.name === primaryName
    const ncIdx = nonPrimary.indexOf(sub)
    const angle = isPrimary ? 0 : (ncIdx / Math.max(nonPrimary.length, 1)) * Math.PI * 2 - Math.PI / 2
    const dist = isPrimary ? 0 : clusterDist
    const sx = cx + Math.cos(angle) * dist
    const sy = cy + Math.sin(angle) * dist

    const tone = SUN_TONES[hashStr(sub.name) % SUN_TONES.length]
    const colors = PALETTE[hashStr(sub.name) % PALETTE.length]
    const sunRadius = 20 + Math.min((sub.quiz_count || 0) * 0.7, 15)
    const nebulaRadius = 85 + Math.min((sub.note_count || 0) * 7, 115)

    // Stars: proportional to quiz activity
    const totalQuiz = subjects.reduce((s, s2) => s + (s2.quiz_count || 0), 0)
    const ratio = totalQuiz > 0 ? (sub.quiz_count || 0) / totalQuiz : 1 / Math.max(subjects.length, 1)
    const starCount = Math.round(Math.min(total_correct, 420) * ratio)
    const scatter = Math.min(W, H) * 0.19
    const rng = seededRng(hashStr(sub.name) ^ ((sub.note_count || 0) * 97))
    const stars = []
    for (let j = 0; j < starCount; j++) {
      const u1 = Math.max(rng(), 1e-10), u2 = rng()
      const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
      const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2)
      stars.push({
        x: sx + z0 * scatter, y: sy + z1 * scatter,
        size: 0.7 + rng() * 2.2,
        phase: rng() * Math.PI * 2,
        period: 2.5 + rng() * 5,
        bright: rng() < 0.13,
      })
    }

    return { name: sub.name, x: sx, y: sy, radius: sunRadius, tone, colors, nebulaRadius, stars, isPrimary, pulsePhase: (hashStr(sub.name) % 628) / 100 }
  })

  // ── Planets: one per note, orbiting its subject's sun ────────────────────
  const notesBySubj = {}
  for (const note of notes) {
    const key = note.subject || 'Uncategorized'
    if (!notesBySubj[key]) notesBySubj[key] = []
    notesBySubj[key].push(note)
  }

  const orbitStep = subjects.length <= 1 ? 28 : 22
  const planets = []

  for (const sun of suns) {
    const subjNotes = notesBySubj[sun.name] || []
    subjNotes.forEach((note, i) => {
      const tier = i % 5
      const orbitRadius = sun.radius + 28 + tier * orbitStep
      const notesInTier = subjNotes.filter((_, k) => k % 5 === tier).length
      const posInTier = Math.floor(i / 5)
      const angle0 = (posInTier / Math.max(notesInTier, 1)) * Math.PI * 2 + tier * 1.26

      const rng = seededRng(note.id * 137 + 1)
      // Kepler-ish: outer orbits slower
      const orbitSpeed = (0.038 + rng() * 0.022) / Math.sqrt(Math.max(orbitRadius / 55, 1))

      const cl = note.content_length || 0
      let type, bodyRadius
      if (cl < 500) {
        type = 'rocky'
        bodyRadius = 4 + rng() * 4      // 4–8 px
      } else if (cl < 2000) {
        type = 'gas'
        bodyRadius = 9 + rng() * 9      // 9–18 px
      } else {
        type = 'ringed'
        bodyRadius = 11 + rng() * 7     // 11–18 px
      }

      const pci = (hashStr(note.id.toString()) + 3) % PALETTE.length
      const colors = PALETTE[pci]
      const bandColor = PALETTE[(pci + 3) % PALETTE.length].planet
      const ringTilt = 0.38 + rng() * 0.35

      planets.push({ sunX: sun.x, sunY: sun.y, orbitRadius, angle0, orbitSpeed, bodyRadius, type, colors, bandColor, ringTilt })
    })
  }

  // ── Galaxies (streak milestones) ──────────────────────────────────────────
  const galaxies = []
  if (study_streak >= 7) {
    galaxies.push({ x: W * 0.11, y: H * 0.17, radius: 28, dots: makeGalaxyDots(28, 1), rotSpeed: (Math.PI * 2) / 30 })
  }
  if (study_streak >= 14) {
    galaxies.push({ x: W * 0.89, y: H * 0.79, radius: 42, dots: makeGalaxyDots(42, 2), rotSpeed: (Math.PI * 2) / 36 })
  }
  if (study_streak >= 30) {
    galaxies.push({ x: W * 0.87, y: H * 0.13, radius: 60, dots: makeGalaxyDots(60, 3), rotSpeed: (Math.PI * 2) / 44 })
  }

  // ── Comets (last 24 h activity) ───────────────────────────────────────────
  const todayStr = new Date().toISOString().split('T')[0]
  const ydayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  const recentEntry = daily_activity.find(d => d.date === todayStr) || daily_activity.find(d => d.date === ydayStr)
  const cometCount = Math.min(recentEntry?.actions || 0, 5)
  const comets = []
  for (let i = 0; i < cometCount; i++) {
    const rng = seededRng(i * 1729 + 99)
    const spread = 0.28 + rng() * 0.28
    const edge = i % 4
    let x0, y0, angle
    if (edge === 0)      { x0 = -0.05; y0 = 0.2 + rng() * 0.6; angle = -spread + rng() * spread * 2 }
    else if (edge === 1) { x0 = 1.05;  y0 = 0.2 + rng() * 0.6; angle = Math.PI - spread + rng() * spread * 2 }
    else if (edge === 2) { x0 = 0.2 + rng() * 0.6; y0 = -0.05; angle = Math.PI / 2 - spread + rng() * spread * 2 }
    else                 { x0 = 0.2 + rng() * 0.6; y0 = 1.05;  angle = -Math.PI / 2 - spread + rng() * spread * 2 }
    comets.push({
      x0, y0,
      dx: Math.cos(angle) * 1.3,
      dy: Math.sin(angle) * 1.3,
      period: 22 + rng() * 13,
      phaseOffset: rng() * 35,
      tailLen: 36 + rng() * 58,
      color: COMET_COLORS[i % COMET_COLORS.length],
    })
  }

  // ── Asteroid belt (50+ flashcards reviewed) ───────────────────────────────
  let asteroidBelt = null
  if (total_flashcards_reviewed >= 50) {
    const count = Math.min(60 + Math.floor(total_flashcards_reviewed / 4), 220)
    const beltRadius = Math.min(W, H) * 0.46
    const rng = seededRng(77777)
    const dots = Array.from({ length: count }, () => ({
      angle: rng() * Math.PI * 2,
      rOff: (rng() - 0.5) * 20,
      size: 0.5 + rng() * 1.3,
      op: 0.25 + rng() * 0.5,
    }))
    asteroidBelt = { radius: beltRadius, dots, rotSpeed: 0.007 }
  }

  // ── Activity pulses (last 7 days) ─────────────────────────────────────────
  const now7 = Date.now()
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
  const pulses = daily_activity
    .filter(d => now7 - new Date(d.date).getTime() <= sevenDaysMs)
    .map((d, i, arr) => {
      const daysAgo = (now7 - new Date(d.date).getTime()) / (24 * 60 * 60 * 1000)
      const recency = 1 - Math.min(daysAgo, 7) / 7
      return {
        phaseOffset: (i / Math.max(arr.length, 1)) * 4000,
        maxRadius: 55 + Math.min((d.actions || 0) * 4, 110),
        maxOpacity: 0.05 + recency * 0.12,
      }
    })

  return { cx, cy, suns, planets, galaxies, comets, asteroidBelt, pulses }
}

// ── Draw: sun ─────────────────────────────────────────────────────────────────

function drawSun(ctx, sun, t) {
  const { x, y, radius, tone, pulsePhase } = sun
  const pulse = 1 + 0.03 * Math.sin(t * (Math.PI * 2 / 4) + pulsePhase)
  const r = radius * pulse

  // Outermost haze
  const g3 = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 5)
  g3.addColorStop(0, hexToRgba(tone.outer, 0.1))
  g3.addColorStop(0.45, hexToRgba(tone.outer, 0.04))
  g3.addColorStop(1, hexToRgba(tone.outer, 0))
  ctx.beginPath(); ctx.arc(x, y, r * 5, 0, Math.PI * 2)
  ctx.fillStyle = g3; ctx.fill()

  // Mid glow
  const g2 = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6)
  g2.addColorStop(0, hexToRgba(tone.inner, 0.38))
  g2.addColorStop(0.5, hexToRgba(tone.outer, 0.2))
  g2.addColorStop(1, hexToRgba(tone.outer, 0))
  ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, Math.PI * 2)
  ctx.fillStyle = g2; ctx.fill()

  // Core body
  const core = ctx.createRadialGradient(x - r * 0.22, y - r * 0.22, 0, x, y, r)
  core.addColorStop(0, tone.core)
  core.addColorStop(0.3, tone.inner)
  core.addColorStop(0.72, tone.outer)
  core.addColorStop(1, darkenHex(tone.outer, 0.25))
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = core; ctx.fill()
}

// ── Draw: planet ──────────────────────────────────────────────────────────────

function drawPlanet(ctx, p, px, py, t) {
  const { bodyRadius: pr, type, colors, bandColor, ringTilt } = p
  const selfRot = t * p.orbitSpeed * 6

  // Orbit path
  ctx.beginPath()
  ctx.arc(p.sunX, p.sunY, p.orbitRadius, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'
  ctx.lineWidth = 0.5
  ctx.stroke()

  // Soft glow halo
  const glow = ctx.createRadialGradient(px, py, 0, px, py, pr * 2.6)
  glow.addColorStop(0, hexToRgba(colors.glow, 0.18))
  glow.addColorStop(0.6, hexToRgba(colors.glow, 0.05))
  glow.addColorStop(1, hexToRgba(colors.glow, 0))
  ctx.beginPath(); ctx.arc(px, py, pr * 2.6, 0, Math.PI * 2)
  ctx.fillStyle = glow; ctx.fill()

  if (type === 'rocky') {
    // Gray-brown rocky sphere — highlight shifts as planet "rotates"
    const hx = px + pr * 0.32 * Math.cos(selfRot)
    const hy = py - pr * 0.32 * Math.sin(selfRot)
    const body = ctx.createRadialGradient(hx, hy, 0, px, py, pr)
    body.addColorStop(0, '#a09078')
    body.addColorStop(0.38, '#6b5848')
    body.addColorStop(0.75, '#3d2e22')
    body.addColorStop(1, '#1e160f')
    ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2)
    ctx.fillStyle = body; ctx.fill()

    ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(180,150,120,0.35)'
    ctx.lineWidth = 0.7; ctx.stroke()

  } else if (type === 'gas') {
    // Gas giant: clipped sphere with horizontal band overlay
    ctx.save()
    ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.clip()

    const base = ctx.createRadialGradient(px - pr * 0.28, py - pr * 0.28, 0, px, py, pr * 1.1)
    base.addColorStop(0, lightenHex(colors.planet, 0.32))
    base.addColorStop(0.5, colors.planet)
    base.addColorStop(1, darkenHex(colors.planet, 0.28))
    ctx.fillStyle = base
    ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2)

    // Band overlay — drifts slowly
    const bandShift = Math.sin(selfRot * 0.3) * 0.06
    const band = ctx.createLinearGradient(px, py - pr, px, py + pr)
    band.addColorStop(0, 'rgba(0,0,0,0)')
    band.addColorStop(Math.max(0, 0.22 + bandShift), hexToRgba(bandColor, 0.22))
    band.addColorStop(0.32, 'rgba(0,0,0,0)')
    band.addColorStop(Math.max(0, 0.48 - bandShift), hexToRgba(bandColor, 0.17))
    band.addColorStop(0.58, 'rgba(0,0,0,0)')
    band.addColorStop(Math.min(1, 0.74 + bandShift), hexToRgba(bandColor, 0.13))
    band.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = band
    ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2)

    ctx.restore()

    ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2)
    ctx.strokeStyle = hexToRgba(lightenHex(colors.planet, 0.5), 0.38)
    ctx.lineWidth = 0.8; ctx.stroke()

  } else {
    // Ringed planet: back ring → body → front ring
    const rx = pr * 1.92
    const ry = pr * 0.44 * Math.cos(ringTilt)

    // Back of ring (top half of ellipse — behind planet)
    ctx.beginPath()
    ctx.ellipse(px, py, rx, ry, 0, Math.PI, Math.PI * 2)
    ctx.strokeStyle = hexToRgba(colors.planet, 0.4)
    ctx.lineWidth = pr * 0.32; ctx.stroke()

    ctx.beginPath()
    ctx.ellipse(px, py, rx * 0.72, ry * 0.72, 0, Math.PI, Math.PI * 2)
    ctx.strokeStyle = hexToRgba(darkenHex(colors.planet, 0.18), 0.22)
    ctx.lineWidth = pr * 0.14; ctx.stroke()

    // Planet body
    const hx = px + pr * 0.28 * Math.cos(selfRot)
    const hy = py - pr * 0.28 * Math.sin(selfRot)
    const body = ctx.createRadialGradient(hx, hy, 0, px, py, pr)
    body.addColorStop(0, lightenHex(colors.planet, 0.46))
    body.addColorStop(0.42, colors.planet)
    body.addColorStop(0.82, darkenHex(colors.planet, 0.32))
    body.addColorStop(1, darkenHex(colors.planet, 0.46))
    ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2)
    ctx.fillStyle = body; ctx.fill()

    ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2)
    ctx.strokeStyle = hexToRgba(lightenHex(colors.planet, 0.5), 0.35)
    ctx.lineWidth = 0.9; ctx.stroke()

    // Front of ring (bottom half of ellipse — in front of planet)
    ctx.beginPath()
    ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI)
    ctx.strokeStyle = hexToRgba(lightenHex(colors.planet, 0.14), 0.62)
    ctx.lineWidth = pr * 0.32; ctx.stroke()

    ctx.beginPath()
    ctx.ellipse(px, py, rx * 0.72, ry * 0.72, 0, 0, Math.PI)
    ctx.strokeStyle = hexToRgba(darkenHex(colors.planet, 0.08), 0.28)
    ctx.lineWidth = pr * 0.14; ctx.stroke()
  }
}

// ── Draw: galaxy ──────────────────────────────────────────────────────────────

function drawGalaxy(ctx, galaxy, t) {
  const { x, y, dots, rotSpeed } = galaxy
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(t * rotSpeed)
  for (const dot of dots) {
    ctx.globalAlpha = dot.op
    ctx.fillStyle = dot.x > 0 ? 'rgba(180,150,255,1)' : 'rgba(110,200,255,1)'
    ctx.beginPath(); ctx.arc(dot.x, dot.y, dot.size, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 1
  ctx.restore()
}

// ── Draw: comet ───────────────────────────────────────────────────────────────

function drawComet(ctx, comet, W, H, t) {
  const phase = ((t + comet.phaseOffset) % comet.period) / comet.period
  const hx = (comet.x0 + comet.dx * phase) * W
  const hy = (comet.y0 + comet.dy * phase) * H
  const fade = Math.sin(phase * Math.PI)
  if (fade < 0.03) return

  const angle = Math.atan2(comet.dy, comet.dx)
  const tx = hx - Math.cos(angle) * comet.tailLen
  const ty = hy - Math.sin(angle) * comet.tailLen

  const grad = ctx.createLinearGradient(tx, ty, hx, hy)
  grad.addColorStop(0, 'rgba(255,255,255,0)')
  grad.addColorStop(0.55, hexToRgba(comet.color, fade * 0.32))
  grad.addColorStop(1, hexToRgba(comet.color, fade * 0.88))
  ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy)
  ctx.strokeStyle = grad; ctx.lineWidth = 1.6; ctx.stroke()

  // Head
  ctx.save()
  ctx.shadowColor = comet.color; ctx.shadowBlur = 10
  ctx.globalAlpha = fade * 0.95
  ctx.beginPath(); ctx.arc(hx, hy, 2.2, 0, Math.PI * 2)
  ctx.fillStyle = 'white'; ctx.fill()
  ctx.restore()
}

// ── Draw: asteroid belt ───────────────────────────────────────────────────────

function drawAsteroidBelt(ctx, belt, cx, cy, t) {
  const rot = t * belt.rotSpeed
  ctx.fillStyle = 'rgba(150,155,165,1)'
  for (const dot of belt.dots) {
    const a = dot.angle + rot
    const r = belt.radius + dot.rOff
    ctx.globalAlpha = dot.op * 0.65
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, dot.size, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

// ── Main frame render ─────────────────────────────────────────────────────────

const CONSTEL_THRESHOLD = 75
const CONSTEL_MAX_PER_STAR = 3

function drawFrame(ctx, W, H, scene, ts) {
  ctx.clearRect(0, 0, W, H)
  const { suns, planets, galaxies, comets, asteroidBelt, pulses, cx, cy } = scene
  const t = ts / 1000

  // Global slow rotation
  ctx.save()
  ctx.translate(cx, cy); ctx.rotate(t * (0.5 * Math.PI / 180)); ctx.translate(-cx, -cy)

  // 1. Asteroid belt (outermost, behind everything)
  if (asteroidBelt) drawAsteroidBelt(ctx, asteroidBelt, cx, cy, t)

  // 2. Nebula clouds
  for (const sun of suns) {
    const g = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, sun.nebulaRadius)
    g.addColorStop(0, hexToRgba(sun.colors.nebula, 0.055))
    g.addColorStop(0.45, hexToRgba(sun.colors.nebula, 0.025))
    g.addColorStop(1, hexToRgba(sun.colors.nebula, 0))
    ctx.beginPath(); ctx.arc(sun.x, sun.y, sun.nebulaRadius, 0, Math.PI * 2)
    ctx.fillStyle = g; ctx.fill()
  }

  // 3. Constellation lines
  ctx.lineWidth = 0.6
  for (const sun of suns) {
    const stars = sun.stars.length > 120 ? sun.stars.slice(0, 120) : sun.stars
    for (let i = 0; i < stars.length; i++) {
      let conn = 0
      for (let j = i + 1; j < stars.length && conn < CONSTEL_MAX_PER_STAR; j++) {
        const dx = stars[i].x - stars[j].x, dy = stars[i].y - stars[j].y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < CONSTEL_THRESHOLD) {
          ctx.beginPath()
          ctx.strokeStyle = `rgba(200,215,255,${(0.12 * (1 - d / CONSTEL_THRESHOLD)).toFixed(3)})`
          ctx.moveTo(stars[i].x, stars[i].y); ctx.lineTo(stars[j].x, stars[j].y); ctx.stroke()
          conn++
        }
      }
    }
  }

  // 4. Stars (twinkle)
  ctx.shadowColor = 'rgba(190,225,255,0.9)'
  for (const sun of suns) {
    for (const star of sun.stars) {
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (2 * Math.PI / star.period) + star.phase))
      ctx.shadowBlur = star.bright ? 8 : star.size > 1.8 ? 5 : 0
      ctx.globalAlpha = tw
      ctx.fillStyle = star.bright ? sun.colors.glow : 'rgb(225,240,255)'
      ctx.beginPath(); ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2); ctx.fill()
    }
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0

  // 5. Galaxies
  for (const g of galaxies) drawGalaxy(ctx, g, t)

  // 6. Planets (orbit paths + bodies, includes ringed back/front rings)
  for (const p of planets) {
    const angle = p.angle0 + t * p.orbitSpeed
    const px = p.sunX + Math.cos(angle) * p.orbitRadius
    const py = p.sunY + Math.sin(angle) * p.orbitRadius
    drawPlanet(ctx, p, px, py, t)
  }

  // 7. Suns — drawn on top of planets so the star always shines through
  for (const sun of suns) drawSun(ctx, sun, t)

  ctx.restore() // end global rotation

  // 8. Activity pulses (symmetric — no rotation needed)
  for (const pulse of pulses) {
    const cycle = ((ts + pulse.phaseOffset) % 4000) / 4000
    ctx.beginPath(); ctx.arc(cx, cy, cycle * pulse.maxRadius, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(165,180,252,${((1 - cycle) * pulse.maxOpacity).toFixed(3)})`
    ctx.lineWidth = 1.5; ctx.stroke()
  }

  // 9. Comets (drift independently of global rotation)
  for (const comet of comets) drawComet(ctx, comet, W, H, t)
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

  const isEmpty = data && data.total_notes === 0 && data.total_correct === 0 && data.daily_activity.length === 0
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
        {isEmpty && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 z-10 pointer-events-none">
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(148,163,184,0.25)', boxShadow: '0 0 10px rgba(148,163,184,0.25)' }} />
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
          <StatCard label="Notes" value={data.total_notes} sub="planets in orbit" />
          <StatCard label="Total Stars" value={data.total_correct.toLocaleString()} sub="correct answers" />
          <StatCard label="Study Streak" value={`${data.study_streak}d`} sub="consecutive days" />
          <StatCard label="Accuracy" value={`${accuracy}%`} sub="of all questions" />
          <StatCard label="Study Days" value={data.total_study_days} sub="last 30 days" />
          <StatCard label="Flashcards" value={data.total_flashcards_reviewed} sub="reviewed" />
          <StatCard label="Chat Sessions" value={data.total_chat_sessions} sub="tutoring sessions" />
          <StatCard label="Vision Boards" value={data.total_vision_boards} sub="plans created" />
        </div>
      )}

      {/* Subject legend */}
      {data && !loading && data.subjects.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {data.subjects.map(sub => {
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
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: SUN_TONES[hashStr(sub.name) % SUN_TONES.length].inner, boxShadow: `0 0 6px ${SUN_TONES[hashStr(sub.name) % SUN_TONES.length].outer}` }} />
                {sub.name}
                <span className="text-slate-600 ml-0.5">· {sub.note_count} notes</span>
              </div>
            )
          })}
          {data.study_streak >= 7 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs" style={{ background: 'rgba(109,40,217,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa' }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'rgba(180,150,255,0.8)' }} />
              Galaxy · {data.study_streak}d streak
            </div>
          )}
          {data.total_flashcards_reviewed >= 50 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs" style={{ background: 'rgba(30,30,50,0.5)', border: '1px solid rgba(150,155,165,0.3)', color: '#94a3b8' }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'rgba(150,155,165,0.7)' }} />
              Asteroid Belt · {data.total_flashcards_reviewed} flashcards
            </div>
          )}
        </div>
      )}
    </div>
  )
}
