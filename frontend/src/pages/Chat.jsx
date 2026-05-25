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
    <div className="border-t border-border-subtle py-5">
      <div className="flex items-center gap-2 mb-3">
        <NeuralNetIcon size={14} idPrefix="typing-indicator" />
        <span className="text-[11px] font-medium text-accent/60">StudyNerve AI</span>
      </div>
      <div className="flex items-center gap-1 h-4">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-accent-hover/50"
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

// ── Paperclip icon ────────────────────────────────────────────────────────────

function PaperclipIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 7.5l-6 6a4 4 0 0 1-5.66-5.66l6.5-6.5a2.5 2.5 0 0 1 3.54 3.54l-6.5 6.5a1 1 0 0 1-1.42-1.42l6-6" />
    </svg>
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
    <div className="border-t border-border-subtle py-5">
      <div className="flex items-center gap-2 mb-3">
        {isUser ? (
          <>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-ink-muted flex-shrink-0 bg-deep-elevated border border-border-subtle">
              U
            </div>
            <span className="text-[11px] font-medium text-white/35">You</span>
          </>
        ) : (
          <>
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
            >
              S
            </div>
            <span className="text-[11px] font-medium text-accent/60">StudyNerve AI</span>
            {message.providerUsed && !message.providerUsed.includes('(cached)') && (
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace' }}>
                ⚡ {message.providerUsed}
              </span>
            )}
          </>
        )}
      </div>
      {message.error ? (
        <p className="text-sm text-red-400">{message.content}</p>
      ) : isUser ? (
        <>
          {message.fileName && (
            <div className="mb-2">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] text-accent-hover/80"
                style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)' }}
              >
                <PaperclipIcon />
                {message.fileName}
              </span>
            </div>
          )}
          <p className="text-sm text-white/85 leading-relaxed whitespace-pre-wrap">{message.content}</p>
        </>
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
        <span className="text-[11px] font-medium text-accent/60">StudyNerve AI</span>
      </div>
      <p className="text-sm text-white/80 leading-relaxed">
        I&apos;m <span className="text-accent-hover font-semibold">StudyNerve AI</span>, your personal AI tutor.
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

// ── Trash icon ────────────────────────────────────────────────────────────────

function TrashIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4h12M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M6 7v5M10 7v5M3 4l1 9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-9" />
    </svg>
  )
}

// ── Chat history sidebar ──────────────────────────────────────────────────────

