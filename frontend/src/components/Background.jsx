import { useEffect, useRef } from 'react'

// ── Wave definitions ───────────────────────────────────────────────────────────
// opacity: boosted to 0.15 for visual confirmation — reduce to 0.03-0.06 once
//          rendering is verified.
// amp:     fraction of viewport height — min 0.05 (~54px at 1080p), some at 0.07.
//          The previous 0.030 values were only 32px, below visible threshold.

const WAVES = [
  { rgb: [67,  56, 202], opacity: 0.15, baseY: 0.62, yDrift: 0.026, ySpeed: 0.058, amp: 0.06, freq: 0.0026, speed: 0.220, phase: 0.00 },
  { rgb: [67,  56, 202], opacity: 0.12, baseY: 0.70, yDrift: 0.032, ySpeed: 0.043, amp: 0.07, freq: 0.0016, speed: 0.275, phase: 3.80 },
  { rgb: [124, 58, 237], opacity: 0.13, baseY: 0.67, yDrift: 0.030, ySpeed: 0.050, amp: 0.06, freq: 0.0019, speed: 0.200, phase: 1.30 },
  { rgb: [124, 58, 237], opacity: 0.10, baseY: 0.77, yDrift: 0.022, ySpeed: 0.066, amp: 0.05, freq: 0.0029, speed: 0.210, phase: 2.10 },
  { rgb: [37,  99, 235], opacity: 0.13, baseY: 0.73, yDrift: 0.024, ySpeed: 0.074, amp: 0.06, freq: 0.0033, speed: 0.244, phase: 2.60 },
  { rgb: [37,  99, 235], opacity: 0.09, baseY: 0.71, yDrift: 0.028, ySpeed: 0.055, amp: 0.06, freq: 0.0021, speed: 0.259, phase: 4.50 },
  { rgb: [13, 148, 136], opacity: 0.10, baseY: 0.81, yDrift: 0.025, ySpeed: 0.036, amp: 0.05, freq: 0.0024, speed: 0.176, phase: 0.90 },
]

export default function Background() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    let w = 0, h = 0, rafId = null
    let frameCount = 0

    // ── Resize ────────────────────────────────────────────────────────────────
    // Sets BOTH the drawing buffer size (canvas.width/height) AND reads back
    // the rendered CSS size so they always match.
    function resize() {
      w = canvas.width  = window.innerWidth
      h = canvas.height = window.innerHeight
      console.log(`[Background] resize → ${w}×${h}`)
    }

    resize()
    window.addEventListener('resize', resize)

    // ── Debug: verify wave math produces real curves ───────────────────────────
    const testT  = Date.now() / 1000
    const wave0  = WAVES[0]
    const cy0    = wave0.baseY * h + Math.sin(testT * wave0.ySpeed + wave0.phase * 0.7) * wave0.yDrift * h
    const amp0   = wave0.amp * h
    console.log(`[Background] Wave 0: cy=${cy0.toFixed(1)}px  amp=±${amp0.toFixed(1)}px`)
    for (const x of [0, 400, 800, 1200, 1600]) {
      const y = cy0 + Math.sin(x * wave0.freq + testT * wave0.speed + wave0.phase) * amp0
      console.log(`  x=${x} → y=${y.toFixed(1)}`)
    }

    // ── Draw a single wave ────────────────────────────────────────────────────
    function drawWave(wave, t) {
      const [r, g, b] = wave.rgb

      // Vertical center: slow independent bob
      const cy  = wave.baseY * h + Math.sin(t * wave.ySpeed + wave.phase * 0.7) * wave.yDrift * h
      const amp = wave.amp * h

      const STEP = 4

      ctx.beginPath()
      ctx.moveTo(0, h)
      ctx.lineTo(0, cy + Math.sin(wave.phase + t * wave.speed) * amp)

      for (let x = STEP; x <= w + STEP; x += STEP) {
        const y = cy + Math.sin(x * wave.freq + t * wave.speed + wave.phase) * amp
        ctx.lineTo(x, y)
      }

      ctx.lineTo(w, h)
      ctx.closePath()

      // Gradient: transparent at wave crest → peak glow just below → fade to 0
      const gradTop = cy - amp - 4
      const grad    = ctx.createLinearGradient(0, gradTop, 0, h)
      grad.addColorStop(0.00, `rgba(${r},${g},${b},0)`)
      grad.addColorStop(0.18, `rgba(${r},${g},${b},${wave.opacity})`)
      grad.addColorStop(0.55, `rgba(${r},${g},${b},${(wave.opacity * 0.28).toFixed(4)})`)
      grad.addColorStop(1.00, `rgba(${r},${g},${b},0)`)

      ctx.fillStyle = grad
      ctx.fill()
    }

    // ── Rising mist at the dark/wave boundary ────────────────────────────────
    function drawMist(t) {
      const drift = Math.sin(t * 0.038) * h * 0.009
      const top   = h * 0.47 + drift
      const bot   = h * 0.65 + drift

      const grad = ctx.createLinearGradient(0, top, 0, bot)
      grad.addColorStop(0.00, 'rgba(255,255,255,0)')
      grad.addColorStop(0.60, 'rgba(255,255,255,0.006)')
      grad.addColorStop(1.00, 'rgba(255,255,255,0.014)')

      ctx.fillStyle = grad
      ctx.fillRect(0, top, w, bot - top)
    }

    // ── Animation loop ────────────────────────────────────────────────────────
    function frame() {
      frameCount++
      if (frameCount % 60 === 0) {
        console.log(`[Background] frame=${frameCount}  t=${(Date.now() / 1000).toFixed(1)}s  canvas=${w}×${h}`)
      }

      const t = Date.now() / 1000

      ctx.clearRect(0, 0, w, h)
      drawMist(t)

      for (const wave of WAVES) {
        drawWave(wave, t)
      }

      rafId = requestAnimationFrame(frame)
    }

    rafId = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position:      'fixed',
        top:           0,
        left:          0,
        width:         '100%',   // CSS display size matches drawing buffer
        height:        '100%',   // without this, canvas may not fill viewport
        zIndex:        0,
        pointerEvents: 'none',
        display:       'block',
      }}
    />
  )
}
