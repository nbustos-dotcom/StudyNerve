import { useEffect, useRef } from 'react'

const WAVES = [
  { rgb: [99,  102, 241], opacity: 0.22, baseY: 0.58, yDrift: 0.020, ySpeed: 0.055, amp: 0.055, freq: 0.0028, speed: 0.22, phase: 0.0 },
  { rgb: [129, 140, 248], opacity: 0.10, baseY: 0.64, yDrift: 0.028, ySpeed: 0.043, amp: 0.070, freq: 0.0016, speed: 0.28, phase: 3.8 },
  { rgb: [79,  70,  229], opacity: 0.14, baseY: 0.68, yDrift: 0.026, ySpeed: 0.050, amp: 0.060, freq: 0.0019, speed: 0.20, phase: 1.3 },
  { rgb: [139, 92,  246], opacity: 0.08, baseY: 0.74, yDrift: 0.022, ySpeed: 0.066, amp: 0.050, freq: 0.0029, speed: 0.21, phase: 2.1 },
  { rgb: [109, 100, 238], opacity: 0.11, baseY: 0.78, yDrift: 0.024, ySpeed: 0.074, amp: 0.060, freq: 0.0033, speed: 0.24, phase: 2.6 },
  { rgb: [88,  80,  230], opacity: 0.09, baseY: 0.84, yDrift: 0.028, ySpeed: 0.055, amp: 0.055, freq: 0.0021, speed: 0.26, phase: 4.5 },
  { rgb: [67,  56,  202], opacity: 0.12, baseY: 0.92, yDrift: 0.015, ySpeed: 0.036, amp: 0.040, freq: 0.0024, speed: 0.18, phase: 0.9 },
]

const ORBS = [
  { x: 0.20, y: 0.45, r: 140, hue: 260, phase: 0.0, speed: 0.35 },
  { x: 0.78, y: 0.55, r: 180, hue: 270, phase: 2.1, speed: 0.28 },
  { x: 0.50, y: 0.72, r: 160, hue: 260, phase: 4.0, speed: 0.40 },
]

const RAYS = [
  { x: 0.18, angle: -0.15, width: 0.18, opacity: 0.06, speed: 0.08, phase: 0.0 },
  { x: 0.42, angle:  0.05, width: 0.22, opacity: 0.05, speed: 0.06, phase: 1.7 },
  { x: 0.68, angle: -0.08, width: 0.16, opacity: 0.07, speed: 0.09, phase: 3.2 },
  { x: 0.88, angle:  0.12, width: 0.20, opacity: 0.04, speed: 0.07, phase: 4.5 },
]

const PARTICLE_COUNT = 110