function ChatSidebar({ sessions, activeSessionId, onSelectSession, onNewChat, onDeleteSession }) {
  const [confirmId, setConfirmId] = useState(null)
  const [hoveredId, setHoveredId] = useState(null)

  function handleDeleteClick(e, sessionId) {
    e.stopPropagation()
    setConfirmId(sessionId)
  }

  function handleConfirm(e) {
    e.stopPropagation()
    onDeleteSession(confirmId)
    setConfirmId(null)
  }

  function handleCancel(e) {
    e.stopPropagation()
    setConfirmId(null)
  }

  return (
    <aside
      className="flex-shrink-0 flex flex-col border-r border-border-subtle"
      style={{ width: 256, background: '#111113' }}
    >
      {/* New Chat button */}
      <div className="flex-shrink-0 p-3">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
                     text-ink-secondary transition-colors duration-150 hover:text-ink-primary
                     border border-border-subtle hover:border-border-hover"
          style={{ background: 'transparent' }}
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
          <p className="text-[11px] text-ink-faint text-center mt-6 px-4 leading-relaxed">
            Your conversations will appear here
          </p>
        ) : (
          sessions.map((session) => {
            const isActive = session.session_id === activeSessionId
            const isConfirming = confirmId === session.session_id
            const isHovered = hoveredId === session.session_id

            return (
              <div
                key={session.session_id}
                className="relative group"
                onMouseEnter={() => setHoveredId(session.session_id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {isConfirming ? (
                  /* ── Inline confirmation ── */
                  <div
                    className="px-3 py-2.5 rounded-xl"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
                  >
                    <p className="text-[11px] text-red-300/90 leading-snug mb-2">
                      Delete this conversation?
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleConfirm}
                        className="text-[11px] font-medium text-red-300 hover:text-red-200 transition-colors px-2 py-0.5 rounded-md"
                        style={{ background: 'rgba(239,68,68,0.15)' }}
                      >
                        Yes, delete
                      </button>
                      <button
                        onClick={handleCancel}
                        className="text-[11px] text-ink-muted hover:text-ink-secondary transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Normal session row ── */
                  <button
                    onClick={() => onSelectSession(session.session_id)}
                    className="w-full text-left px-3 py-2.5 rounded-xl transition-all duration-150"
                    style={
                      isActive
                        ? {
                            background: 'rgba(99,102,241,0.1)',
                            borderLeft: '2px solid #6366f1',
                            borderTop: '1px solid rgba(99,102,241,0.15)',
                            borderRight: '1px solid rgba(99,102,241,0.15)',
                            borderBottom: '1px solid rgba(99,102,241,0.15)',
                          }
                        : {
                            background: isHovered ? 'rgba(255,255,255,0.03)' : 'transparent',
                            border: '1px solid transparent',
                          }
                    }
                  >
                    <p className={`text-sm font-medium leading-snug truncate pr-5 ${isActive ? 'text-ink-primary' : 'text-ink-secondary'}`}>
                      {session.preview}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] text-ink-faint">
                        {formatRelativeTime(session.last_activity)}
                      </span>
                      <span className="text-[10px] text-slate-700">·</span>
                      <span className="text-[10px] text-ink-faint">
                        {session.message_count} {session.message_count === 1 ? 'msg' : 'msgs'}
                      </span>
                    </div>
                  </button>
                )}

                {/* Trash button — visible on hover, hidden when confirming */}
                {!isConfirming && isHovered && (
                  <button
                    onClick={(e) => handleDeleteClick(e, session.session_id)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md
                               text-ink-faint hover:text-red-400 transition-colors"
                    style={{ background: 'rgba(0,0,0,0.3)' }}
                    aria-label="Delete conversation"
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}

// ── Study nudge (session-start personalized suggestion) ──────────────────────

function StudyNudge({ onDismiss, onSuggest }) {
  const [topGap, setTopGap] = useState(null)
  const [urgentDeadline, setUrgentDeadline] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    Promise.allSettled([
      api.getGaps(),
      api.canvasUpcoming(7),
    ]).then(([gapsRes, deadlineRes]) => {
      const gaps = gapsRes.status === 'fulfilled' ? (gapsRes.value ?? []) : []
      const upcoming = deadlineRes.status === 'fulfilled' ? (deadlineRes.value ?? []) : []
      setTopGap(gaps[0] ?? null)
      const soon = upcoming.find((a) => {
        if (!a.due_at) return false
        const diff = new Date(a.due_at) - Date.now()
        return diff > 0 && diff < 3 * 86400000
      })
      setUrgentDeadline(soon ?? null)
      setLoaded(true)
    })
  }, [])

  if (!loaded || (!topGap && !urgentDeadline)) return null

  const pct = topGap ? Math.round(topGap.accuracy * 100) : null
  const pctColor = pct < 40 ? 'text-red-400' : pct < 70 ? 'text-amber-400' : 'text-emerald-400'

  let suggestion = ''
  if (topGap && urgentDeadline) {
    suggestion = `Help me with ${topGap.topic_name} — it's my weakest area (${pct}%) and I have "${urgentDeadline.name}" due soon.`
  } else if (topGap) {
    suggestion = `Help me improve on ${topGap.topic_name} — that's my weakest area right now.`
  } else {
    suggestion = `I have "${urgentDeadline.name}" due soon — can you help me prepare?`
  }

  return (
    <div className="mb-5 rounded-lg px-4 py-3.5 flex gap-3 fade-in-up bg-accent/[0.07] border border-accent/20">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-accent/60 uppercase tracking-wider mb-2">Suggested Focus</p>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {topGap && (
            <span className="text-sm text-ink-secondary">
              Weakest topic: <span className={`font-semibold ${pctColor}`}>{topGap.topic_name}</span>
              <span className="text-ink-muted ml-1 text-xs">({pct}%)</span>
            </span>
          )}
          {urgentDeadline && (
            <span className="text-sm text-ink-secondary">
              Due soon: <span className="font-semibold text-amber-300">{urgentDeadline.name}</span>
            </span>
          )}
        </div>
        <button
          onClick={() => onSuggest(suggestion)}
          className="mt-2 text-xs text-accent hover:text-accent-hover transition-colors"
        >
          Start here →
        </button>
      </div>
      <button
        onClick={onDismiss}
        className="flex-shrink-0 text-white/20 hover:text-white/50 transition-colors text-lg leading-none mt-0.5"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
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
  const [attachedFile, setAttachedFile] = useState(null) // { file, name, previewUrl, isImage }
  const [tutorMode, setTutorMode] = useState(() => localStorage.getItem('tutor_mode') || 'explain')
  const [pendingQuestion, setPendingQuestion] = useState(null)
  const [nudgeDismissed, setNudgeDismissed] = useState(false)

  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
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
    setPendingQuestion(null)
    try {
      const history = await api.chatHistory(sid)
      setMessages(history.map((m) => ({ role: m.role, content: m.content, fileName: m.file_name ?? null })))
      sessionIdRef.current = sid
      setSessionId(sid)
    } catch {}
  }

  async function deleteSession(sid) {
    try {
      await api.deleteChatSession(sid)
    } catch {
      // best-effort — remove from UI regardless
    }
    setSessions((prev) => prev.filter((s) => s.session_id !== sid))
    if (sessionIdRef.current === sid) {
      sessionIdRef.current = null
      setSessionId(null)
      setMessages([])
    }
  }

  // Start a fresh session
  function startNewChat() {
    if (sessionIdRef.current) {
      api.endChatSession(sessionIdRef.current).catch(() => {})
    }
    setMessages([])
    sessionIdRef.current = null
    setSessionId(null)
    setPendingQuestion(null)
    setNudgeDismissed(false)
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
        setMessages(history.map((m) => ({ role: m.role, content: m.content, fileName: m.file_name ?? null })))
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

  async function doSend(text, fileOverride) {
    const sendFile = fileOverride ?? attachedFile
    if ((!text || !text.trim()) && !sendFile) return
    if (isTyping) return

    const fileName = sendFile?.name ?? null
    setMessages((prev) => [...prev, { role: 'user', content: text || '', fileName }])
    setInput('')
    setAttachedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setIsTyping(true)

    const priorPending = pendingQuestion
    setPendingQuestion(null)
    try {
      const res = await api.chatSend({
        message: text || '',
        session_id: sessionIdRef.current ?? undefined,
        question_id: questionId ?? undefined,
        file: sendFile?.file ?? undefined,
        mode: tutorMode,
        pending_question: priorPending ?? undefined,
      })
      sessionIdRef.current = res.session_id
      setSessionId(res.session_id)
      setMessages((prev) => [...prev, { role: 'assistant', content: res.response, providerUsed: res.provider_used }])
      setPendingQuestion(extractPendingQuestion(res.response))
      fetchSessions()
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

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'That file is over 5 MB — please attach a smaller file.', error: true },
      ])
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    const isImage = file.type.startsWith('image/')
    const previewUrl = isImage ? URL.createObjectURL(file) : null
    setAttachedFile({ file, name: file.name, previewUrl, isImage })
  }

  function removeAttachedFile() {
    if (attachedFile?.previewUrl) URL.revokeObjectURL(attachedFile.previewUrl)
    setAttachedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      doSend(input)
    }
  }

  function changeTutorMode(m) {
    setTutorMode(m)
    localStorage.setItem('tutor_mode', m)
  }

  function extractPendingQuestion(text) {
    if (!text) return null
    const clean = text.replace(/\n+/g, ' ')
    const matches = clean.match(/[^.!?]*\?/g)
    if (!matches || matches.length === 0) return null
    return matches[matches.length - 1].trim()
  }

  const canSend = (input.trim().length > 0 || attachedFile != null) && !isTyping
  const showWelcome = messages.length === 0 && !isTyping

  return (
    <>
      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.6; }
          30%            { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>

      <div className="flex fade-in-up" style={{ height: 'calc(100vh - 64px)' }}>

        {/* ── Desktop sidebar (always visible on md+) ───────────────────────── */}
        <div className="hidden md:flex">
          <ChatSidebar
            sessions={sessions}
            activeSessionId={sessionId}
            onSelectSession={loadSession}
            onNewChat={startNewChat}
            onDeleteSession={deleteSession}
          />
        </div>

        {/* ── Mobile sidebar overlay ────────────────────────────────────────── */}
        {showSidebar && (
          <>
            <div
              className="md:hidden fixed inset-0 z-40"
              style={{ background: 'rgba(0,0,0,0.5)' }}
              onClick={() => setShowSidebar(false)}
            />
            <div className="md:hidden fixed top-16 left-0 bottom-0 z-50" style={{ width: 256 }}>
              <ChatSidebar
                sessions={sessions}
                activeSessionId={sessionId}
                onSelectSession={(sid) => { loadSession(sid); setShowSidebar(false) }}
                onNewChat={() => { startNewChat(); setShowSidebar(false) }}
                onDeleteSession={deleteSession}
              />
            </div>
          </>
        )}

        {/* ── Main chat area ────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Desktop mode indicator */}
          <div className="hidden md:flex flex-shrink-0 items-center px-4 py-3 border-b border-border-subtle">
            <div className="w-2 h-2 rounded-full bg-accent flex-shrink-0 mr-2" />
            <span className="text-xs font-medium text-ink-muted capitalize">{tutorMode} mode</span>
          </div>

          {/* Mobile-only sessions toggle — no branding, desktop shows nothing */}
          <div className="md:hidden flex-shrink-0 flex items-center px-4 py-2 border-b border-border-subtle">
            <button
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-ink-muted hover:text-ink-primary transition-colors border border-border-subtle"
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
              {showWelcome && (
                <>
                  {!nudgeDismissed && (
                    <StudyNudge
                      onDismiss={() => setNudgeDismissed(true)}
                      onSuggest={(text) => {
                        setInput(text)
                        setTimeout(() => inputRef.current?.focus(), 50)
                      }}
                    />
                  )}
                  <WelcomeMessage />
                </>
              )}

              {messages.map((msg, i) => (
                <MessageBubble key={i} message={msg} />
              ))}

              {isTyping && <TypingIndicator />}

              <div ref={bottomRef} />
            </div>
          </div>

          {/* Input bar */}
          <div
            className="flex-shrink-0 border-t border-border-subtle px-4 py-4"
            style={{ background: '#111113' }}
          >
            <div className="max-w-2xl mx-auto">

              {/* Mode toggle */}
              <div className="flex items-center gap-1 mb-2">
                {[
                  { id: 'explain',  label: 'Explain',  tip: 'Get clear, direct explanations' },
                  { id: 'socratic', label: 'Socratic', tip: 'Guided questions to help you discover the answer yourself' },
                  { id: 'practice', label: 'Practice', tip: 'Explanations followed by a practice problem to try' },
                ].map(({ id, label, tip }) => (
                  <div key={id} className="relative group">
                    <button
                      onClick={() => changeTutorMode(id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 ${
                        tutorMode === id
                          ? 'bg-accent-muted border-accent/35 text-indigo-200'
                          : 'border-border-subtle text-ink-muted hover:text-ink-primary hover:border-border-hover'
                      }`}
                    >
                      {label}
                    </button>
                    <div
                      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg text-[11px] text-white/75 whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 z-10 bg-deep-elevated border border-border-subtle"
                      style={{
                        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                        transition: 'opacity 150ms ease',
                      }}
                    >
                      {tip}
                    </div>
                  </div>
                ))}
              </div>

              {/* File preview chip */}
              {attachedFile && (
                <div className="mb-2 flex items-center gap-2">
                  {attachedFile.isImage && attachedFile.previewUrl ? (
                    <img
                      src={attachedFile.previewUrl}
                      alt="preview"
                      className="h-10 w-10 object-cover rounded-lg flex-shrink-0"
                      style={{ border: '1px solid rgba(99,102,241,0.3)' }}
                    />
                  ) : null}
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] text-accent-hover/80 truncate max-w-[280px]"
                    style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)' }}
                  >
                    <PaperclipIcon />
                    {attachedFile.name}
                  </span>
                  <button
                    onClick={removeAttachedFile}
                    className="text-white/30 hover:text-white/70 transition-colors text-base leading-none ml-auto"
                    aria-label="Remove file"
                  >
                    ×
                  </button>
                </div>
              )}

              <div className="flex items-end gap-2.5">
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={handleFileChange}
                />

                {/* Paperclip button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isTyping}
                  title="Attach a file (PDF, TXT, or image)"
                  className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center
                             text-ink-muted hover:text-accent transition-colors duration-150
                             disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                  aria-label="Attach file"
                >
                  <PaperclipIcon />
                </button>

                <div className="flex-1 flex items-end gap-2 bg-deep-elevated border border-border-subtle rounded-lg px-3.5 py-2 focus-within:border-accent/40 transition-colors">
                  <textarea
                    ref={inputRef}
                    rows={1}
                    className="flex-1 resize-none text-sm text-ink-primary placeholder-ink-faint bg-transparent focus:outline-none leading-relaxed"
                    style={{
                      maxHeight: '140px',
                      overflowY: 'auto',
                      scrollbarWidth: 'none',
                    }}
                    placeholder={attachedFile ? 'Add a message about the file…' : 'Ask StudyNerve AI anything…'}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value)
                      e.target.style.height = 'auto'
                      e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'
                    }}
                    onKeyDown={handleKeyDown}
                    disabled={isTyping}
                  />
                  <button
                    onClick={() => doSend(input)}
                    disabled={!canSend}
                    className={`flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center transition-all duration-150 disabled:cursor-not-allowed ${
                      canSend ? 'bg-accent hover:bg-indigo-400 text-white' : 'bg-deep-surface text-ink-faint'
                    }`}
                    aria-label="Send message"
                  >
                    <SendIcon disabled={!canSend} />
                  </button>
                </div>
              </div>
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
