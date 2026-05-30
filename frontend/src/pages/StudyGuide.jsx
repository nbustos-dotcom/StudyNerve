import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import GithubSlugger from 'github-slugger'
import { api } from '../api/client'
import Spinner from '../components/Spinner'
import MarkdownRenderer from '../components/MarkdownRenderer'

function BackIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3L5 8l5 5" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 3a7 7 0 11-2.1-1.5" />
      <path d="M13 1v3h-3" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 2l3 3-8 8H3v-3L11 2z" />
    </svg>
  )
}

function SaveIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 11v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1h2" />
      <path d="M9 2h3l2 2v3" />
      <path d="M5 9l3 3 5-5" />
    </svg>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseToc(markdown) {
  const slugger = new GithubSlugger()
  const lines = markdown.split('\n')
  return lines
    .map(line => {
      const m = line.match(/^(#{1,3})\s+(.+)$/)
      if (!m) return null
      const text = m[2].replace(/\*\*/g, '').replace(/\*/g, '').trim()
      return { level: m[1].length, text, id: slugger.slug(text) }
    })
    .filter(Boolean)
}

// ── Table of Contents ─────────────────────────────────────────────────────────

function TableOfContents({ toc }) {
  if (!toc.length) return null

  function scrollTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <nav aria-label="Table of contents">
      <p style={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(148,163,184,0.7)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>
        Contents
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {toc.map(({ level, text, id }) => (
          <li key={id}>
            <button
              onClick={() => scrollTo(id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                padding: '4px 0',
                paddingLeft: `${(level - 1) * 12}px`,
                fontSize: '0.78rem',
                lineHeight: 1.4,
                color: level === 1 ? 'rgba(203,213,225,0.85)' : 'rgba(148,163,184,0.7)',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#e2e8f0' }}
              onMouseLeave={e => { e.currentTarget.style.color = level === 1 ? 'rgba(203,213,225,0.85)' : 'rgba(148,163,184,0.7)' }}
            >
              {text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StudyGuide() {
  const { noteId } = useParams()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [guide, setGuide] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const textareaRef = useRef(null)

  const toc = useMemo(() => (guide ? parseToc(guide) : []), [guide])

  const generate = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.noteStudyGuide(noteId)
      setTitle(res.title)
      setGuide(res.study_guide)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [noteId])

  const loadOrGenerate = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.getNoteStudyGuide(noteId)
      setTitle(res.title)
      if (res.study_guide) {
        setGuide(res.study_guide)
        setLoading(false)
      } else {
        const gen = await api.noteStudyGuide(noteId)
        setTitle(gen.title)
        setGuide(gen.study_guide)
        setLoading(false)
      }
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }, [noteId])

  useEffect(() => {
    loadOrGenerate()
  }, [loadOrGenerate])

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [editing])

  async function saveGuide(content) {
    setSaving(true)
    setSaveError(null)
    try {
      await api.updateNoteStudyGuide(noteId, content)
      setGuide(content)
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function handleEditToggle() {
    if (editing) {
      saveGuide(editContent)
      setEditing(false)
    } else {
      setEditContent(guide)
      setEditing(true)
    }
  }

  function handleBlur() {
    if (editing && editContent !== guide) {
      saveGuide(editContent)
    }
  }

  return (
    <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto fade-in-up">

      {/* Top nav */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <button
          onClick={() => navigate('/notes')}
          className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-primary transition-colors"
        >
          <BackIcon />
          Back to Notes
        </button>

        {!loading && !error && (
          <div className="flex items-center gap-2">
            {editing && (
              <span className="text-xs text-ink-muted flex items-center gap-1">
                {saving ? <><Spinner size="sm" /> Saving…</> : saveError ? <span className="text-red-400">{saveError}</span> : null}
              </span>
            )}
            <button
              onClick={handleEditToggle}
              className="btn-secondary text-xs flex items-center gap-1.5"
            >
              {editing ? <><SaveIcon />Done Editing</> : <><EditIcon />Edit</>}
            </button>
            {!editing && (
              <button
                onClick={generate}
                className="btn-secondary text-xs flex items-center gap-1.5"
              >
                <RefreshIcon />
                Regenerate
              </button>
            )}
          </div>
        )}
      </div>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(99,102,241,0.12)', color: 'rgba(165,180,252,0.9)', border: '1px solid rgba(99,102,241,0.2)' }}
          >
            Study Guide
          </span>
        </div>
        <h1 className="text-2xl font-bold text-ink-primary">{title || '…'}</h1>
      </div>

      {/* Content */}
      {loading ? (
        <div
          className="rounded-2xl p-8 flex flex-col items-center gap-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <Spinner size="sm" />
          <p className="text-sm text-ink-muted">Creating your study guide…</p>
          <p className="text-xs text-ink-faint">This usually takes 10–20 seconds</p>
        </div>
      ) : error ? (
        <div
          className="rounded-2xl p-6"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}
        >
          <p className="text-sm text-red-400 mb-3">{error}</p>
          <button onClick={generate} className="btn-secondary text-xs">Try again</button>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-8 items-start">

          {/* ── Left: guide content ── */}
          <div className="flex-1 min-w-0">
            <div
              className="rounded-2xl"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                padding: '32px',
              }}
            >
              {editing ? (
                <>
                  <textarea
                    ref={textareaRef}
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    onBlur={handleBlur}
                    style={{
                      width: '100%',
                      minHeight: '520px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(99,102,241,0.35)',
                      borderRadius: '10px',
                      padding: '16px',
                      color: 'rgba(255,255,255,0.85)',
                      fontFamily: 'monospace',
                      fontSize: '0.83rem',
                      lineHeight: 1.7,
                      resize: 'vertical',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <div className="flex justify-end mt-3">
                    <button
                      onClick={() => { saveGuide(editContent); setEditing(false) }}
                      disabled={saving}
                      className="btn-secondary text-xs flex items-center gap-1.5"
                    >
                      <SaveIcon />
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ maxWidth: '700px' }} className="[&_h1]:scroll-mt-20 [&_h2]:scroll-mt-20 [&_h3]:scroll-mt-20">
                  <MarkdownRenderer>{guide}</MarkdownRenderer>
                </div>
              )}
            </div>
          </div>

          {/* ── Right: Table of contents ── */}
          {!editing && toc.length > 0 && (
            <div
              className="lg:w-64 lg:flex-shrink-0 w-full"
              style={{ position: 'sticky', top: '24px' }}
            >
              <div
                className="rounded-2xl p-5"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
              >
                <TableOfContents toc={toc} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
