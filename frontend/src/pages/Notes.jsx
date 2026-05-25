import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import Spinner from '../components/Spinner'
import SkeletonCard from '../components/SkeletonCard'
import { useToast } from '../components/Toast'

const EMPTY_FORM = { title: '', content: '', subject: '' }
const EMPTY_UPLOAD = { title: '', subject: '', file: null }

export default function Notes() {
  const navigate = useNavigate()
  const showToast = useToast()
  const [notes, setNotes] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [addTab, setAddTab] = useState('paste') // 'paste' | 'upload'
  const [uploadForm, setUploadForm] = useState(EMPTY_UPLOAD)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)
  const [subjectList, setSubjectList] = useState([])
  const [normalizeBanner, setNormalizeBanner] = useState(false)
  const [normalizing, setNormalizing] = useState(false)

  // Auto-title state
  const [titleAutoGen, setTitleAutoGen] = useState(false)
  const [uploadTitleAutoGen, setUploadTitleAutoGen] = useState(false)
  const [suggestingTitle, setSuggestingTitle] = useState(false)
  const [suggestingUploadTitle, setSuggestingUploadTitle] = useState(false)
  const titleRef = useRef('')
  const uploadTitleRef = useRef('')
  const titleDebounceRef = useRef(null)

  // AI subject merge suggestions
  const [mergeSuggestions, setMergeSuggestions] = useState([])
  const [mergesDismissed, setMergesDismissed] = useState(new Set())
  const [mergingFrom, setMergingFrom] = useState(null)

  // Per-note topic state: noteId → { loading, topics, error, count }
  const [topicState, setTopicState] = useState({})
  // Per-note summary state: noteId → { loading, summary, error }
  const [summaryState, setSummaryState] = useState({})

  const [deletingId, setDeletingId] = useState(null)
  const [notesLoading, setNotesLoading] = useState(true)

  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState('newest')
  const [subjectFilter, setSubjectFilter] = useState('all')

  const subjectCounts = useMemo(() => {
    const counts = {}
    notes.forEach(n => { if (n.subject) counts[n.subject] = (counts[n.subject] || 0) + 1 })
    return counts
  }, [notes])

  const activeMergeSuggestions = useMemo(() => {
    const active = []
    for (const group of mergeSuggestions) {
      for (const alias of group.aliases) {
        const key = `${alias}→${group.canonical}`
        if (!mergesDismissed.has(key) && alias !== group.canonical && subjectCounts[alias] > 0) {
          active.push({ alias, canonical: group.canonical })
        }
      }
    }
    return active
  }, [mergeSuggestions, mergesDismissed, subjectCounts])

  const uniqueSubjects = useMemo(() => {
    const seen = new Set()
    return notes.map(n => n.subject).filter(s => s && !seen.has(s) && seen.add(s))
  }, [notes])

  const filteredNotes = useMemo(() => {
    let result = notes
    if (subjectFilter !== 'all') result = result.filter(n => n.subject === subjectFilter)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(n => n.title.toLowerCase().includes(q))
    }
    result = [...result]
    if (sortOrder === 'newest') result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    else if (sortOrder === 'oldest') result.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    else if (sortOrder === 'az') result.sort((a, b) => a.title.localeCompare(b.title))
    else if (sortOrder === 'za') result.sort((a, b) => b.title.localeCompare(a.title))
    return result
  }, [notes, searchQuery, sortOrder, subjectFilter])

  useEffect(() => {
    fetchNotes()
    api.getSubjectList().then(setSubjectList).catch(() => {})
    api.suggestMerges().then(setMergeSuggestions).catch(() => {})
  }, [])

  async function fetchNotes() {
    try {
      const data = await api.getNotes()
      setNotes(data)
      api.checkSubjectNormalization()
        .then(r => setNormalizeBanner(r.needs))
        .catch(() => {})
    } catch (e) {
      console.error(e)
    } finally {
      setNotesLoading(false)
    }
  }

  async function triggerSuggestTitle(content) {
    if (titleRef.current.trim()) return
    setSuggestingTitle(true)
    try {
      const { title } = await api.suggestTitle(content.slice(0, 500))
      if (!titleRef.current.trim()) {
        titleRef.current = title
        setForm(f => ({ ...f, title }))
        setTitleAutoGen(true)
      }
    } catch (_) {}
    finally { setSuggestingTitle(false) }
  }

  async function triggerSuggestUploadTitle(content) {
    if (uploadTitleRef.current.trim()) return
    setSuggestingUploadTitle(true)
    try {
      const { title } = await api.suggestTitle(content.slice(0, 500))
      if (!uploadTitleRef.current.trim()) {
        uploadTitleRef.current = title
        setUploadForm(f => ({ ...f, title }))
        setUploadTitleAutoGen(true)
      }
    } catch (_) {}
    finally { setSuggestingUploadTitle(false) }
  }

  async function handleMerge(fromSubject, toSubject) {
    setMergingFrom(fromSubject)
    try {
      await api.mergeSubject(fromSubject, toSubject)
      setMergesDismissed(prev => new Set([...prev, `${fromSubject}→${toSubject}`]))
      await fetchNotes()
    } catch (e) {
      console.error(e)
    } finally {
      setMergingFrom(null)
    }
  }

  async function handleNormalizeAll() {
    setNormalizing(true)
    try {
      await api.normalizeAllSubjects()
      setNormalizeBanner(false)
      await fetchNotes()
    } catch (e) {
      console.error(e)
    } finally {
      setNormalizing(false)
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.title.trim()) {
      setCreateError('Please add a title — or paste content and wait for auto-fill.')
      return
    }
    if (!form.content.trim()) return
    setCreating(true)
    setCreateError(null)
    try {
      await api.createNote({
        title: form.title.trim(),
        content: form.content.trim(),
        subject: form.subject.trim() || null,
      })
      setForm(EMPTY_FORM)
      titleRef.current = ''
      setTitleAutoGen(false)
      const prevCount = notes.length
      await fetchNotes()
      if (prevCount === 0) showToast?.('First note added! You\'re on your way 🎉', 'success')
    } catch (err) {
      setCreateError(err.message)
    } finally {
      setCreating(false)
    }
  }

  function handleFileDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer?.files?.[0]
    if (!file) return
    setUploadForm(f => ({ ...f, file }))
    if (file.name.toLowerCase().endsWith('.txt')) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const content = ev.target.result?.slice(0, 500) || ''
        if (content.trim().length >= 30) triggerSuggestUploadTitle(content)
      }
      reader.readAsText(file)
    }
  }

  async function handleUpload(e) {
    e.preventDefault()
    if (!uploadForm.file) return
    setUploading(true)
    setUploadError(null)
    try {
      await api.uploadNote(uploadForm.file, {
        title: uploadForm.title.trim() || undefined,
        subject: uploadForm.subject.trim() || undefined,
      })
      setUploadForm(EMPTY_UPLOAD)
      uploadTitleRef.current = ''
      setUploadTitleAutoGen(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await fetchNotes()
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this note and all its topics and questions?')) return
    setDeletingId(id)
    try {
      await api.deleteNote(id)
      setNotes((prev) => prev.filter((n) => n.id !== id))
    } catch (e) {
      alert('Delete failed: ' + e.message)
    } finally {
      setDeletingId(null)
    }
  }

  async function handleExtractTopics(note) {
    setTopicState((prev) => ({
      ...prev,
      [note.id]: { loading: true, topics: null, error: null, count: null },
    }))
    try {
      const result = await api.extractTopics(note.id)
      const topics = await api.getTopics(note.id)
      setTopicState((prev) => ({
        ...prev,
        [note.id]: { loading: false, topics, error: null, count: result.created },
      }))
    } catch (e) {
      setTopicState((prev) => ({
        ...prev,
        [note.id]: { loading: false, topics: null, error: e.message, count: null },
      }))
    }
  }

  async function handleSummarize(noteId) {
    if (summaryState[noteId]?.summary) return
    setSummaryState((prev) => ({ ...prev, [noteId]: { loading: true, summary: null, error: null } }))
    try {
      const result = await api.summarizeNote(noteId)
      setSummaryState((prev) => ({ ...prev, [noteId]: { loading: false, summary: result.summary, error: null } }))
    } catch (e) {
      setSummaryState((prev) => ({ ...prev, [noteId]: { loading: false, summary: null, error: e.message } }))
    }
  }

  async function handleShowTopics(noteId) {
    if (topicState[noteId]?.topics) return
    setTopicState((prev) => ({ ...prev, [noteId]: { loading: true, topics: null, error: null } }))
    try {
      const topics = await api.getTopics(noteId)
      setTopicState((prev) => ({ ...prev, [noteId]: { loading: false, topics, error: null } }))
    } catch (e) {
      setTopicState((prev) => ({ ...prev, [noteId]: { loading: false, topics: null, error: e.message } }))
    }
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto fade-in-up">
      <datalist id="subject-options">
        {subjectList.map(s => <option key={s} value={s} />)}
      </datalist>

      <div className="mb-8">
        <h1 className="text-xl font-semibold text-slate-100">Notes</h1>
        <p className="text-sm text-slate-500 mt-1">Paste study material and extract topics for quizzing</p>
      </div>

      {/* AI subject merge suggestions */}
      {activeMergeSuggestions.length > 0 && (
        <div className="mb-6 space-y-2">
          {activeMergeSuggestions.map(({ alias, canonical }) => {
            const aliasCount = subjectCounts[alias] || 0
            const canonicalCount = subjectCounts[canonical] || 0
            return (
              <div
                key={`${alias}→${canonical}`}
                className="flex items-center justify-between gap-4 rounded-xl px-4 py-3"
                style={{ background: 'rgba(var(--indigo-500-rgb),0.06)', border: '1px solid rgba(var(--indigo-500-rgb),0.15)' }}
              >
                <p className="text-sm text-slate-300">
                  Merge{' '}
                  <span className="text-white font-medium">'{alias}'</span>
                  <span className="text-slate-500"> ({aliasCount} {aliasCount === 1 ? 'note' : 'notes'})</span>
                  {' '}into{' '}
                  <span className="text-white font-medium">'{canonical}'</span>
                  {canonicalCount > 0 && (
                    <span className="text-slate-500"> ({canonicalCount} {canonicalCount === 1 ? 'note' : 'notes'})</span>
                  )}
                  ?
                </p>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleMerge(alias, canonical)}
                    disabled={mergingFrom === alias}
                    className="btn-primary text-xs"
                  >
                    {mergingFrom === alias
                      ? <span className="flex items-center gap-1"><Spinner size="sm" /> Merging…</span>
                      : 'Accept'}
                  </button>
                  <button
                    onClick={() => setMergesDismissed(prev => new Set([...prev, `${alias}→${canonical}`]))}
                    className="btn-ghost text-xs text-slate-500 hover:text-slate-300"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {normalizeBanner && (
        <div
          className="mb-6 flex items-center justify-between gap-4 rounded-xl px-4 py-3"
          style={{ background: 'rgba(var(--indigo-500-rgb),0.08)', border: '1px solid rgba(var(--indigo-500-rgb),0.2)' }}
        >
          <p className="text-sm text-indigo-300">
            Some of your subjects look similar. Click here to organize them.
          </p>
          <button
            onClick={handleNormalizeAll}
            disabled={normalizing}
            className="flex-shrink-0 btn-primary text-xs"
          >
            {normalizing ? <span className="flex items-center gap-1.5"><Spinner size="sm" /> Organizing…</span> : 'Organize'}
          </button>
        </div>
      )}

      {/* Create form */}
      <div className="card p-6 mb-8">
        <h2 className="text-sm font-medium text-slate-300 mb-4">Add Note</h2>

        {/* Tabs */}
        <div className="pill-tabs mb-5">
          {['paste', 'upload'].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setAddTab(tab)}
              className={`pill-tab${addTab === tab ? ' active' : ''}`}
            >
              {tab === 'paste' ? 'Paste Text' : 'Upload File'}
            </button>
          ))}
        </div>

        {addTab === 'paste' ? (
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="label flex items-center gap-2">
                  Title
                  {suggestingTitle && (
                    <span className="text-xs text-slate-500 font-normal flex items-center gap-1">
                      <Spinner size="sm" /> suggesting…
                    </span>
                  )}
                  {!suggestingTitle && titleAutoGen && (
                    <span className="text-xs text-slate-500 font-normal">(auto-generated)</span>
                  )}
                </label>
                <input
                  className="input"
                  placeholder="e.g. Chapter 3 — Cell Biology"
                  value={form.title}
                  onChange={(e) => {
                    titleRef.current = e.target.value
                    setForm(f => ({ ...f, title: e.target.value }))
                    setTitleAutoGen(false)
                  }}
                />
              </div>
              <div>
                <label className="label">Subject</label>
                <input
                  className="input"
                  list="subject-options"
                  placeholder="e.g. Biology"
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="label">Content *</label>
              <textarea
                className="input resize-none"
                rows={6}
                placeholder="Paste your notes, textbook excerpt, or study material here…"
                value={form.content}
                onChange={(e) => {
                  const value = e.target.value
                  setForm(f => ({ ...f, content: value }))
                  clearTimeout(titleDebounceRef.current)
                  if (value.trim().length >= 30) {
                    titleDebounceRef.current = setTimeout(() => triggerSuggestTitle(value), 1000)
                  }
                }}
                onBlur={(e) => {
                  clearTimeout(titleDebounceRef.current)
                  const value = e.target.value
                  if (value.trim().length >= 30) triggerSuggestTitle(value)
                }}
                required
              />
            </div>
            {createError && (
              <p className="text-sm text-red-400">{createError}</p>
            )}
            <div className="flex justify-end">
              <button type="submit" className="btn-primary" disabled={creating}>
                {creating ? (
                  <span className="flex items-center gap-2"><Spinner size="sm" /> Saving…</span>
                ) : (
                  'Save Note'
                )}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleUpload} className="space-y-4">
            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200 px-6 py-10
                ${dragOver
                  ? 'border-indigo-400 bg-indigo-500/10 scale-[1.01]'
                  : 'border-white/10 bg-white/[0.02] hover:border-indigo-500/40 hover:bg-indigo-500/5'
                }`}
              style={dragOver ? { animation: 'none' } : { animation: 'none' }}
            >
              <svg className="w-8 h-8 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 3v13M8 7l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {uploadForm.file ? (
                <div className="text-center">
                  <p className="text-sm font-medium text-indigo-300">{uploadForm.file.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{(uploadForm.file.size / 1024).toFixed(0)} KB</p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm text-slate-400">Drop your PDF or text file here, or click to browse</p>
                  <p className="text-xs text-slate-600 mt-1">Accepted: .pdf, .txt &nbsp;·&nbsp; Max 5 MB</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setUploadForm(f => ({ ...f, file }))
                  if (file.name.toLowerCase().endsWith('.txt')) {
                    const reader = new FileReader()
                    reader.onload = (ev) => {
                      const content = ev.target.result?.slice(0, 500) || ''
                      if (content.trim().length >= 30) triggerSuggestUploadTitle(content)
                    }
                    reader.readAsText(file)
                  }
                }}
              />
            </div>

            {/* Optional metadata */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="label flex items-center gap-2">
                  Title
                  <span className="text-slate-600 font-normal">(optional — defaults to filename)</span>
                  {suggestingUploadTitle && (
                    <span className="text-xs text-slate-500 font-normal flex items-center gap-1">
                      <Spinner size="sm" /> suggesting…
                    </span>
                  )}
                  {!suggestingUploadTitle && uploadTitleAutoGen && (
                    <span className="text-xs text-slate-500 font-normal">(auto-generated)</span>
                  )}
                </label>
                <input
                  className="input"
                  placeholder="e.g. Chapter 3 — Cell Biology"
                  value={uploadForm.title}
                  onChange={(e) => {
                    uploadTitleRef.current = e.target.value
                    setUploadForm(f => ({ ...f, title: e.target.value }))
                    setUploadTitleAutoGen(false)
                  }}
                />
              </div>
              <div>
                <label className="label">Subject</label>
                <input
                  className="input"
                  list="subject-options"
                  placeholder="e.g. Biology"
                  value={uploadForm.subject}
                  onChange={(e) => setUploadForm((f) => ({ ...f, subject: e.target.value }))}
                />
              </div>
            </div>

            {uploadError && (
              <p className="text-sm text-red-400">{uploadError}</p>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                className="btn-primary"
                disabled={uploading || !uploadForm.file}
              >
                {uploading ? (
                  <span className="flex items-center gap-2"><Spinner size="sm" /> Extracting text…</span>
                ) : (
                  'Upload'
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Filter bar */}
      {!notesLoading && notes.length > 0 && (
        <div className="card p-3 mb-6 flex flex-col sm:flex-row gap-2.5">
          <input
            className="input flex-1 min-w-0"
            type="search"
            placeholder="Search notes…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <select
            className="input sm:w-44"
            value={sortOrder}
            onChange={e => setSortOrder(e.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="az">A–Z</option>
            <option value="za">Z–A</option>
          </select>
          <select
            className="input sm:w-44"
            value={subjectFilter}
            onChange={e => setSubjectFilter(e.target.value)}
          >
            <option value="all">All subjects</option>
            {uniqueSubjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}

      {/* Notes list */}
      {notesLoading ? (
        <div className="space-y-4">
          <SkeletonCard className="stagger-1" />
          <SkeletonCard className="stagger-2" />
          <SkeletonCard className="stagger-3" />
          <SkeletonCard className="stagger-4" />
        </div>
      ) : notes.length === 0 ? (
        <div className="card p-10 flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(var(--indigo-500-rgb),0.08)', border: '1px solid rgba(var(--indigo-500-rgb),0.15)' }}>
            <svg className="w-7 h-7 text-indigo-400/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
            </svg>
          </div>
          <div>
            <p className="text-slate-300 font-medium mb-1">No notes yet</p>
            <p className="text-sm text-slate-500">Paste text or upload a file to get started.</p>
          </div>
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="card p-8 flex flex-col items-center gap-2 text-center">
          <p className="text-slate-400 font-medium">No notes match your filters</p>
          <button className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors" onClick={() => { setSearchQuery(''); setSortOrder('newest'); setSubjectFilter('all') }}>
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredNotes.map((note, noteIdx) => {
            const ts = topicState[note.id]
            const ss = summaryState[note.id]
            return (
              <div key={note.id} className={`card p-6 card-lift fade-in-up stagger-${Math.min(noteIdx + 1, 6)}`}>
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-slate-100 truncate">{note.title}</h3>
                      {note.subject && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex-shrink-0">
                          {note.subject}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{formatDate(note.created_at)}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(note.id)}
                    disabled={deletingId === note.id}
                    className="flex-shrink-0 btn-ghost text-xs text-slate-600 hover:text-red-400"
                    title="Delete note"
                  >
                    {deletingId === note.id ? <Spinner size="sm" /> : (
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M3 4h10M6 4V2h4v2M5 4v8a1 1 0 001 1h4a1 1 0 001-1V4" strokeLinecap="round" />
                      </svg>
                    )}
                  </button>
                </div>

                <p className="text-xs text-slate-500 line-clamp-2 mb-4 leading-relaxed">
                  {note.content}
                </p>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    className="btn-secondary text-xs"
                    onClick={() => handleExtractTopics(note)}
                    disabled={ts?.loading}
                  >
                    {ts?.loading ? (
                      <span className="flex items-center gap-1.5"><Spinner size="sm" /> Extracting…</span>
                    ) : (
                      'Extract Topics'
                    )}
                  </button>

                  <button
                    className="btn-secondary text-xs"
                    onClick={() => handleSummarize(note.id)}
                    disabled={ss?.loading}
                  >
                    {ss?.loading ? (
                      <span className="flex items-center gap-1.5"><Spinner size="sm" /> Summarizing…</span>
                    ) : (
                      'Summarize'
                    )}
                  </button>

                  <button
                    className="btn-secondary text-xs"
                    onClick={() => navigate(`/notes/${note.id}/study-guide`)}
                  >
                    Study Guide
                  </button>

                  {ts?.topics && ts.topics.length > 0 && (
                    <span className="text-xs text-slate-500">
                      {ts.count != null ? `${ts.count} topics created` : `${ts.topics.length} topics`}
                    </span>
                  )}

                  {ts?.error && (
                    <span className="text-xs text-red-400">{ts.error}</span>
                  )}

                  {ss?.error && (
                    <span className="text-xs text-red-400">{ss.error}</span>
                  )}
                </div>

                {/* Topics */}
                {ts?.topics && ts.topics.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-[#1e1e2e]">
                    <p className="text-xs font-medium text-slate-500 mb-2">Topics</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ts.topics
                        .filter((t) => t.parent_topic_id === null)
                        .map((parent) => (
                          <div key={parent.id} className="flex flex-col gap-1">
                            <span className="text-xs px-2 py-1 rounded-md bg-[#17171f] border border-[#1e1e2e] text-slate-300">
                              {parent.name}
                            </span>
                            <div className="flex flex-wrap gap-1 ml-2">
                              {ts.topics
                                .filter((t) => t.parent_topic_id === parent.id)
                                .map((child) => (
                                  <span
                                    key={child.id}
                                    className="text-xs px-2 py-0.5 rounded-md bg-[#13131a] text-slate-500"
                                  >
                                    {child.name}
                                  </span>
                                ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Summary */}
                {ss?.summary && (
                  <div className="mt-4 pt-4 border-t border-[#1e1e2e]">
                    <p className="text-xs font-medium text-slate-500 mb-2">Summary</p>
                    <div
                      className="rounded-xl p-4"
                      style={{
                        background: 'rgba(var(--indigo-500-rgb),0.06)',
                        border: '1px solid rgba(var(--indigo-500-rgb),0.15)',
                      }}
                    >
                      {ss.summary.split('\n').filter(Boolean).map((line, i) => (
                        <p key={i} className="text-xs text-slate-300 leading-relaxed">
                          {line}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
