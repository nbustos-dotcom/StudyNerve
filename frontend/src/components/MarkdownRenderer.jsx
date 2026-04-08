/**
 * MarkdownRenderer — shared component for all AI response surfaces.
 *
 * Features:
 *  - KaTeX math: inline ($...$) and block ($$...$$)
 *  - Mermaid diagrams (```mermaid blocks) with dark glass theme
 *  - Syntax-highlighted fenced code blocks (dark theme, glass style)
 *  - Bold, italic, lists, headings — all tuned for the glass-morphism dark UI
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

// ── Mermaid — initialize once with app dark theme ─────────────────────────────

mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    // Backgrounds
    background: '#1a1a2e',
    primaryColor: '#2a2a4a',
    secondaryColor: '#252540',
    tertiaryColor: '#20203a',
    // Node borders & text
    primaryBorderColor: 'rgba(99,102,241,0.6)',
    primaryTextColor: '#ffffff',
    nodeTextColor: '#ffffff',
    labelTextColor: '#ffffff',
    // Edges
    lineColor: '#9ca3af',
    edgeLabelBackground: '#1a1a2e',
    // Clusters / subgraphs
    clusterBkg: '#1f1f38',
    clusterBorder: 'rgba(99,102,241,0.3)',
    // Misc
    titleColor: '#c7d2fe',
    nodeBorder: 'rgba(99,102,241,0.6)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '14px',
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

function applySvgStyles(svgEl) {
  if (!svgEl) return
  svgEl.style.minWidth = '100%'
  svgEl.style.width = '100%'
  svgEl.style.height = 'auto'
  svgEl.style.fontSize = '14px'
  svgEl.removeAttribute('width')
  svgEl.removeAttribute('height')
}

function MermaidBlock({ code }) {
  const containerRef = useRef(null)
  const modalContainerRef = useRef(null)
  // Stable per-instance IDs — mermaid requires unique IDs with no colons
  const inlineIdRef = useRef(`md${Math.random().toString(36).slice(2)}`)
  const modalIdRef = useRef(`mdm${Math.random().toString(36).slice(2)}`)
  const [error, setError] = useState(false)
  const [svgContent, setSvgContent] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    setError(false)
    mermaid.render(inlineIdRef.current, code.trim())
      .then(({ svg }) => {
        setSvgContent(svg)
      })
      .catch(() => setError(true))
  }, [code])

  // Inject SVG into the inline container and size it
  useEffect(() => {
    if (!svgContent || !containerRef.current) return
    containerRef.current.innerHTML = svgContent
    applySvgStyles(containerRef.current.querySelector('svg'))
  }, [svgContent])

  // Inject a fresh SVG into the modal container when it opens
  useEffect(() => {
    if (!modalOpen || !svgContent) return
    // Re-render with a different ID so mermaid doesn't deduplicate
    mermaid.render(modalIdRef.current, code.trim())
      .then(({ svg }) => {
        if (modalContainerRef.current) {
          modalContainerRef.current.innerHTML = svg
          const svgEl = modalContainerRef.current.querySelector('svg')
          if (svgEl) {
            svgEl.style.width = '100%'
            svgEl.style.height = 'auto'
            svgEl.style.maxWidth = '900px'
            svgEl.style.fontSize = '16px'
            svgEl.removeAttribute('width')
            svgEl.removeAttribute('height')
          }
        }
      })
      .catch(() => {})
  }, [modalOpen, svgContent, code])

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
    <>
      {/* ── Inline diagram container ──────────────────────────────────────── */}
      <div
        style={{
          background: '#1a1a2e',
          border: '1px solid rgba(99,102,241,0.25)',
          borderRadius: '10px',
          margin: '8px 0',
          overflow: 'hidden',
          boxShadow: '0 2px 16px rgba(0,0,0,0.3)',
        }}
      >
        {/* Diagram scroll area */}
        <div
          ref={containerRef}
          style={{
            padding: '16px',
            minHeight: '200px',
            overflowX: 'auto',
            overflowY: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        />

        {/* Toolbar */}
        {svgContent && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              padding: '6px 10px',
              borderTop: '1px solid rgba(255,255,255,0.05)',
              background: 'rgba(0,0,0,0.2)',
            }}
          >
            <button
              onClick={() => setModalOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                color: 'rgba(165,180,252,0.8)',
                background: 'rgba(99,102,241,0.1)',
                border: '1px solid rgba(99,102,241,0.2)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(99,102,241,0.2)'
                e.currentTarget.style.color = '#a5b4fc'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(99,102,241,0.1)'
                e.currentTarget.style.color = 'rgba(165,180,252,0.8)'
              }}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M5 1H1v4M11 1h4v4M5 15H1v-4M11 15h4v-4" />
              </svg>
              Expand
            </button>
          </div>
        )}
      </div>

      {/* ── Full-screen modal ─────────────────────────────────────────────── */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(8px)',
            padding: '24px',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false) }}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '960px',
              maxHeight: '85vh',
              borderRadius: '16px',
              background: '#1a1a2e',
              border: '1px solid rgba(99,102,241,0.3)',
              boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Modal header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: '12px', color: 'rgba(165,180,252,0.6)', letterSpacing: '0.05em' }}>
                DIAGRAM
              </span>
              <button
                onClick={() => setModalOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  color: 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                  fontSize: '16px',
                  lineHeight: 1,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                aria-label="Close diagram"
              >
                ×
              </button>
            </div>

            {/* Modal diagram area */}
            <div
              ref={modalContainerRef}
              style={{
                flex: 1,
                padding: '24px',
                overflowX: 'auto',
                overflowY: 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            />
          </div>
        </div>
      )}
    </>
  )
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

      // Mermaid diagrams get their own renderer
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
