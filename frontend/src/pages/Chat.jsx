import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import MarkdownRenderer from '../components/MarkdownRenderer'
import NeuralNetIcon from '../components/NeuralNetIcon'

// ── Relative time helper ──────────────────────────────────────────────────────

function formatRelativeTime(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  const diffMs = Date.now() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

// ── Typing indicator ──────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="border-t border-white/[0.05] py-5">
      <div className="flex items-center gap-2 mb-3">
        <NeuralNetIcon size={14} idPrefix="typing-indicator" />
        <span className="text-[11px] font-medium text-indigo-300/60">StudyNerve AI</span>
      </div>
      <div className="flex items-center gap-1 h-4">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-indigo-400/50"
            style={{
              animation: 'bounce 1.2s ease-in-out infinite',
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }) {
  const isUser = message.role === 'user'
  const iconIdRef = useRef(`msg-${Math.random().toString(36).slice(2)}`)
  const [animate, setAnimate] = useState(!isUser)

  useEffect(() => {
    if (!animate) return
    const t = setTimeout(() => setAnimate(false), 950)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="border-t border-white/[0.05] py-5">
      <div className="flex items-center gap-2 mb-3">
        {isUser ? (
          <span className="text-[11px] font-medium text-white/35">You</span>
        ) : (
          <>
            <NeuralNetIcon size={14} idPrefix={iconIdRef.current} />
            <span className="text-[11px] font-medium text-indigo-300/60">StudyNerve AI</span>
          </>
        )}
      </div>
      {message.error ? (
        <p className="text-sm text-red-400">{message.content}</p>
      ) : isUser ? (
        <p className="text-sm text-white/85 leading-relaxed whitespace-pre-wrap">{message.content}</p>
      ) : (
        <div className={animate ? 'ai-message-animate' : ''}>
          <MarkdownRenderer>{message.content}</MarkdownRenderer>
        </div>
      )}
    </div>
  )
}

// ── Welcome message ───────────────────────────────────────────────────────────

function WelcomeMessage() {
  return (
    <div className="py-5">
      <div className="flex items-center gap-2 mb-3">
        <NeuralNetIcon size={14} idPrefix="welcome-msg" />
        <span className="text-[11px] font-medium text-indigo-300/60">StudyNerve AI</span>
      </div>
      <p className="text-sm text-white/80 leading-relaxed">
        I&apos;m <span className="text-indigo-300 font-semibold">StudyNerve AI</span>, your personal AI tutor.
        I know what you&apos;re studying and where you need help.
      </p>
      <p className="text-sm text-white/40 mt-1.5">Ask me anything.</p>
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

// ── Chat history sidebar ──────────────────────────────────────────────────────

function ChatSidebar({ sessions, activeSessionId, onSelectSession, onNewChat }) {
  return (
    <aside
      className="flex-shrink-0 flex flex-col border-r border-white/[0.06]"
      style={{
        width: 250,
        background: 'rgba(255,255,255,0.025)',
        backdropFilter: 'blur(16px)',
      }}
    >
      {/* New Chat button */}
      <div className="flex-shrink-0 p-3">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium
                     text-white/80 transition-all duration-200 hover:text-white
                     border border-white/[0.08] hover:border-indigo-500/40"
          style={{ background: 'rgba(255,255,255,0.04)' }}
        >
          <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M8 3v10M3 8h10" />
          </svg>
          New Chat
        </button>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5" style={{ scrollbarWidth: 'none' }}>
        {sessions.length === 0 ? (
          <p className="text-[11px] text-slate-600 text-center mt-6 px-4 leading-relaxed">
            Your conversations will appear here
          </p>
        ) : (
          sessions.map((session) => {
            const isActive = session.session_id === activeSessionId
            return (
              <button
                key={session.session_id}
                onClick={() => onSelectSession(session.session_id)}
                className="w-full text-left px-3 py-2.5 rounded-xl transition-all duration-150"
                style={
                  isActive
                    ? {
                        background: 'rgba(99,102,241,0.15)',
                        border: '1px solid rgba(99,102,241,0.25)',
                      }
                    : {
                        background: 'transparent',
                        border: '1px solid transparent',
                      }
                }
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent'
                }}
              >
                <p className={`text-xs leading-snug truncate ${isActive ? 'text-slate-200' : 'text-slate-400'}`}>
                  {session.preview}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] text-slate-600">
                    {formatRelativeTime(session.last_activity)}
                  </span>
                  <span className="text-[10px] text-slate-700">·</span>
                  <span className="text-[10px] text-slate-600">
                    {session.message_count} {session.message_count === 1 ? 'msg' : 'msgs'}
                  </span>
                </div>
              </button>
            )
          })
        )}
      </div>
    </aside>
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
  const [sessions, setSessions] = useState([])
  const [showSidebar, setShowSidebar] = useState(false)

  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const sessionIdRef = useRef(null)
  const didAutoSend = useRef(false)

  // Auto-scroll whenever messages or typing state changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // Fetch sessions list (used on mount and after each send)
  async function fetchSessions() {
    try {
      const data = await api.chatSessions()
      setSessions(data)
      return data
    } catch {
      return []
    }
  }

  // Load full history for a session, ending the current one first
  async function loadSession(sid) {
    if (sessionIdRef.current && sessionIdRef.current !== sid) {
      api.endChatSession(sessionIdRef.current).catch(() => {})
    }
    try {
      const history = await api.chatHistory(sid)
      setMessages(history.map((m) => ({ role: m.role, content: m.content })))
      sessionIdRef.current = sid
      setSessionId(sid)
    } catch {}
  }

  // Start a fresh session
  function startNewChat() {
    if (sessionIdRef.current) {
      api.endChatSession(sessionIdRef.current).catch(() => {})
    }
    setMessages([])
    sessionIdRef.current = null
    setSessionId(null)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  // On mount: fetch sessions and auto-load the most recent one
  // (skip if arriving from a quiz question — that starts a fresh session)
  useEffect(() => {
    async function init() {
      const data = await fetchSessions()
      if (!(questionId && autoQuestion) && data.length > 0) {
        const sid = data[0].session_id
        const history = await api.chatHistory(sid).catch(() => [])
        setMessages(history.map((m) => ({ role: m.role, content: m.content })))
        sessionIdRef.current = sid
        setSessionId(sid)
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Trigger insight generation when leaving the page
  useEffect(() => {
    return () => {
      if (sessionIdRef.current) {
        api.endChatSession(sessionIdRef.current).catch(() => {})
      }
    }
  }, [])

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
      fetchSessions() // refresh sidebar counts/previews
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Couldn't reach the AI tutor: ${e.message}`, error: true },
      ])
    } finally {
      setIsTyping(false)
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
      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.6; }
          30%            { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>

      <div className="flex" style={{ height: 'calc(100vh - 64px)' }}>

        {/* ── Desktop sidebar (always visible on md+) ───────────────────────── */}
        <div className="hidden md:flex">
          <ChatSidebar
            sessions={sessions}
            activeSessionId={sessionId}
            onSelectSession={loadSession}
            onNewChat={startNewChat}
          />
        </div>

        {/* ── Mobile sidebar overlay ────────────────────────────────────────── */}
        {showSidebar && (
          <>
            <div
              className="md:hidden fixed inset-0 z-40"
              style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
              onClick={() => setShowSidebar(false)}
            />
            <div className="md:hidden fixed top-16 left-0 bottom-0 z-50" style={{ width: 270 }}>
              <ChatSidebar
                sessions={sessions}
                activeSessionId={sessionId}
                onSelectSession={(sid) => { loadSession(sid); setShowSidebar(false) }}
                onNewChat={() => { startNewChat(); setShowSidebar(false) }}
              />
            </div>
          </>
        )}

        {/* ── Main chat area ────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Mobile-only sessions toggle — no branding, desktop shows nothing */}
          <div
            className="md:hidden flex-shrink-0 flex items-center px-4 py-2 border-b border-white/[0.06]"
            style={{ background: 'rgba(255,255,255,0.02)' }}
          >
            <button
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-white/50 hover:text-white/80 transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              onClick={() => setShowSidebar((v) => !v)}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M2 4h12M2 8h8M2 12h10" />
              </svg>
              Sessions
            </button>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <div className="max-w-2xl mx-auto">
              {showWelcome && <WelcomeMessage />}

              {messages.map((msg, i) => (
                <MessageBubble key={i} message={msg} />
              ))}

              {isTyping && <TypingIndicator />}

              <div ref={bottomRef} />
            </div>
          </div>

          {/* Input bar */}
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
                  placeholder="Ask StudyNerve AI anything…"
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value)
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
      </div>
    </>
  )
}
