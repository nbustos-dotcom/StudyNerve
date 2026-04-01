/**
 * MarkdownRenderer — shared component for all AI response surfaces.
 *
 * Features:
 *  - KaTeX math: inline ($...$) and block ($$...$$)
 *  - Syntax-highlighted fenced code blocks (dark theme, glass style)
 *  - Bold, italic, lists, headings — all tuned for the glass-morphism dark UI
 *
 * Props:
 *  children  — markdown string
 *  size      — "sm" | "md" (default "md")  controls base text size
 */

import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import 'katex/dist/katex.min.css'

// ── Code block glass theme ─────────────────────────────────────────────────────

const CODE_CONTAINER = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: '10px',
  padding: '12px 14px',
  margin: '6px 0',
  fontSize: '0.79em',
  lineHeight: '1.6',
}

// ── Component map factory ─────────────────────────────────────────────────────

function makeComponents(size) {
  const base = size === 'sm' ? 'text-xs' : 'text-sm'
  const text = size === 'sm' ? 'text-white/75' : 'text-white/80'

  return {
    // Paragraphs
    p: ({ children }) => (
      <p className={`${base} ${text} leading-relaxed mb-2 last:mb-0`}>{children}</p>
    ),

    // Inline formatting
    strong: ({ children }) => (
      <strong className="font-semibold text-white">{children}</strong>
    ),
    em: ({ children }) => (
      <em className="text-indigo-200/90" style={{ fontStyle: 'italic' }}>{children}</em>
    ),

    // Code — block and inline
    // react-markdown v10: pre wraps block code; inline code has no parent pre
    pre: ({ children }) => <>{children}</>,
    code({ className, children }) {
      const lang = /language-(\w+)/.exec(className || '')?.[1]
      if (lang) {
        return (
          <SyntaxHighlighter
            style={vscDarkPlus}
            language={lang}
            PreTag="div"
            customStyle={CODE_CONTAINER}
            codeTagProps={{ style: { background: 'transparent', padding: 0, fontSize: 'inherit' } }}
          >
            {String(children).replace(/\n$/, '')}
          </SyntaxHighlighter>
        )
      }
      // Unlabelled fenced block (```...```) or inline code
      const isBlock = String(children).includes('\n')
      if (isBlock) {
        return (
          <div style={CODE_CONTAINER}>
            <code
              className="font-mono text-slate-300"
              style={{ fontSize: '0.79em', lineHeight: '1.6', whiteSpace: 'pre' }}
            >
              {children}
            </code>
          </div>
        )
      }
      return (
        <code
          className="px-1.5 py-0.5 rounded-md font-mono text-indigo-300"
          style={{ background: 'rgba(99,102,241,0.15)', fontSize: '0.85em' }}
        >
          {children}
        </code>
      )
    },

    // Lists
    ul: ({ children }) => (
      <ul className={`my-1.5 space-y-0.5 pl-4 ${base} ${text}`}>{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className={`my-1.5 space-y-0.5 pl-4 list-decimal ${base} ${text}`}>{children}</ol>
    ),
    li: ({ children }) => (
      <li className="leading-relaxed list-disc marker:text-indigo-400/70">{children}</li>
    ),

    // Headings (rare in tutor responses, but handle gracefully)
    h1: ({ children }) => (
      <p className="text-base font-semibold text-white mt-3 mb-1.5">{children}</p>
    ),
    h2: ({ children }) => (
      <p className="text-sm font-semibold text-white mt-2.5 mb-1">{children}</p>
    ),
    h3: ({ children }) => (
      <p className={`font-semibold text-slate-200 mt-2 mb-0.5 ${base}`}>{children}</p>
    ),

    // Blockquote
    blockquote: ({ children }) => (
      <blockquote
        className={`my-2 pl-3 border-l-2 border-indigo-500/50 ${base} text-white/60`}
        style={{ fontStyle: 'italic' }}
      >
        {children}
      </blockquote>
    ),

    // Divider
    hr: () => <hr className="my-3 border-white/[0.08]" />,

    // Table (occasional in structured answers)
    table: ({ children }) => (
      <div className="my-2 overflow-x-auto">
        <table className={`${base} w-full border-collapse`}>{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="border-b border-white/10">{children}</thead>,
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => <tr className="border-b border-white/[0.06]">{children}</tr>,
    th: ({ children }) => (
      <th className="px-3 py-1.5 text-left text-xs font-semibold text-slate-300">{children}</th>
    ),
    td: ({ children }) => (
      <td className="px-3 py-1.5 text-left text-white/70">{children}</td>
    ),
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

export default function MarkdownRenderer({ children, size = 'md' }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={makeComponents(size)}
    >
      {children ?? ''}
    </ReactMarkdown>
  )
}
