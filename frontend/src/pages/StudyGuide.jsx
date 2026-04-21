import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import MarkdownRenderer from '../components/MarkdownRenderer'

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

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

export default function StudyGuide() {
  const { noteId } = useParams()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [guide, setGuide] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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

  useEffect(() => {
    generate()
  }, [generate])

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto fade-in-up">

      {/* Top nav */}
      <div className="flex items-center justify-between mb-6 gap-4">
        <button
          onClick={() => navigate('/notes')}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <BackIcon />
          Back to Notes
        </button>

        {!loading && !error && (
          <button
            onClick={generate}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            <RefreshIcon />
            Regenerate
          </button>
        )}
      </div>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(99,102,241,0.12)', color: 'rgba(165,180,252,0.9)', border: '1px solid rgba(99,102,241,0.2)' }}
          >
            Study Guide
          </span>
        </div>
        <h1 className="text-xl font-semibold text-slate-100">
          {title || '…'}
        </h1>
      </div>

      {/* Content */}
      {loading ? (
        <div
          className="rounded-2xl p-8 flex flex-col items-center gap-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <Spinner />
          <p className="text-sm text-slate-400">Creating your study guide…</p>
          <p className="text-xs text-slate-600">This usually takes 10-20 seconds</p>
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
        <div
          className="rounded-2xl p-6 sm:p-8"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <MarkdownRenderer>{guide}</MarkdownRenderer>
        </div>
      )}
    </div>
  )
}
