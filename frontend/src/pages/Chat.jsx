import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import MarkdownRenderer from '../components/MarkdownRenderer'

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

// Bucket sessions by Today / Yesterday / Earlier off last_activity.
function groupSessionsByDate(sessions) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86400000
  const groups = { today: [], yesterday: [], earlier: [] }
  for (const s of sessions) {
    const t = new Date(s.last_activity).getTime()
    if (Number.isNaN(t)) { groups.earlier.push(s); continue }
    if (t >= todayStart) groups.today.push(s)
    else if (t >= yesterdayStart) groups.yesterday.push(s)
    else groups.earlier.push(s)
  }
  return groups
}

// Split the session preview into a short title + remaining snippet.
function splitPreview(preview) {
  if (!preview) return { title: 'New conversation', snippet: '' }
  const clean = preview.replace(/\s+/g, ' ').trim()
  const sentenceMatch = clean.match(/^[^.!?\n]{1,48}[.!?]?/)
  const title = sentenceMatch ? sentenceMatch[0].trim() : clean.slice(0, 48)
  const rest = clean.slice(title.length).trim()
  return { title: title.replace(/[.!?]$/, ''), snippet: rest }
}

// ── Typing indicator ──────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="border-t border-border-subtle py-5">
      <div className="flex items-center gap-2 mb-3">
        <img
          src="/logo.svg"
          alt="Nervo"
          width={20}
          height={20}
          style={{ display: 'block', borderRadius: 6 }}
        />
        <span className="text-[11px] font-medium text-accent/60">Nervo</span>
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
            <span className="text-[11px] font-medium text-ink-faint">You</span>
          </>
        ) : (
          <>
            <img
              src="/logo.svg"
              alt="Nervo"
              width={28}
              height={28}
              className="flex-shrink-0"
              style={{ display: 'block', borderRadius: 8 }}
            />
            <span className="text-[11px] font-medium text-accent/60">Nervo</span>
            {message.providerUsed && !message.providerUsed.includes('(cached)') && (
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace' }}>
                ⚡ {message.providerUsed}
              </span>
            )}
          </>
        )}
      </div>
      {message.error ? (
        <p className="text-sm text-red-400" style={{ maxWidth: '70ch' }}>{message.content}</p>
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
          <p className="text-sm text-white/85 leading-relaxed whitespace-pre-wrap" style={{ maxWidth: '70ch' }}>
            {message.content}
          </p>
        </>
      ) : (
        <div className={animate ? 'ai-message-animate' : ''} style={{ maxWidth: '70ch' }}>
          <MarkdownRenderer>{message.content}</MarkdownRenderer>
        </div>
      )}
    </div>
  )
}

// ── Empty-state hero (replaces the old WelcomeMessage + StudyNudge banner) ───
// Pulls 3–4 real starter chips from gaps + recent notes the app already exposes.
// Falls back to generic friendly starters if neither endpoint returns data.

