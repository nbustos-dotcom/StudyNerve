import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

const EMPTY_FORM = { title: '', content: '', subject: '' }
const EMPTY_UPLOAD = { title: '', subject: '', file: null }

export default function Notes() {
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

  // Per-note topic state: noteId → { loading, topics, error, count }
  const [topicState, setTopicState] = useState({})

  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    fetchNotes()
  }, [])

  async function fetchNotes() {
    try {
      const data = await api.getNotes()
      setNotes(data)
    } catch (e) {
      console.error(e)
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.title.trim() || !form.content.trim()) return
    setCreating(true)
    setCreateError(null)
    try {
      await api.createNote({
        title: form.title.trim(),
        content: form.content.trim(),
        subject: form.subject.trim() || null,
      })
      setForm(EMPTY_FORM)
      await fetchNotes()
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
    if (file) setUploadForm((f) => ({ ...f, file }))
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

  async function handleShowTopics(noteId) {
    if (topicState[noteId]?.topics) return // already loaded
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
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-slate-100">Notes</h1>
        <p className="text-sm text-slate-500 mt-1">Paste study material and extract topics for quizzing</p>
      </div>

      {/* Create form */}
      <div className="card p-6 mb-8">
        <h2 className="text-sm font-medium text-slate-300 mb-4">Add Note</h2>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 p-1 rounded-lg bg-[#13131a] border border-[#1e1e2e] w-fit">
          {['paste', 'upload'].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setAddTab(tab)}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
                addTab === tab
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab === 'paste' ? 'Paste Text' : 'Upload File'}
            </button>
          ))}
        </div>

        {addTab === 'paste' ? (
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="label">Title *</label>
                <input
                  className="input"
                  placeholder="e.g. Chapter 3 — Cell Biology"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label">Subject</label>
                <input
                  className="input"
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
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                required
              />
            </div>
            {createError && (
              <p className="text-sm text-red-400">{createError}</p>
            )}
            <div className="flex justify-end">
              <button type="submit" className="btn-primary" disabled={creating}>
                {creating ? (
                  <span className="flex items-center gap-2"><Spinner /> Saving…</span>
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
              className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors px-6 py-10
                ${dragOver
                  ? 'border-indigo-400 bg-indigo-500/10'
                  : 'border-[#2a2a3e] bg-[#13131a] hover:border-indigo-500/50 hover:bg-indigo-500/5'
                }`}
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
                  if (file) setUploadForm((f) => ({ ...f, file }))
                }}
              />
            </div>

            {/* Optional metadata */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="label">Title <span className="text-slate-600">(optional — defaults to filename)</span></label>
                <input
                  className="input"
                  placeholder="e.g. Chapter 3 — Cell Biology"
                  value={uploadForm.title}
                  onChange={(e) => setUploadForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Subject</label>
                <input
                  className="input"
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
                  <span className="flex items-center gap-2"><Spinner /> Extracting text…</span>
                ) : (
                  'Upload'
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Notes list */}
      {notes.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">
          No notes yet. Add your first note above.
        </div>
      ) : (
        <div className="space-y-4">
          {notes.map((note) => {
            const ts = topicState[note.id]
            return (
              <div key={note.id} className="card p-6">
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
                    {deletingId === note.id ? <Spinner /> : (
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
                      <span className="flex items-center gap-1.5"><Spinner /> Extracting…</span>
                    ) : (
                      'Extract Topics'
                    )}
                  </button>

                  {ts?.topics && ts.topics.length > 0 && (
                    <span className="text-xs text-slate-500">
                      {ts.count != null ? `${ts.count} topics created` : `${ts.topics.length} topics`}
                    </span>
                  )}

                  {ts?.error && (
                    <span className="text-xs text-red-400">{ts.error}</span>
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
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
