import { Link } from 'react-router-dom'
import Logo from '../components/Logo'

const STEPS = [
  {
    n: '01',
    title: 'Add your notes',
    body:
      "Paste lecture notes, problem sets, or chapter excerpts. The AI extracts the topics automatically — no manual tagging, no deck-building busywork.",
    img: '/landing/notes.png',
    alt: 'StudyNerve notes screen with a saved class note and topic chip',
  },
  {
    n: '02',
    title: 'Find your gaps',
    body:
      "Adaptive quizzes target your weakest topics first. Every answer feeds a per-topic accuracy score, so the AI knows where you actually struggle — not where you say you do.",
    img: '/landing/quiz.png',
    alt: 'StudyNerve quiz configuration screen with Standard and Adaptive modes',
  },
  {
    n: '03',
    title: 'Watch your AI Brain grow',
    body:
      "Your knowledge becomes a living constellation. Topics you've nailed glow steadily; topics you keep missing pulse until you close them. It's the AI's model of you, made visible.",
    img: '/landing/ai-brain.png',
    alt: 'StudyNerve AI Brain — a 3D knowledge graph of topics and insights',
  },
]

function Pill({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted mb-3 flex items-center gap-2">
      <span className="inline-block w-1 h-1 rounded-full bg-accent" />
      {children}
    </p>
  )
}

function PrimaryCTA({ children }) {
  return (
    <Link
      to="/login?signup=1"
      className="inline-flex items-center gap-1.5 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg px-5 py-2.5 transition-colors"
    >
      {children} <span aria-hidden>→</span>
    </Link>
  )
}

function SignInLink() {
  return (
    <Link to="/login" className="text-sm text-ink-muted hover:text-ink-secondary px-2 py-2 transition-colors">
      Already have an account?{' '}
      <span className="text-ink-secondary underline-offset-2 hover:underline">Sign in</span>
    </Link>
  )
}

function TrustItem({ title, body }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink-primary mb-2">{title}</h3>
      <p className="text-sm text-ink-muted leading-relaxed" style={{ textWrap: 'pretty' }}>
        {body}
      </p>
    </div>
  )
}

