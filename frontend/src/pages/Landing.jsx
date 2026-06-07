import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Brain, Layers, MessagesSquare, RefreshCw, Target,
} from 'lucide-react'
import Logo from '../components/Logo'

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
      {/* Soft indigo wash behind the headline */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(99,102,241,0.18) 0%, transparent 60%)',
        }}
      />

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
            Study smarter, not longer.
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
            StudyNerve turns your notes into adaptive quizzes that hunt down
            exactly what you don&apos;t know yet.
          </p>
        </Reveal>

        <Reveal delay={180}>
          <div className="flex items-center justify-center gap-3 mt-10">
            <CTAButton to="/login?signup=1">Sign up free</CTAButton>
            <Link
              to="/login"
              className="text-sm font-medium text-ink-secondary hover:text-ink-primary px-4 py-2.5 transition-colors"
            >
              Log in
            </Link>
          </div>
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
      <div
        aria-hidden
        className="absolute inset-0 -z-10 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 50% 80% at 50% 50%, rgba(99,102,241,0.16) 0%, transparent 60%)',
        }}
      />
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
    <div className="relative min-h-screen bg-deep-bg text-ink-primary font-sans antialiased overflow-x-hidden">
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