function EmptyChatHero({ onPick }) {
  const [chips, setChips] = useState(null) // null = loading, [...] = ready

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([api.getGaps(), api.getNotes()]).then(([gapsRes, notesRes]) => {
      if (cancelled) return
      const gaps = gapsRes.status === 'fulfilled' ? (gapsRes.value ?? []) : []
      const notes = notesRes.status === 'fulfilled' ? (notesRes.value ?? []) : []
      const recentNotes = notes
        .filter((n) => !n.is_archived && n.title)
        .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))

      const built = []
      if (gaps[0]?.topic_name) built.push(`Explain ${gaps[0].topic_name}`)
      if (gaps[1]?.topic_name) built.push(`Walk me through ${gaps[1].topic_name}`)
      if (recentNotes[0]?.title) built.push(`Quiz me on ${recentNotes[0].title}`)
      if (recentNotes[1]?.title && built.length < 4) built.push(`Help me understand ${recentNotes[1].title}`)

      if (built.length < 3) {
        // TODO: enrich with deeper personalization once more user-context lands client-side.
        const generic = [
          'What should I study next?',
          'Help me understand a concept I\'m struggling with',
          'Walk me through a topic step by step',
          'Quiz me on something I\'m learning',
        ]
        for (const g of generic) {
          if (built.length >= 4) break
          if (!built.includes(g)) built.push(g)
        }
      }

      setChips(built.slice(0, 4))
    })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="text-center max-w-md mx-auto px-4">
      <img
        src="/logo.svg"
        alt="Nervo"
        width={72}
        height={72}
        className="mx-auto mb-5"
        style={{ display: 'block', borderRadius: 18 }}
      />
      <h2 className="text-2xl font-bold text-ink-primary mb-2" style={{ textWrap: 'balance' }}>
        Hey, I&apos;m Nervo — your study partner.
      </h2>
      <p className="text-sm text-ink-secondary mb-7">What are we working on?</p>

      {chips === null ? (
        <div className="flex flex-wrap justify-center gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-9 w-40 rounded-full bg-deep-surface border border-border-subtle"
              style={{ opacity: 0.6 }}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-2">
          {chips.map((text, i) => (
            <button
              key={i}
              onClick={() => onPick(text)}
              className="px-4 py-2 rounded-full text-xs font-medium text-ink-secondary
                         bg-deep-surface border border-border-subtle
                         hover:border-border-hover hover:text-ink-primary
                         transition-colors duration-150"
            >
              {text}
            </button>
          ))}
        </div>
      )}
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
  const grouped = groupSessionsByDate(sessions)

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

  function renderRow(session) {
    const isActive = session.session_id === activeSessionId
    const isConfirming = confirmId === session.session_id
    const isHovered = hoveredId === session.session_id
    const { title, snippet } = splitPreview(session.preview)

    return (
      <div
        key={session.session_id}
        className="relative group"
        onMouseEnter={() => setHoveredId(session.session_id)}
        onMouseLeave={() => setHoveredId(null)}
      >
        {isConfirming ? (
          <div
            className="px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            <p className="text-[11px] text-red-300/90 leading-snug mb-2">Delete this conversation?</p>
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
          <button
            onClick={() => onSelectSession(session.session_id)}
            className="w-full text-left px-3 py-2.5 rounded-xl transition-all duration-150"
            style={
              isActive
                ? {
                    background: 'rgba(99,102,241,0.10)',
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
              {title}
            </p>
            {snippet && (
              <p className="text-[11px] text-ink-muted leading-snug truncate pr-5 mt-0.5">
                {snippet}
              </p>
            )}
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[10px] text-ink-faint">{formatRelativeTime(session.last_activity)}</span>
              <span className="text-[10px] text-ink-faint">·</span>
              <span className="text-[10px] text-ink-faint">
                {session.message_count} {session.message_count === 1 ? 'msg' : 'msgs'}
              </span>
            </div>
          </button>
        )}

        {!isConfirming && isHovered && (
          <button
            onClick={(e) => handleDeleteClick(e, session.session_id)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-ink-faint hover:text-red-400 transition-colors"
            style={{ background: 'rgba(0,0,0,0.3)' }}
            aria-label="Delete conversation"
          >
            <TrashIcon />
          </button>
        )}
      </div>
    )
  }

  function renderGroup(label, items) {
    if (items.length === 0) return null
    return (
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint px-3 mb-1.5">
          {label}
        </p>
        <div className="space-y-0.5">{items.map(renderRow)}</div>
      </div>
    )
  }

  const totalCount = sessions.length

  return (
    <aside
      className="flex-shrink-0 flex flex-col border-r border-border-subtle bg-deep-surface"
      style={{ width: 288 }}
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

      {/* Sessions list — flex-1 + min-h-0 keeps the scroll inside the sidebar */}
      <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-3" style={{ scrollbarWidth: 'none' }}>
        {totalCount === 0 ? (
          <div className="mt-8 px-4 text-center">
            <p className="text-sm text-ink-muted leading-relaxed mb-1.5">No conversations yet.</p>
            <p className="text-[11px] text-ink-faint leading-relaxed">
              Tap <span className="text-ink-secondary">New Chat</span> above to start one with Nervo.
            </p>
          </div>
        ) : (
          <>
            {renderGroup('Today', grouped.today)}
            {renderGroup('Yesterday', grouped.yesterday)}
            {renderGroup('Earlier', grouped.earlier)}
          </>
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
  const [attachedFile, setAttachedFile] = useState(null) // { file, name, previewUrl, isImage }
  const [tutorMode, setTutorMode] = useState(() => localStorage.getItem('tutor_mode') || 'explain')
  const [pendingQuestion, setPendingQuestion] = useState(null)

  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const sessionIdRef = useRef(null)
  const didAutoSend = useRef(false)

  // Auto-scroll whenever messages or typing state changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  async function fetchSessions() {
    try {
      const data = await api.chatSessions()
      setSessions(data)
      return data
    } catch {
      return []
    }
  }

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
    try { await api.deleteChatSession(sid) } catch {}
    setSessions((prev) => prev.filter((s) => s.session_id !== sid))
    if (sessionIdRef.current === sid) {
      sessionIdRef.current = null
      setSessionId(null)
      setMessages([])
    }
  }

  function startNewChat() {
    if (sessionIdRef.current) {
      api.endChatSession(sessionIdRef.current).catch(() => {})
    }
    setMessages([])
    sessionIdRef.current = null
    setSessionId(null)
    setPendingQuestion(null)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  // On mount: fetch sessions and auto-load the most recent one
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
    // Optimistic user bubble — show immediately so the send feels instant.
    // We DO NOT clear the composer (input / attached file / pendingQuestion)
    // here: on a cold-start timeout that wipes a typed prompt + attached PDF
    // and forces the user to re-type and re-attach. Clearing is deferred to
    // the success branch below so a failed send leaves everything in place
    // for retry.
    setMessages((prev) => [...prev, { role: 'user', content: text || '', fileName }])
    setIsTyping(true)

    const priorPending = pendingQuestion
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
      // Success — now safe to clear the composer + advance pendingQuestion.
      setPendingQuestion(extractPendingQuestion(res.response))
      setInput('')
      setAttachedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      fetchSessions()
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Couldn't reach Nervo: ${e.message}`, error: true },
      ])
      // Failure path: input, attachedFile, and pendingQuestion are intentionally
      // left untouched so the user can hit send again without re-typing.
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

      {/* Tutor root — height fix preserved: h-[calc(100vh-3rem)] + min-h-0 */}
      <div className="flex fade-in-up min-h-0 h-[calc(100vh-3rem)]">

        {/* Desktop sidebar (always visible on md+) */}
        <div className="hidden md:flex">
          <ChatSidebar
            sessions={sessions}
            activeSessionId={sessionId}
            onSelectSession={loadSession}
            onNewChat={startNewChat}
            onDeleteSession={deleteSession}
          />
        </div>

        {/* Mobile sidebar overlay */}
        {showSidebar && (
          <>
            <div
              className="md:hidden fixed inset-0 z-40"
              style={{ background: 'rgba(0,0,0,0.5)' }}
              onClick={() => setShowSidebar(false)}
            />
            <div className="md:hidden fixed top-12 left-0 bottom-0 z-50" style={{ width: 288 }}>
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

        {/* Main chat area — height fix preserved: flex-col + min-h-0 */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">

          {/* Desktop mode indicator */}
          <div className="hidden md:flex flex-shrink-0 items-center px-4 py-3 border-b border-border-subtle">
            <div className="w-2 h-2 rounded-full bg-accent flex-shrink-0 mr-2" />
            <span className="text-xs font-medium text-ink-muted capitalize">{tutorMode} mode</span>
          </div>

          {/* Mobile-only sessions toggle */}
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

          {/* Messages area — height fix preserved: flex-1 + overflow-y-auto + min-h-0.
              When empty, flex-center the hero so it lives in the visual middle
              without breaking the flex chain. */}
          {showWelcome ? (
            <div className="flex-1 overflow-y-auto min-h-0 px-4 py-6 flex items-center justify-center">
              <EmptyChatHero onPick={(text) => doSend(text)} />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0 px-4 py-6">
              <div className="max-w-2xl mx-auto">
                {messages.map((msg, i) => (
                  <MessageBubble key={i} message={msg} />
                ))}
                {isTyping && <TypingIndicator />}
                <div ref={bottomRef} />
              </div>
            </div>
          )}

          {/* Composer — flex-shrink-0 so it pins to the bottom of the chain.
              Subtle accent radial glow sits behind it (not full-bleed). */}
          <div className="flex-shrink-0 relative px-4 pt-2 pb-4">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 -top-10 h-32"
              style={{
                background:
                  'radial-gradient(ellipse 55% 100% at 50% 100%, rgba(99,102,241,0.07), transparent 70%)',
              }}
            />

            <div className="relative max-w-2xl mx-auto">
              {/* Composer card — raised surface (deep.elevated) */}
              <div className="bg-deep-elevated border border-border-subtle rounded-xl overflow-hidden">

                {/* Mode segmented row — attached to the top of the composer */}
                <div className="flex items-center gap-1 px-3 pt-2.5 pb-2 border-b border-border-subtle">
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
                            ? 'bg-accent-muted border-accent/35 text-white/80'
                            : 'border-border-subtle text-ink-muted hover:text-ink-primary hover:border-border-hover'
                        }`}
                      >
                        {label}
                      </button>
                      <div
                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg text-[11px] text-white/75 whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 z-10 bg-deep-elevated border border-border-subtle"
                        style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.5)', transition: 'opacity 150ms ease' }}
                      >
                        {tip}
                      </div>
                    </div>
                  ))}
                </div>

                {/* File preview chip — shown above the input row when a file is attached */}
                {attachedFile && (
                  <div className="px-3 pt-2 flex items-center gap-2">
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
                      className="text-ink-faint hover:text-ink-muted transition-colors text-base leading-none ml-auto"
                      aria-label="Remove file"
                    >
                      ×
                    </button>
                  </div>
                )}

                {/* Input inset — slightly darker than the composer surface (deep.surface < deep.elevated) */}
                <div className="m-2 bg-deep-surface border border-border-subtle rounded-lg px-3 py-2.5 flex items-end gap-2 focus-within:border-accent/40 transition-colors">

                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt,.png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onChange={handleFileChange}
                  />

                  {/* Attach button (inside the box) */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isTyping}
                    title="Attach a file (PDF, TXT, or image)"
                    className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center
                               text-ink-muted hover:text-accent transition-colors duration-150
                               disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Attach file"
                  >
                    <PaperclipIcon />
                  </button>

                  {/* Auto-growing textarea */}
                  <textarea
                    ref={inputRef}
                    rows={1}
                    className="flex-1 resize-none text-sm text-ink-primary placeholder-ink-faint bg-transparent focus:outline-none leading-relaxed"
                    style={{
                      maxHeight: '200px',
                      minHeight: '28px',
                      overflowY: 'auto',
                      scrollbarWidth: 'none',
                      paddingTop: 4,
                      paddingBottom: 4,
                    }}
                    placeholder={attachedFile ? 'Add a message about the file…' : 'Ask Nervo anything…'}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value)
                      e.target.style.height = 'auto'
                      e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
                    }}
                    onKeyDown={handleKeyDown}
                    disabled={isTyping}
                  />

                  {/* Send button (inside the box) */}
                  <button
                    onClick={() => doSend(input)}
                    disabled={!canSend}
                    className={`flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center transition-all duration-150 disabled:cursor-not-allowed ${
                      canSend ? 'bg-accent hover:bg-accent-hover text-white' : 'bg-deep-elevated text-ink-faint'
                    }`}
                    aria-label="Send message"
                  >
                    <SendIcon disabled={!canSend} />
                  </button>
                </div>
              </div>

              <p className="text-[10px] text-ink-faint mt-2 px-1 text-center">
                Shift+Enter for new line · Enter to send
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
