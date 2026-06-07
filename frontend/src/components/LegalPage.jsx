import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'

// Prose styling for legal docs. Distinct from MarkdownRenderer (which is tuned
// for compact chat/quiz output) — these need generous spacing, larger body
// type, real heading hierarchy, and clickable mailto links. We reuse the
// already-installed react-markdown so no new dependency lands.
const proseComponents = {
  h1: ({ children }) => (
    <h1 className="text-3xl font-bold tracking-tight text-ink-primary mb-1">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-base font-semibold text-ink-primary mt-8 mb-3">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold text-ink-secondary mt-5 mb-2">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="text-sm leading-relaxed text-ink-secondary mb-3">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="my-3 space-y-1.5 pl-5 text-sm text-ink-secondary list-disc marker:text-accent/60">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 space-y-1.5 pl-5 text-sm text-ink-secondary list-decimal marker:text-accent/60">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-ink-primary">{children}</strong>
  ),
  a: ({ children, href }) => {
    const isExternal =
      href?.startsWith('http://') ||
      href?.startsWith('https://') ||
      href?.startsWith('mailto:')
    return (
      <a
        href={href}
        className="text-accent hover:text-accent-hover transition-colors underline underline-offset-2"
        target={isExternal ? '_blank' : undefined}
        rel={isExternal ? 'noopener noreferrer' : undefined}
      >
        {children}
      </a>
    )
  },
  hr: () => <hr className="my-6 border-white/[0.08]" />,
}

export default function LegalPage({ content, otherDocPath, otherDocLabel }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center px-4 py-16"
      style={{
        background:
          'radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.08) 0%, transparent 70%)',
      }}
    >
      <div className="w-full max-w-2xl">
        <article className="card p-8 sm:p-10">
          <ReactMarkdown components={proseComponents}>{content}</ReactMarkdown>
        </article>

        <div className="flex justify-center gap-6 mt-8 text-xs text-ink-faint">
          <Link to="/" className="hover:text-ink-secondary transition-colors">
            ← Back to StudyNerve
          </Link>
          {otherDocPath && (
            <Link
              to={otherDocPath}
              className="hover:text-ink-secondary transition-colors"
            >
              {otherDocLabel}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
