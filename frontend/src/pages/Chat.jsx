import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client'

// ── Markdown component list for assistant bubbles ─────────────────────────────
// Tailored to match the glass-morphism theme.

const MD_COMPONENTS = {
  // Paragraphs: tight spacing, no trailing margin on last child
  p: ({ children }) => (
    <p className="text-sm text-white/80 leading-relaxed mb-2 last:mb-0">{children}</p>
  ),
  // Bold: white, not just slightly lighter
  strong: ({ children }) => (
    <strong className="font-semibold text-white">{children}</strong>
  ),
  // Italics: indigo tint for emphasis
  em: ({ children }) => (
    <em className="italic text-indigo-200/90 not-italic" style={{ fontStyle: 'italic' }}>{children}</em>
  ),
  // Inline code
  code: ({ inline, children }) =>
    inline ? (
      <code className="px-1.5 py-0.5 rounded-md text-[0.8em] font-mono text-indigo-300"
            style={{ background: 'rgba(99,102,241,0.15)' }}>
        {children}
      </code>
    ) : (
      <code>{children}</code>
    ),
  // Code blocks
  pre: ({ children }) => (
    <pre className="my-2 px-3 py-2.5 rounded-xl text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed"
         style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
      {children}
    </pre>
  ),
  // Unordered lists
  ul: ({ children }) => (
    <ul className="my-1.5 space-y-1 pl-4">{children}</ul>
  ),
  // Ordered lists
  ol: ({ children }) => (
    <ol className="my-1.5 space-y-1 pl-4 list-decimal">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-sm text-white/80 leading-relaxed list-disc marker:text-indigo-400">{children}</li>
  ),
  // Blockquotes
  blockquote: ({ children }) => (
    <blockquote className="my-2 pl-3 border-l-2 border-indigo-500/50 text-white/60 italic">
      {children}
    </blockquote>
  ),
  // Headings (rare in chat, but handle gracefully)
  h1: ({ children }) => <p className="text-base font-semibold text-white mb-1">{children}</p>,
  h2: ({ children }) => <p className="text-sm font-semibold text-white mb-1">{children}</p>,
  h3: ({ children }) => <p className="text-sm font-medium text-slate-200 mb-1">{children}</p>,
  // Horizontal rule
  hr: () => <hr className="my-3 border-white/10" />,
}

// ── Typing indicator ──────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 max-w-[75%]">
      <Avatar role="assistant" />
      <div
        className="px-4 py-3 rounded-2xl rounded-bl-sm border border-white/[0.07]"
        style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)' }}
      >
        <div className="flex items-center gap-1 h-4">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-indigo-400/60"
              style={{
                animation: 'bounce 1.2s ease-in-out infinite',
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ role }) {
  if (role === 'assistant') {
    return (
      <div
        className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center self-end mb-0.5"
        style={{
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
          boxShadow: '0 2px 10px rgba(99,102,241,0.35)',
        }}
      >
        <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path d="M8 2a5.5 5.5 0 100 11A5.5 5.5 0 008 2z" />
          <path d="M8 5v3l1.8 1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )
  }
  return (
    <div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center self-end mb-0.5 bg-white/10 border border-white/10">
      <svg className="w-3.5 h-3.5 text-white/50" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 8a3 3 0 100-6 3 3 0 000 6zm-5 6a5 5 0 0110 0H3z" />
      </svg>
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex items-end justify-end gap-2">
        <div
          className="max-w-[75%] px-4 py-3 rounded-2xl rounded-br-sm text-sm text-white leading-relaxed"
          style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,0.75) 0%, rgba(139,92,246,0.75) 100%)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(139,92,246,0.3)',
            boxShadow: '0 4px 20px rgba(99,102,241,0.2)',
          }}
        >
          {message.content}
        </div>
        <Avatar role="user" />
      </div>
    )
  }

  return (
    <div className="flex items-end gap-2 max-w-[75%]">
      <Avatar role="assistant" />
      <div
        className={`px-4 py-3 rounded-2xl rounded-bl-sm border ${
          message.error
            ? 'border-red-500/20 bg-red-500/5 text-sm text-red-400'
            : 'border-white/[0.07]'
        }`}
        style={
          message.error
            ? undefined
            : { background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)' }
        }
      >
        {message.error
          ? message.content
          : <ReactMarkdown components={MD_COMPONENTS}>{message.content}</ReactMarkdown>
        }
      </div>
    </div>
  )
}

// ── Welcome message ───────────────────────────────────────────────────────────

function WelcomeMessage() {
  return (
    <div className="flex items-end gap-2 max-w-[75%]">
      <Avatar role="assistant" />
      <div
        className="px-4 py-3 rounded-2xl rounded-bl-sm text-sm text-slate-200 leading-relaxed border border-white/[0.07]"
        style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)' }}
      >
        <p>
          I&apos;m <span className="text-indigo-300 font-semibold">Master Teacher</span>, your personal AI tutor.
          I know what you&apos;re studying and where you need help.
        </p>
        <p className="mt-1.5 text-slate-400">Ask me anything.</p>
      </div>
    </div>
  )
}

