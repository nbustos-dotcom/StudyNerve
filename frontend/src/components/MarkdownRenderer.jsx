/**
 * MarkdownRenderer — shared component for all AI response surfaces.
 *
 * Features:
 *  - KaTeX math: inline ($...$) and block ($$...$$)
 *  - Mermaid diagrams (```mermaid blocks) rendered once at natural size
 *  - Syntax-highlighted fenced code blocks (dark theme, glass style)
 *  - Bold, italic, lists, headings — tuned for the glass-morphism dark UI
 *
 * Props:
 *  children  — markdown string
 *  size      — "sm" | "md" (default "md")  controls base text size
 */

import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import mermaid from 'mermaid'
import 'katex/dist/katex.min.css'

// ── Mermaid — initialize once ─────────────────────────────────────────────────

mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    primaryColor: '#1e1e3a',
    primaryTextColor: '#ffffff',
    primaryBorderColor: '#6366f1',
    lineColor: '#4a4a6a',
    secondaryColor: '#1a1a2e',
    tertiaryColor: '#12122a',
    fontSize: '16px',
    nodeBorder: '#6366f1',
    nodeTextColor: '#ffffff',
    edgeLabelBackground: 'transparent',
    // Additional vars to keep everything consistent
    background: '#0d0d1a',
    clusterBkg: '#1a1a2e',
    clusterBorder: '#6366f1',
    titleColor: '#c7d2fe',
    labelTextColor: '#ffffff',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  securityLevel: 'loose',
})

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

// ── Mermaid diagram block ─────────────────────────────────────────────────────
//
// Render strategy:
//   - renderedRef guards against re-running mermaid on React re-renders.
//     Once the SVG is injected, subsequent parent state updates (e.g. new
//     chat messages arriving) do not re-trigger mermaid, preventing the
//     DOM mutation that causes the scroll-position jump.
//   - The container has a fixed minHeight while loading so the layout is
//     stable and nothing jumps when the SVG appears.
//   - SVG renders at its NATURAL size. No maxWidth or width scaling.
//     If the diagram is wider than the viewport it scrolls horizontally.

function MermaidBlock({ code }) {
  const containerRef = useRef(null)
  const idRef = useRef(`md${Math.random().toString(36).slice(2)}`)
  const renderedRef = useRef(false)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Guard: only run mermaid.render once per component instance
    if (renderedRef.current || !containerRef.current) return
    renderedRef.current = true

    mermaid.render(idRef.current, code.trim())
      .then(({ svg }) => {
        if (!containerRef.current) return
        containerRef.current.innerHTML = svg
        const svgEl = containerRef.current.querySelector('svg')
        if (svgEl) {
          // Remove hardcoded dimensions so the SVG is its natural size
          svgEl.removeAttribute('width')
          svgEl.removeAttribute('height')
          svgEl.style.display = 'block'
          svgEl.style.maxWidth = 'none'
        }
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [code]) // code never changes for a given message; dep listed to satisfy linter

  if (error) {
    return (
      <div style={CODE_CONTAINER}>
        <code
          className="font-mono text-slate-300"
          style={{ fontSize: '0.79em', lineHeight: '1.6', whiteSpace: 'pre', display: 'block' }}
        >
          {code}
        </code>
      </div>
    )
  }

  return (
    <div
      style={{
        background: '#0d0d1a',
        border: '1px solid rgba(99,102,241,0.3)',
        borderRadius: '12px',
        padding: '24px',
        marginTop: '16px',
        marginBottom: '16px',
        overflowX: 'auto',
        // Reserve space while loading to prevent layout shift
        minHeight: loading ? '120px' : undefined,
        display: loading ? 'flex' : 'block',
        alignItems: loading ? 'center' : undefined,
        justifyContent: loading ? 'center' : undefined,
      }}
    >
      {loading && (
        <svg className="animate-spin w-5 h-5 text-indigo-400/40" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      <div ref={containerRef} />
    </div>
  )
}

// ── Component map factory ─────────────────────────────────────────────────────

function makeComponents(size) {
  const base = size === 'sm' ? 'text-xs' : 'text-sm'
  const text = size === 'sm' ? 'text-white/75' : 'text-white/80'

  return {
    p: ({ children }) => (
      <p className={`${base} ${text} leading-relaxed mb-2 last:mb-0`}>{children}</p>
    ),

    strong: ({ children }) => (
      <strong className="font-semibold text-white">{children}</strong>
    ),
    em: ({ children }) => (
      <em className="text-indigo-200/90" style={{ fontStyle: 'italic' }}>{children}</em>
    ),

    // react-markdown v10: pre wraps block code; inline code has no parent pre
    pre: ({ children }) => <>{children}</>,
    code({ className, children }) {
      const lang = /language-(\w+)/.exec(className || '')?.[1]

      if (lang === 'mermaid') {
        return <MermaidBlock code={String(children).replace(/\n$/, '')} />
      }

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

    ul: ({ children }) => (
      <ul className={`my-1.5 space-y-0.5 pl-4 ${base} ${text}`}>{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className={`my-1.5 space-y-0.5 pl-4 list-decimal ${base} ${text}`}>{children}</ol>
    ),
    li: ({ children }) => (
      <li className="leading-relaxed list-disc marker:text-indigo-400/70">{children}</li>
    ),

    h1: ({ children }) => (
      <p className="text-base font-semibold text-white mt-3 mb-1.5">{children}</p>
    ),
    h2: ({ children }) => (
      <p className="text-sm font-semibold text-white mt-2.5 mb-1">{children}</p>
    ),
    h3: ({ children }) => (
      <p className={`font-semibold text-slate-200 mt-2 mb-0.5 ${base}`}>{children}</p>
    ),

    blockquote: ({ children }) => (
      <blockquote
        className={`my-2 pl-3 border-l-2 border-indigo-500/50 ${base} text-white/60`}
        style={{ fontStyle: 'italic' }}
      >
        {children}
      </blockquote>
    ),

    hr: () => <hr className="my-3 border-white/[0.08]" />,

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