export default function Background() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let w = 0, h = 0, dpr = 1
    let rafId = null
    let particles = []
    const mouse = { x: -9999, y: -9999, active: false }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function initParticles() {
      particles = []
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.12,
          vy: -0.05 - Math.random() * 0.12,
          r: 0.6 + Math.random() * 1.6,
          hue: 250 + Math.random() * 30,
          phase: Math.random() * Math.PI * 2,
          pulseSpeed: 0.6 + Math.random() * 1.4,
          baseAlpha: 0.25 + Math.random() * 0.55,
        })
      }
    }

    function drawBackground() {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0.00, '#0a0a1a')
      g.addColorStop(0.30, '#08081a')
      g.addColorStop(0.65, '#050515')
      g.addColorStop(1.00, '#030010')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    }

    function drawSurfaceGlow(t) {
      const y = h * 0.52 + Math.sin(t * 0.3) * 6
      const grad = ctx.createLinearGradient(0, y - 40, 0, y + 40)
      grad.addColorStop(0.00, 'rgba(129, 140, 248, 0)')
      grad.addColorStop(0.50, 'rgba(129, 140, 248, 0.05)')
      grad.addColorStop(1.00, 'rgba(129, 140, 248, 0)')
      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      ctx.fillStyle = grad
      ctx.fillRect(0, y - 40, w, 80)
      ctx.restore()
    }

    function drawRays(t) {
      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      for (const ray of RAYS) {
        const sway = Math.sin(t * ray.speed + ray.phase) * 40
        const topX = ray.x * w + sway
        const bottomX = topX + Math.tan(ray.angle) * h
        const width = ray.width * w
        ctx.beginPath()
        ctx.moveTo(topX - width * 0.15, 0)
        ctx.lineTo(topX + width * 0.15, 0)
        ctx.lineTo(bottomX + width * 0.6, h)
        ctx.lineTo(bottomX - width * 0.6, h)
        ctx.closePath()
        const grad = ctx.createLinearGradient(topX, 0, bottomX, h)
        const flicker = 0.85 + Math.sin(t * 1.2 + ray.phase) * 0.15
        grad.addColorStop(0.00, `rgba(129, 140, 248, ${ray.opacity * flicker})`)
        grad.addColorStop(0.50, `rgba(99, 102, 241, ${ray.opacity * 0.4 * flicker})`)
        grad.addColorStop(1.00, 'rgba(0, 0, 0, 0)')
        ctx.fillStyle = grad
        ctx.fill()
      }
      ctx.restore()
    }

    function drawOrbs(t) {
      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      for (const orb of ORBS) {
        const breath = 0.6 + Math.sin(t * orb.speed + orb.phase) * 0.4
        const driftX = Math.sin(t * 0.1 + orb.phase) * 30
        const driftY = Math.cos(t * 0.08 + orb.phase) * 20
        const x = orb.x * w + driftX
        const y = orb.y * h + driftY
        const r = orb.r * (0.85 + breath * 0.3)
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
        grad.addColorStop(0.00, `hsla(${orb.hue}, 85%, 70%, ${0.18 * breath})`)
        grad.addColorStop(0.35, `hsla(${orb.hue}, 80%, 55%, ${0.08 * breath})`)
        grad.addColorStop(1.00, `hsla(${orb.hue}, 70%, 40%, 0)`)
        ctx.fillStyle = grad
        ctx.fillRect(x - r, y - r, r * 2, r * 2)
      }
      ctx.restore()
    }

    function drawWave(wave, t) {
      const [r, g, b] = wave.rgb
      const cy = wave.baseY * h + Math.sin(t * wave.ySpeed + wave.phase * 0.7) * wave.yDrift * h
      const amp = wave.amp * h
      const STEP = 4
      ctx.beginPath()
      ctx.moveTo(0, h)
      ctx.lineTo(0, cy + Math.sin(wave.phase + t * wave.speed) * amp)
      for (let x = STEP; x <= w + STEP; x += STEP) {
        const y = cy
          + Math.sin(x * wave.freq + t * wave.speed + wave.phase) * amp
          + Math.sin(x * wave.freq * 2.3 + t * wave.speed * 0.7 + wave.phase) * amp * 0.25
        ctx.lineTo(x, y)
      }
      ctx.lineTo(w, h)
      ctx.closePath()
      const gradTop = cy - amp - 4
      const grad = ctx.createLinearGradient(0, gradTop, 0, h)
      grad.addColorStop(0.00, `rgba(${r},${g},${b},0)`)
      grad.addColorStop(0.12, `rgba(${r},${g},${b},${wave.opacity})`)
      grad.addColorStop(0.55, `rgba(${r},${g},${b},${(wave.opacity * 0.3).toFixed(4)})`)
      grad.addColorStop(1.00, `rgba(${r},${g},${b},0)`)
      ctx.fillStyle = grad
      ctx.fill()
    }

    function drawWaveShimmer(wave, t) {
      const [r, g, b] = wave.rgb
      const cy = wave.baseY * h + Math.sin(t * wave.ySpeed + wave.phase * 0.7) * wave.yDrift * h
      const amp = wave.amp * h
      const STEP = 6
      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      ctx.beginPath()
      for (let x = 0; x <= w; x += STEP) {
        const y = cy
          + Math.sin(x * wave.freq + t * wave.speed + wave.phase) * amp
          + Math.sin(x * wave.freq * 2.3 + t * wave.speed * 0.7 + wave.phase) * amp * 0.25
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = `rgba(${Math.min(255, r + 80)}, ${Math.min(255, g + 80)}, ${Math.min(255, b + 80)}, 0.18)`
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.restore()
    }

    function drawParticles(t) {
      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      for (const p of particles) {
        p.x += p.vx + Math.sin(t * 0.3 + p.phase) * 0.08
        p.y += p.vy + Math.cos(t * 0.2 + p.phase) * 0.04
        if (mouse.active) {
          const dx = p.x - mouse.x
          const dy = p.y - mouse.y
          const dist2 = dx * dx + dy * dy
          if (dist2 < 14400) {
            const dist = Math.sqrt(dist2) || 1
            const force = (1 - dist / 120) * 1.8
            p.x += (dx / dist) * force
            p.y += (dy / dist) * force
          }
        }
        if (p.x < -10) p.x = w + 10
        if (p.x > w + 10) p.x = -10
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w }
        if (p.y > h + 10) p.y = -10
        const pulse = 0.4 + Math.sin(t * p.pulseSpeed + p.phase) * 0.6
        const alpha = p.baseAlpha * pulse
        const radius = p.r * (0.8 + pulse * 0.4)
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 6)
        grad.addColorStop(0.00, `hsla(${p.hue}, 95%, 75%, ${alpha})`)
        grad.addColorStop(0.30, `hsla(${p.hue}, 90%, 60%, ${alpha * 0.3})`)
        grad.addColorStop(1.00, `hsla(${p.hue}, 85%, 50%, 0)`)
        ctx.fillStyle = grad
        ctx.fillRect(p.x - radius * 6, p.y - radius * 6, radius * 12, radius * 12)
        ctx.beginPath()
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${p.hue}, 100%, 90%, ${Math.min(1, alpha * 1.8)})`
        ctx.fill()
      }
      ctx.restore()
    }

    function frame() {
      const t = performance.now() / 1000
      drawBackground()
      drawSurfaceGlow(t)
      drawRays(t)
      drawOrbs(t)
      for (const wave of WAVES) drawWave(wave, t)
      for (const wave of WAVES) drawWaveShimmer(wave, t)
      drawParticles(t)
      rafId = requestAnimationFrame(frame)
    }

    function drawStatic() {
      const t = 0
      drawBackground()
      drawSurfaceGlow(t)
      drawRays(t)
      drawOrbs(t)
      for (const wave of WAVES) drawWave(wave, t)
      drawParticles(t)
    }

    function onMouseMove(e) {
      mouse.x = e.clientX
      mouse.y = e.clientY
      mouse.active = true
    }
    function onMouseLeave() {
      mouse.active = false
      mouse.x = -9999
      mouse.y = -9999
    }
    function onResize() {
      resize()
      initParticles()
    }

    resize()
    initParticles()
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseleave', onMouseLeave)
    window.addEventListener('resize', onResize)

    if (reducedMotion) {
      drawStatic()
    } else {
      rafId = requestAnimationFrame(frame)
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseleave', onMouseLeave)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
        display: 'block',
        background: '#030010',
      }}
    />
  )
}