// ── Send icon ─────────────────────────────────────────────────────────────────

function SendIcon({ disabled }) {
  return (
    <svg
      className={`w-4 h-4 transition-opacity ${disabled ? 'opacity-40' : 'opacity-100'}`}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2L2 7l5 2 2 5 5-12z" />
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Chat() {
  const [searchParams] = useSearchParams()
  const questionId = searchParams.get('question_id') ? Number(searchParams.get('question_id')) : null
  const autoQuestion = searchParams.get('q')

  const [messages, setMessages] = useState([])
  const [sessionId, setSessionId] = useState(null)
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)

  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const sessionIdRef = useRef(null)   // avoids stale closure in auto-send
  const didAutoSend = useRef(false)

  // Auto-scroll whenever messages or typing state changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // Auto-send when arriving from "Ask Tutor About This"
  useEffect(() => {
    if (questionId && autoQuestion && !didAutoSend.current) {
      didAutoSend.current = true
      const msg = `I got this question wrong — can you help me understand it?\n\n"${autoQuestion}"`
      doSend(msg)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function doSend(text) {
    if (!text.trim() || isTyping) return

    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setInput('')
    setIsTyping(true)

    try {
      const res = await api.chatSend({
        message: text,
        session_id: sessionIdRef.current ?? undefined,
        question_id: questionId ?? undefined,
      })
      sessionIdRef.current = res.session_id
      setSessionId(res.session_id)
      setMessages((prev) => [...prev, { role: 'assistant', content: res.response }])
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Couldn't reach the AI tutor: ${e.message}`, error: true },
      ])
    } finally {
      setIsTyping(false)
      // Re-focus input after response
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      doSend(input)
    }
  }

  const showWelcome = messages.length === 0 && !isTyping

  return (
    <>
      {/* Bounce keyframes injected via a style tag */}
      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.6; }
          30%            { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>

      <div className="flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>

        {/* ── Header strip ─────────────────────────────────────────────────── */}
        <div
          className="flex-shrink-0 flex items-center gap-3 px-6 py-3 border-b border-white/[0.06]"
          style={{ background: 'rgba(255,255,255,0.02)' }}
        >
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', boxShadow: '0 2px 8px rgba(99,102,241,0.3)' }}
          >
            <svg className="w-3 h-3 text-white" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 2a5.5 5.5 0 100 11A5.5 5.5 0 008 2z" />
              <path d="M8 5v3l1.8 1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-200 leading-none">Master Teacher</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {questionId ? 'Discussing a quiz question' : 'Personal AI tutor'}
            </p>
          </div>
          {sessionId && (
            <span className="ml-auto text-[10px] text-slate-700 font-mono truncate max-w-[120px]">
              {sessionId.slice(0, 8)}…
            </span>
          )}
        </div>

        {/* ── Messages area ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-2xl mx-auto space-y-4">
            {showWelcome && <WelcomeMessage />}

            {messages.map((msg, i) => (
              <MessageBubble key={i} message={msg} />
            ))}

            {isTyping && <TypingIndicator />}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* ── Input bar ────────────────────────────────────────────────────── */}
        <div
          className="flex-shrink-0 border-t border-white/[0.06] px-4 py-4"
          style={{ background: 'rgba(10,10,26,0.6)', backdropFilter: 'blur(24px)' }}
        >
          <div className="max-w-2xl mx-auto flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                rows={1}
                className="w-full resize-none rounded-2xl px-4 py-3 text-sm text-white/85
                           placeholder-white/25 border border-white/[0.08]
                           focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20
                           transition-all duration-200 leading-relaxed"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  backdropFilter: 'blur(12px)',
                  maxHeight: '140px',
                  overflowY: 'auto',
                  scrollbarWidth: 'none',
                }}
                placeholder="Ask Master Teacher anything…"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  // auto-grow
                  e.target.style.height = 'auto'
                  e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'
                }}
                onKeyDown={handleKeyDown}
                disabled={isTyping}
              />
            </div>

            <button
              onClick={() => doSend(input)}
              disabled={!input.trim() || isTyping}
              className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center
                         text-white transition-all duration-200
                         disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                boxShadow: '0 4px 20px rgba(99,102,241,0.3)',
              }}
              aria-label="Send message"
            >
              <SendIcon disabled={!input.trim() || isTyping} />
            </button>
          </div>

          <p className="max-w-2xl mx-auto text-[10px] text-white/15 mt-2 px-1">
            Shift+Enter for new line · Enter to send
          </p>
        </div>
      </div>
    </>
  )
}
