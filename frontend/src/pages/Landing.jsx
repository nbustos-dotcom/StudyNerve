import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Brain, Layers, MessagesSquare, RefreshCw, Target,
} from 'lucide-react'
import Logo from '../components/Logo'

// ── Background atmosphere ────────────────────────────────────────────────────
// Single fixed-position layer with four ingredients, in stacking order:
//   1. Three off-center indigo gradient washes (depth — replaces the flat
//      single-blob radial that read as generic).
//   2. A slowly-drifting neural constellation on <canvas> — a faint echo of
//      the AI Brain product. Sparse, low-alpha, never busy.
//   3. A tiled SVG-noise grain — the detail that makes the dark feel crafted
//      rather than rendered.
//   4. An edge vignette — corners just slightly darker than the center so
//      the dark has dimension.
// Everything is `pointer-events: none`, fixed, and behind the page via z-index.

// Noise tile is computed once at module load and reused across instances.
// `feTurbulence` runs when the browser rasterizes the data URI; the result is
// cached as an image, so it costs us nothing per paint.
const NOISE_URI = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>
    <filter id='n'>
      <feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/>
      <feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.5 0'/>
    </filter>
    <rect width='100%' height='100%' filter='url(#n)'/>
  </svg>`,
)}")`

function LandingBackground() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    let nodes = []
    let raf = null
    let lastT = 0
    let dims = { w: 0, h: 0 }

    function sizeCanvas() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      dims = { w, h }
    }

    function seed() {
      // Density: bumped so the field reads as a neural network, not a few
      // stray motes. Desktop scales with viewport area, capped so 4K
      // monitors don't turn into a mesh; mobile stays tasteful.
      const isMobile = dims.w < 640
      const target = isMobile
        ? 32
        : Math.min(90, Math.round((dims.w * dims.h) / 22000))
      nodes = []
      for (let i = 0; i < target; i++) {
        nodes.push({
          x: Math.random() * dims.w,
          y: Math.random() * dims.h,
          // ~3–9 px/s drift — slow enough to feel ambient, never busy.
          vx: (Math.random() - 0.5) * 0.012,
          vy: (Math.random() - 0.5) * 0.012,
        })
      }
    }

    function draw() {
      const { w, h } = dims
      ctx.clearRect(0, 0, w, h)

      // Lines first so nodes sit on top of their own connections.
      // Peak line opacity 22%, line width 0.8 — clearly perceptible against
      // #09090b but still soft enough to feel atmospheric.
      const CONN = 150
      ctx.lineWidth = 0.8
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const d = Math.hypot(dx, dy)
          if (d > CONN) continue
          const alpha = (1 - d / CONN) * 0.22
          ctx.strokeStyle = `rgba(165,180,252,${alpha.toFixed(3)})`
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
      }

      // Nodes: 1.7 px radius at 55% opacity — small but plainly visible.
      ctx.fillStyle = 'rgba(199,210,254,0.55)'
      for (const n of nodes) {
        ctx.beginPath()
        ctx.arc(n.x, n.y, 1.7, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    function step(t) {
      // Cap delta so a backgrounded tab returning doesn't teleport everything.
      const dt = lastT === 0 ? 16 : Math.min(t - lastT, 50)
      lastT = t

      const { w, h } = dims
      for (const n of nodes) {
        n.x += n.vx * dt
        n.y += n.vy * dt
        // Edge wrap (cleaner than bounce — no clusters at the walls).
        if (n.x < -10) n.x = w + 10
        else if (n.x > w + 10) n.x = -10
        if (n.y < -10) n.y = h + 10
        else if (n.y > h + 10) n.y = -10
      }
      draw()
      raf = requestAnimationFrame(step)
    }

    sizeCanvas()
    seed()
    draw()
    if (!reduced) {
      lastT = 0
      raf = requestAnimationFrame(step)
    }

    const onResize = () => {
      sizeCanvas()
      seed()
      draw()
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* 1. Three indigo washes — each centered INSIDE the viewport so the
             core of the ellipse actually lands in view (the previous values
             pushed centers off-canvas, leaving only the dim outer tail). */}
      {/* Wash A — primary, top-right, anchors hero atmosphere */}
      <div
        className="absolute"
        style={{
          top: '0%', right: '0%', width: '62%', height: '60%',
          background:
            'radial-gradient(ellipse at center, rgba(99,102,241,0.32) 0%, transparent 65%)',
          filter: 'blur(60px)',
        }}
      />
      {/* Wash B — mid-left, fills the page midpoint */}
      <div
        className="absolute"
        style={{
          top: '28%', left: '-5%', width: '55%', height: '55%',
          background:
            'radial-gradient(ellipse at center, rgba(99,102,241,0.22) 0%, transparent 65%)',
          filter: 'blur(60px)',
        }}
      />
      {/* Wash C — bottom-right, lifts the FinalCTA region */}
      <div
        className="absolute"
        style={{
          bottom: '0%', right: '5%', width: '52%', height: '48%',
          background:
            'radial-gradient(ellipse at center, rgba(129,140,248,0.22) 0%, transparent 65%)',
          filter: 'blur(60px)',
        }}
      />

      {/* 2. Drifting neural constellation. */}
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* 3. Grain — the detail that separates designed from rendered.
             Opacity 0.06 reads as a soft texture without graining the type. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: NOISE_URI,
          backgroundRepeat: 'repeat',
          opacity: 0.06,
          mixBlendMode: 'overlay',
        }}
      />

      {/* 4. Edge vignette — gives the dark some dimension toward the corners. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 90% 75% at 50% 50%, transparent 55%, rgba(0,0,0,0.45) 100%)',
        }}
      />
    </div>
  )
}

// ── Reveal ───────────────────────────────────────────────────────────────────
// Lightweight scroll-in animation. No library — single IntersectionObserver,
// runs once per element. Honors `prefers-reduced-motion` by snapping to the
// visible state instantly.

function Reveal({ children, className = '', delay = 0, as: Tag = 'div' }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) { setVisible(true); return }

    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          io.disconnect()
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <Tag
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(14px)',
        transition: `opacity 700ms ease-out ${delay}ms, transform 700ms ease-out ${delay}ms`,
        willChange: 'opacity, transform',
      }}
    >
      {children}
    </Tag>
  )
}

// ── Reusable accent CTA ──────────────────────────────────────────────────────

function CTAButton({ to, children }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg px-5 py-2.5 transition-colors"
    >
      {children} <span aria-hidden>→</span>
    </Link>
  )
}

// ── Nav ──────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <header className="absolute top-0 inset-x-0 z-30">
      <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-ink-primary">
          <Logo size={22} className="text-accent" />
          <span className="text-sm font-semibold tracking-tight">StudyNerve</span>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Link
            to="/login"
            className="text-sm text-ink-muted hover:text-ink-primary transition-colors px-3 py-1.5"
          >
            Log in
          </Link>
          <Link
            to="/login?signup=1"
            className="text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg px-3.5 py-1.5 transition-colors"
          >
            Sign up free
          </Link>
        </div>
      </div>
    </header>
  )
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative px-6 pt-32 pb-24 sm:pt-40 sm:pb-32">
      <div className="max-w-3xl mx-auto text-center">
        <Reveal>
          <span
            className="inline-flex items-center gap-2 text-[11px] font-medium tracking-wide text-ink-secondary/90 px-3 py-1 rounded-full mb-8"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <span className="w-1 h-1 rounded-full bg-accent" />
            AI-powered <span className="text-ink-faint">·</span> Free
          </span>
        </Reveal>

        <Reveal delay={60}>
          <h1
            className="text-ink-primary font-bold"
            style={{
              fontSize: 'clamp(2.5rem, 6vw, 4.75rem)',
              lineHeight: 1.04,
              letterSpacing: '-0.025em',
              textWrap: 'balance',
            }}
          >
            It&apos;s about you.
          </h1>
        </Reveal>

        <Reveal delay={120}>
          <p
            className="text-ink-secondary mx-auto mt-7"
            style={{
              fontSize: 'clamp(1rem, 1.6vw, 1.18rem)',
              lineHeight: 1.6,
              maxWidth: 580,
              textWrap: 'pretty',
            }}
          >
            StudyNerve learns how you learn, finds the gaps you can&apos;t see
            on your own, and closes them. One-on-one help, minus the price tag.
          </p>
        </Reveal>

      </div>

      {/* Product visual — AI Brain as the signature image */}
      <Reveal delay={260} className="mt-20 max-w-5xl mx-auto">
        <div className="relative">
          <div
            aria-hidden
            className="absolute -inset-x-12 -inset-y-10 -z-10 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(99,102,241,0.22) 0%, transparent 60%)',
              filter: 'blur(60px)',
            }}
          />
          <div
            className="rounded-2xl overflow-hidden bg-deep-surface"
            style={{
              border: '1px solid rgba(255,255,255,0.07)',
              boxShadow:
                '0 24px 80px -24px rgba(0,0,0,0.65), 0 0 0 1px rgba(99,102,241,0.08) inset',
            }}
          >
            <img
              src="/landing/ai-brain.png"
              alt="StudyNerve AI Brain — a 3D knowledge graph where bright nodes are topics you've mastered and dim nodes are topics you keep missing"
              className="block w-full h-auto"
              loading="eager"
              decoding="sync"
            />
          </div>
        </div>
      </Reveal>
    </section>
  )
}