function ProductFrame({ src, alt }) {
  // Marketing-page assets — eager-load all four so they're guaranteed present
  // by the time the user scrolls (and by the time any screenshot run fires).
  return (
    <div
      className="rounded-xl border border-border-subtle overflow-hidden bg-deep-surface"
      style={{ boxShadow: '0 16px 48px -16px rgba(0,0,0,0.55)' }}
    >
      <img
        src={src}
        alt={alt}
        className="block w-full h-auto"
        loading="eager"
        decoding="sync"
      />
    </div>
  )
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-deep-bg text-ink-primary">
      {/* Nav */}
      <header
        className="sticky top-0 z-30 border-b border-border-subtle backdrop-blur"
        style={{ background: 'rgba(9,9,11,0.72)' }}
      >
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-ink-primary">
            <Logo size={22} className="text-accent" />
            <span className="font-bold tracking-tight">StudyNerve</span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              to="/login"
              className="text-sm text-ink-secondary hover:text-ink-primary px-3 py-1.5 transition-colors"
            >
              Sign in
            </Link>
            <Link
              to="/login?signup=1"
              className="text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg px-3.5 py-1.5 transition-colors"
            >
              Start free
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: 'linear-gradient(to right, transparent, rgba(99,102,241,0.55), transparent)' }}
        />
        <div className="max-w-6xl mx-auto px-6 pt-14 pb-12 sm:pt-24 sm:pb-16">
          <Pill>For students with their own notes</Pill>
          <h1
            className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.05] text-ink-primary max-w-4xl"
            style={{ textWrap: 'balance' }}
          >
            Drop your notes.{' '}
            <span className="text-ink-secondary">Find your gaps.</span>{' '}
            <span className="text-accent">Drill them shut.</span>
          </h1>
          <p
            className="mt-6 text-base sm:text-lg leading-relaxed text-ink-secondary max-w-2xl"
            style={{ textWrap: 'pretty' }}
          >
            StudyNerve reads your actual class material, quizzes you to find what you don't know,
            and drills the exact gaps until your AI Brain agrees you've got it.
          </p>

          <div className="mt-8 flex items-center gap-3 flex-wrap">
            <PrimaryCTA>Start free</PrimaryCTA>
            <SignInLink />
          </div>

          <p className="mt-5 text-xs text-ink-muted">
            No ads. No tracking. Your data stays local.
          </p>

          <div className="relative mt-12 sm:mt-20">
            <ProductFrame
              src="/landing/dashboard.png"
              alt="StudyNerve dashboard — Smart Pick targets your weakest topic, with a weekly study grid, stat cards, recent activity, weak areas, and topic mastery"
            />
          </div>
        </div>
      </section>

      {/* The loop */}
      <section className="border-t border-border-subtle">
        <div className="max-w-6xl mx-auto px-6 py-20 sm:py-28">
          <div className="mb-14 sm:mb-20 max-w-3xl">
            <Pill>How it works</Pill>
            <h2
              className="text-3xl sm:text-4xl font-bold tracking-tight text-ink-primary"
              style={{ textWrap: 'balance' }}
            >
              One loop. Your notes go in, your weak spots come out, then they close.
            </h2>
          </div>

          <div className="space-y-20 sm:space-y-28">
            {STEPS.map((step, i) => {
              const reverse = i % 2 === 1
              return (
                <article
                  key={step.n}
                  className="grid md:grid-cols-12 gap-8 md:gap-10 items-center"
                >
                  <div className={`md:col-span-5 ${reverse ? 'md:order-2' : ''}`}>
                    <div className="flex items-center gap-3 mb-4">
                      <span
                        className="text-xs font-semibold tracking-[0.22em] text-accent"
                        style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
                      >
                        {step.n}
                      </span>
                      <span className="h-px flex-1 max-w-[72px] bg-border-subtle" />
                    </div>
                    <h3
                      className="text-2xl sm:text-3xl font-bold tracking-tight text-ink-primary mb-4"
                      style={{ textWrap: 'balance' }}
                    >
                      {step.title}
                    </h3>
                    <p
                      className="text-base text-ink-secondary leading-relaxed"
                      style={{ textWrap: 'pretty' }}
                    >
                      {step.body}
                    </p>
                  </div>
                  <div className={`md:col-span-7 ${reverse ? 'md:order-1' : ''}`}>
                    <ProductFrame src={step.img} alt={step.alt} />
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      {/* Why it's different */}
      <section className="border-t border-border-subtle">
        <div className="max-w-6xl mx-auto px-6 py-20 sm:py-28">
          <Pill>Why it's different</Pill>
          <h2
            className="text-3xl sm:text-4xl font-bold tracking-tight text-ink-primary max-w-3xl mb-10"
            style={{ textWrap: 'balance' }}
          >
            Not a chatbot. Not a flashcard deck. A loop that closes.
          </h2>
          <div className="grid md:grid-cols-2 gap-10 max-w-4xl">
            <p
              className="text-base text-ink-secondary leading-relaxed"
              style={{ textWrap: 'pretty' }}
            >
              Most AI study apps are general-purpose chatbots in a flashcard wrapper.
              StudyNerve reads your{' '}
              <em className="text-ink-primary not-italic font-semibold">actual</em> lecture notes,
              generates questions from{' '}
              <em className="text-ink-primary not-italic font-semibold">your</em> material, and
              tracks which specific topics you've nailed — and which ones you keep missing.
            </p>
            <p
              className="text-base text-ink-secondary leading-relaxed"
              style={{ textWrap: 'pretty' }}
            >
              Quizlet asks you to build the decks. StudyNerve builds them. Then it watches whether
              you actually learn them, and drills the parts your AI Brain says you haven't.
            </p>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="border-t border-border-subtle">
        <div className="max-w-6xl mx-auto px-6 py-20 sm:py-24">
          <Pill>Trust</Pill>
          <div className="grid md:grid-cols-3 gap-8 sm:gap-12 mt-6 max-w-4xl">
            <TrustItem
              title="No ads. No tracking."
              body="Nothing to monetize. We don't sell behavior, attention, or anything else."
            />
            <TrustItem
              title="Your data stays local."
              body="Your notes, quiz history, and AI Brain live in your account. You can wipe it all from Settings whenever you want."
            />
            <TrustItem
              title="Bring your own AI key."
              body="Plug in Groq (free) or any OpenAI-compatible provider. Your study material never trains anyone else's model."
            />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border-subtle relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: 'linear-gradient(to right, transparent, rgba(99,102,241,0.55), transparent)' }}
        />
        <div className="max-w-6xl mx-auto px-6 py-24 sm:py-32 text-center">
          <h2
            className="text-3xl sm:text-5xl font-bold tracking-tight text-ink-primary max-w-2xl mx-auto"
            style={{ textWrap: 'balance' }}
          >
            Stop re-reading. Start drilling.
          </h2>
          <p
            className="mt-5 text-base text-ink-secondary max-w-xl mx-auto"
            style={{ textWrap: 'pretty' }}
          >
            One free account. Paste your notes. The loop starts on its own.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
            <PrimaryCTA>Start free</PrimaryCTA>
            <SignInLink />
          </div>
        </div>
      </section>

      {/* Footer */}
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
    </div>
  )
}