// ── How it works ─────────────────────────────────────────────────────────────

const STEPS = [
  { n: '01', title: 'Add your notes',  body: 'Paste or upload — we pull out the key topics.' },
  { n: '02', title: 'Get quizzed',     body: 'AI builds quizzes from your material.' },
  { n: '03', title: 'Find your gaps',  body: "It spots exactly what you're weak on." },
  { n: '04', title: 'Adapt & repeat',  body: 'Adaptive quizzes drill your weak spots.' },
]

function HowItWorks() {
  return (
    <section className="px-6 py-28 sm:py-36">
      <div className="max-w-6xl mx-auto">
        <Reveal>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint mb-10 text-center sm:text-left">
            How it works
          </p>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-y-10 sm:gap-x-10">
          {STEPS.map((step, i) => (
            <Reveal key={step.n} delay={i * 70}>
              <div className="sm:pl-6 sm:border-l sm:border-border-subtle">
                <p className="text-xs font-mono text-ink-faint mb-3">{step.n}</p>
                <h3 className="text-base font-semibold text-ink-primary mb-2 tracking-tight">
                  {step.title}
                </h3>
                <p className="text-sm text-ink-muted leading-relaxed" style={{ textWrap: 'pretty' }}>
                  {step.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Feature highlights ───────────────────────────────────────────────────────

const FEATURES = [
  { Icon: MessagesSquare, title: 'Nervo AI tutor',   body: 'A study partner that adapts to how you think.' },
  { Icon: Brain,          title: 'AI Brain',         body: 'Your knowledge, visualized as a living 3D graph.' },
  { Icon: Target,         title: 'Adaptive quizzes', body: 'Each round targets your weakest topics first.' },
  { Icon: Layers,         title: 'Flashcards',       body: 'Active-recall decks generated from your notes.' },
  { Icon: RefreshCw,      title: 'Canvas sync',      body: 'Pull in courses and assignments automatically.' },
]

function Features() {
  return (
    <section className="px-6 pb-28 sm:pb-36">
      <div className="max-w-6xl mx-auto">
        <Reveal>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint mb-10 text-center sm:text-left">
            Features
          </p>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-x-6 gap-y-10">
          {FEATURES.map(({ Icon, title, body }, i) => (
            <Reveal key={title} delay={i * 50}>
              <div>
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center mb-4"
                  style={{
                    background: 'rgba(99,102,241,0.10)',
                    border: '1px solid rgba(99,102,241,0.18)',
                  }}
                >
                  <Icon size={17} strokeWidth={1.6} className="text-accent-hover" />
                </div>
                <h3 className="text-sm font-semibold text-ink-primary mb-1.5 tracking-tight">
                  {title}
                </h3>
                <p className="text-xs text-ink-muted leading-relaxed" style={{ textWrap: 'pretty' }}>
                  {body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Final CTA ────────────────────────────────────────────────────────────────

function FinalCTA() {
  return (
    <section className="relative px-6 py-32">
      <Reveal className="max-w-2xl mx-auto text-center">
        <h2
          className="text-ink-primary font-bold"
          style={{
            fontSize: 'clamp(2rem, 4.5vw, 3.25rem)',
            lineHeight: 1.05,
            letterSpacing: '-0.022em',
            textWrap: 'balance',
          }}
        >
          Ready to study smarter?
        </h2>
        <div className="mt-8 flex justify-center">
          <CTAButton to="/login?signup=1">Sign up free</CTAButton>
        </div>
      </Reveal>
    </section>
  )
}

// ── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-border-subtle">
      <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row gap-4 items-center justify-between">
        <Link
          to="/"
          className="flex items-center gap-2 text-ink-muted hover:text-ink-secondary transition-colors"
        >
          <Logo size={18} className="text-accent" />
          <span className="text-sm font-semibold">StudyNerve</span>
        </Link>
        <div className="flex items-center gap-5">
          <Link to="/terms" className="text-xs text-ink-faint hover:text-ink-secondary transition-colors">
            Terms
          </Link>
          <Link to="/privacy" className="text-xs text-ink-faint hover:text-ink-secondary transition-colors">
            Privacy
          </Link>
        </div>
      </div>
    </footer>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Landing() {
  return (
    // `isolate` (CSS `isolation: isolate`) is load-bearing here.
    //
    // Without it, our -z-10 LandingBackground and -z-20 base-dark layers paint
    // in the ROOT html stacking context at level 2 (negative-z group). The
    // global stylesheet sets a radial-gradient background-image on <body>,
    // which paints at level 3 (in-flow non-positioned descendants) — directly
    // ON TOP of everything at level 2. End result: washes + constellation +
    // grain + vignette get covered by body's bg-image and the page looks flat.
    //
    // `isolate` makes the page root form its own stacking context, scoping
    // the negative-z layers inside it. The wash layers now paint between the
    // root's bg (transparent) and its content (level 6), out of reach of any
    // ancestor's painting. The base-dark fixed child at -z-20 fills the
    // viewport with deep-bg so body's bg-image never shows through.
    <div className="relative isolate min-h-screen text-ink-primary font-sans antialiased overflow-x-hidden">
      <div aria-hidden className="fixed inset-0 -z-20 bg-deep-bg pointer-events-none" />
      <LandingBackground />
      <Nav />
      <main className="relative">
        <Hero />
        <HowItWorks />
        <Features />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  )
}
