import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import Spinner from '../components/Spinner'

function EyeIcon({ open }) {
  return open ? (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/>
    </svg>
  ) : (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.4 13.4L2.6 2.6M6.6 6.7A2 2 0 0010 9.4M5.1 5.1C3.1 6.2 1.4 8 1.4 8s2.3 4.6 6.6 4.6c1.4 0 2.5-.4 3.5-1M9 2.5C8.7 2.5 8.4 2.4 8 2.4c-4.3 0-6.6 4.6-6.6 4.6s.5 1 1.6 2.1"/>
    </svg>
  )
}

const PROVIDERS = [
  { value: 'ollama',    label: 'Local Ollama',      needsKey: false, hint: 'Runs on your machine — no API key required.' },
  { value: 'gemini',   label: 'Google Gemini',      needsKey: true,  hint: 'Uses gemini-2.0-flash.',            apiKeyUrl: 'https://aistudio.google.com/apikey',              apiKeyLabel: 'Get free key →' },
  { value: 'openai',   label: 'OpenAI',             needsKey: true,  hint: 'Uses gpt-4o-mini by default.',      apiKeyUrl: 'https://platform.openai.com/api-keys',            apiKeyLabel: 'Get key →' },
  { value: 'anthropic',label: 'Claude (Anthropic)', needsKey: true,  hint: 'Uses claude-sonnet-4.',             apiKeyUrl: 'https://console.anthropic.com/settings/keys',     apiKeyLabel: 'Get key →' },
  { value: 'groq',     label: 'Groq',               needsKey: true,  hint: 'Uses llama-3.3-70b-versatile. Free tier available.', apiKeyUrl: 'https://console.groq.com/keys', apiKeyLabel: 'Get free key → (recommended - best free option)' },
]

function SectionCard({ title, children }) {
  return (
    <div className="card-solid mb-6 overflow-hidden">
      <div className="px-6 py-4 border-b border-white/[0.05]" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <h2 className="text-sm font-semibold text-slate-200 tracking-wide">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

function DeleteAccountModal({ onConfirm, onCancel, deleting }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
    >
      <div
        className="rounded-2xl p-6 max-w-md w-full mx-4"
        style={{
          background: 'rgba(12,12,28,0.98)',
          border: '1px solid rgba(239,68,68,0.2)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
        }}
      >
        {/* Icon + title */}
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            <svg className="w-5 h-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-100">Delete Account</h3>
            <p className="text-xs text-slate-500 mt-0.5">This cannot be undone</p>
          </div>
        </div>

        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
          This permanently deletes your account and <span className="text-slate-300">all your data</span> — notes, quiz history, chat sessions, AI insights, vision boards, and settings. There is no recovery.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 btn-ghost"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
            style={{
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: 'rgb(252,165,165)',
            }}
          >
            {deleting ? 'Deleting…' : 'Delete Everything'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ClearMemoryModal({ onConfirm, onCancel, clearing }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
    >
      <div
        className="rounded-2xl p-6 max-w-md w-full mx-4"
        style={{
          background: 'rgba(12,12,28,0.98)',
          border: '1px solid rgba(239,68,68,0.2)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            <svg className="w-5 h-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
              <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-100">Clear AI Memory</h3>
            <p className="text-xs text-slate-500 mt-0.5">This cannot be undone</p>
          </div>
        </div>

        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
          This will erase everything the AI has learned about you from past conversations — your learning patterns, strengths, weak spots, and preferences. Your notes, quizzes, and chat history are <span className="text-slate-300">not</span> deleted. The AI just starts learning you from scratch.
        </p>

        <div className="flex gap-3">
          <button onClick={onCancel} disabled={clearing} className="flex-1 btn-ghost">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={clearing}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
            style={{
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: 'rgb(252,165,165)',
            }}
          >
            {clearing ? 'Clearing…' : 'Clear Memory'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Settings() {
  const navigate = useNavigate()

  // ── Provider state ───────────────────────────────────────────────────────────
  const [currentSettings, setCurrentSettings] = useState(null)
  const [provider, setProvider] = useState('ollama')
  const [apiKey, setApiKey] = useState('')
  const [providerSaving, setProviderSaving] = useState(false)
  const [providerMsg, setProviderMsg] = useState(null)

  // ── Canvas state ─────────────────────────────────────────────────────────────
  const [canvasUrl, setCanvasUrl] = useState('')
  const [canvasToken, setCanvasToken] = useState('')
  const [canvasSaving, setCanvasSaving] = useState(false)
  const [canvasMsg, setCanvasMsg] = useState(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [showCanvasToken, setShowCanvasToken] = useState(false)

  // ── Clear AI memory state ────────────────────────────────────────────────────
  const [showClearMemoryModal, setShowClearMemoryModal] = useState(false)
  const [clearingMemory, setClearingMemory] = useState(false)
  const [clearMemoryMsg, setClearMemoryMsg] = useState(null)

  // ── Delete account state ─────────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  useEffect(() => { loadSettings() }, [])

  async function loadSettings() {
    try {
      const s = await api.getSettings()
      setCurrentSettings(s)
      setProvider(s.llm_provider || 'ollama')
      if (s.canvas_url) {
        // Strip /api/v1 suffix if present — backend now stores base URL,
        // but old entries may still have it.
        setCanvasUrl(s.canvas_url.replace(/\/api\/v\d+\/?$/, ''))
      }
    } catch {
      // ignore
    }
  }

  async function saveProvider(e) {
    e.preventDefault()
    setProviderSaving(true)
    setProviderMsg(null)
    try {
      const payload = { provider }
      const providerMeta = PROVIDERS.find((p) => p.value === provider)
      if (providerMeta?.needsKey && apiKey.trim()) payload.api_key = apiKey.trim()
      const result = await api.saveProvider(payload)
      setCurrentSettings(result)
      setApiKey('')
      setProviderMsg({ ok: true, text: 'Provider saved.' })
    } catch (err) {
      setProviderMsg({ ok: false, text: err.message })
    } finally {
      setProviderSaving(false)
    }
  }

  async function saveCanvas(e) {
    e.preventDefault()
    setCanvasSaving(true)
    setCanvasMsg(null)
    try {
      const result = await api.saveCanvasSettings({ canvas_url: canvasUrl, canvas_token: canvasToken })
      setCurrentSettings((prev) => ({ ...prev, canvas_url: result.canvas_url, canvas_connected: result.canvas_connected }))
      if (result.canvas_url) setCanvasUrl(result.canvas_url.replace(/\/api\/v\d+\/?$/, ''))
      setCanvasToken('')
      if (result.canvas_connected) {
        setCanvasMsg({ ok: true, text: 'Canvas connected and verified.' })
      } else {
        setCanvasMsg({ ok: false, text: 'Settings saved but Canvas connection failed — check your token.' })
      }
    } catch (err) {
      setCanvasMsg({ ok: false, text: err.message })
    } finally {
      setCanvasSaving(false)
    }
  }

  async function disconnectCanvas() {
    setCanvasSaving(true)
    setCanvasMsg(null)
    try {
      await api.saveCanvasSettings({ canvas_url: canvasUrl || 'https://canvas.instructure.com', canvas_token: '' })
      setCurrentSettings((prev) => ({ ...prev, canvas_connected: false }))
      setCanvasToken('')
      setCanvasMsg({ ok: true, text: 'Canvas disconnected.' })
    } catch (err) {
      setCanvasMsg({ ok: false, text: err.message })
    } finally {
      setCanvasSaving(false)
    }
  }

  async function handleClearMemory() {
    setClearingMemory(true)
    setClearMemoryMsg(null)
    try {
      const result = await api.clearAllInsights()
      setShowClearMemoryModal(false)
      setClearMemoryMsg({ ok: true, text: `Done — ${result.deleted} insight${result.deleted !== 1 ? 's' : ''} erased. The AI starts fresh next conversation.` })
    } catch (err) {
      setShowClearMemoryModal(false)
      setClearMemoryMsg({ ok: false, text: err.message })
    } finally {
      setClearingMemory(false)
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await api.deleteAccount()
      localStorage.removeItem('mt_token')
      localStorage.removeItem('mt_user')
      localStorage.removeItem('mt_onboarded')
      window.location.href = '/login'
    } catch (err) {
      setDeleting(false)
      setShowDeleteModal(false)
      setDeleteError(err.message)
    }
  }

  const selectedMeta = PROVIDERS.find((p) => p.value === provider)

  return (
    <div className="p-4 sm:p-8 max-w-2xl mx-auto fade-in-up">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Configure your AI provider and integrations</p>
      </div>

      {/* ── AI Provider ───────────────────────────────────────────────────────── */}
      <SectionCard title="AI Provider">
        <form onSubmit={saveProvider} className="space-y-5">
          {/* Current provider badge */}
          {currentSettings && (
            <div className="flex items-center gap-2 mb-1">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: 'rgba(var(--indigo-500-rgb),0.8)', boxShadow: '0 0 6px rgba(var(--indigo-500-rgb),0.9)' }}
              />
              <span className="text-xs text-slate-500">
                Currently using{' '}
                <span className="text-slate-300 font-medium">
                  {PROVIDERS.find((p) => p.value === currentSettings.llm_provider)?.label ?? currentSettings.llm_provider}
                </span>
                {currentSettings.llm_api_key_set && (
                  <span className="text-slate-600"> · API key saved</span>
                )}
              </span>
            </div>
          )}

          {/* Provider grid */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Provider</label>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => { setProvider(p.value); setApiKey('') }}
                  className="px-4 py-3 rounded-xl text-left transition-all duration-150"
                  style={
                    provider === p.value
                      ? {
                          background: 'rgba(var(--indigo-500-rgb),0.15)',
                          border: '1px solid rgba(var(--indigo-500-rgb),0.35)',
                          boxShadow: '0 0 16px rgba(var(--indigo-500-rgb),0.1)',
                        }
                      : {
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.07)',
                        }
                  }
                >
                  <div
                    className="text-sm font-medium"
                    style={{ color: provider === p.value ? '#a5b4fc' : 'rgba(255,255,255,0.6)' }}
                  >
                    {p.label}
                  </div>
                  {!p.needsKey && (
                    <div className="text-[10px] text-emerald-500 mt-0.5">No API key</div>
                  )}
                  {p.apiKeyUrl && (
                    <a
                      href={p.apiKeyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-sm text-indigo-400 hover:text-indigo-300 transition mt-0.5 inline-block"
                    >
                      {p.apiKeyLabel}
                    </a>
                  )}
                </button>
              ))}
            </div>
            {selectedMeta && (
              <p className="text-[11px] text-slate-600 mt-2">{selectedMeta.hint}</p>
            )}
          </div>

          {/* API key input */}
          {selectedMeta?.needsKey && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                API Key
                {currentSettings?.llm_api_key_set && currentSettings.llm_provider === provider && (
                  <span className="text-slate-600 font-normal ml-1.5">— leave blank to keep existing key</span>
                )}
              </label>
              <div className="relative">
                <input
                  className="input font-mono text-xs tracking-wider pr-10"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    currentSettings?.llm_api_key_set && currentSettings.llm_provider === provider
                      ? '••••••••••••••••'
                      : 'Paste your API key'
                  }
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                  tabIndex={-1}
                >
                  <EyeIcon open={showApiKey} />
                </button>
              </div>
            </div>
          )}

          {providerMsg && (
            <div
              className={`text-xs rounded-lg px-3 py-2.5 ${providerMsg.ok ? 'text-emerald-300' : 'text-red-300'}`}
              style={{
                background: providerMsg.ok ? 'rgba(52,211,153,0.07)' : 'rgba(239,68,68,0.07)',
                border: `1px solid ${providerMsg.ok ? 'rgba(52,211,153,0.18)' : 'rgba(239,68,68,0.18)'}`,
              }}
            >
              {providerMsg.text}
            </div>
          )}

          <button type="submit" disabled={providerSaving} className="btn-primary">
            {providerSaving ? <><Spinner size="sm" />Saving…</> : 'Save Provider'}
          </button>
        </form>
      </SectionCard>

      {/* ── Canvas LMS ────────────────────────────────────────────────────────── */}
      <SectionCard title="Canvas LMS">
        {/* Status badge */}
        {currentSettings && (
          <div className="flex items-center gap-2 mb-5">
            <div
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${currentSettings.canvas_connected ? 'bg-emerald-400' : 'bg-slate-600'}`}
              style={currentSettings.canvas_connected ? { boxShadow: '0 0 8px rgba(52,211,153,0.7)' } : {}}
            />
            <span className="text-xs text-slate-500">
              {currentSettings.canvas_connected ? (
                <>
                  <span className="text-emerald-400 font-medium">Connected</span>
                  {currentSettings.canvas_url && (
                    <span className="text-slate-600"> · {currentSettings.canvas_url.replace(/\/api\/v\d+\/?$/, '')}</span>
                  )}
                </>
              ) : (
                'Not connected'
              )}
            </span>
            {currentSettings.canvas_connected && (
              <button
                onClick={disconnectCanvas}
                disabled={canvasSaving}
                className="ml-auto text-xs btn-ghost"
                style={{ color: 'rgba(248,113,113,0.5)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'rgb(248,113,113)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(248,113,113,0.5)')}
              >
                Disconnect
              </button>
            )}
          </div>
        )}

        <form onSubmit={saveCanvas} className="space-y-4">
          <div>
            <label className="label">Canvas URL</label>
            <input
              className="input"
              type="url"
              value={canvasUrl}
              onChange={(e) => setCanvasUrl(e.target.value)}
              placeholder="https://mtu.instructure.com"
              required
            />
            <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
              Enter your university's Canvas domain — do <strong className="text-slate-500">not</strong> include <code className="text-slate-500">/api/v1</code>, we add that automatically.
            </p>
          </div>
          <div>
            <label className="label">API Token</label>
            <div className="relative">
              <input
                className="input font-mono text-xs tracking-wide pr-10"
                type={showCanvasToken ? 'text' : 'password'}
                value={canvasToken}
                onChange={(e) => setCanvasToken(e.target.value)}
                placeholder={currentSettings?.canvas_connected ? '••••••••' : 'Paste your Canvas access token'}
                autoComplete="off"
                required={!currentSettings?.canvas_connected}
              />
              <button
                type="button"
                onClick={() => setShowCanvasToken((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                tabIndex={-1}
              >
                <EyeIcon open={showCanvasToken} />
              </button>
            </div>
            <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
              Canvas → Account → Settings → Approved Integrations → New Access Token
            </p>
          </div>

          {canvasMsg && (
            <div
              className={`text-xs rounded-lg px-3 py-2.5 ${canvasMsg.ok ? 'text-emerald-300' : 'text-red-300'}`}
              style={{
                background: canvasMsg.ok ? 'rgba(52,211,153,0.07)' : 'rgba(239,68,68,0.07)',
                border: `1px solid ${canvasMsg.ok ? 'rgba(52,211,153,0.18)' : 'rgba(239,68,68,0.18)'}`,
              }}
            >
              {canvasMsg.text}
            </div>
          )}

          <button type="submit" disabled={canvasSaving} className="btn-primary">
            {canvasSaving ? (
              <><Spinner size="sm" />{currentSettings?.canvas_connected ? 'Updating…' : 'Connecting…'}</>
            ) : (
              currentSettings?.canvas_connected ? 'Update Token' : 'Connect to Canvas'
            )}
          </button>
        </form>
      </SectionCard>

      {/* ── Data ──────────────────────────────────────────────────────────────── */}
      <SectionCard title="Data">
        <p className="text-sm text-slate-500 mb-4">
          Reset what the AI has learned about you. Your notes, quizzes, and chat history are not affected.
        </p>

        {clearMemoryMsg && (
          <div
            className={`text-xs rounded-lg px-3 py-2.5 mb-4 ${clearMemoryMsg.ok ? 'text-emerald-300' : 'text-red-300'}`}
            style={{
              background: clearMemoryMsg.ok ? 'rgba(52,211,153,0.07)' : 'rgba(239,68,68,0.07)',
              border: `1px solid ${clearMemoryMsg.ok ? 'rgba(52,211,153,0.18)' : 'rgba(239,68,68,0.18)'}`,
            }}
          >
            {clearMemoryMsg.text}
          </div>
        )}

        <button
          onClick={() => { setClearMemoryMsg(null); setShowClearMemoryModal(true) }}
          className="px-4 py-2.5 rounded-xl text-sm font-medium bg-red-500/[0.06] border border-red-500/[0.15] text-red-300/70 hover:bg-red-500/12 hover:border-red-500/28 hover:text-red-300 transition-colors duration-150"
        >
          Clear AI Memory
        </button>
      </SectionCard>

      {/* ── Danger Zone ───────────────────────────────────────────────────────── */}
      <SectionCard title="Danger Zone">
        <p className="text-sm text-slate-500 mb-4">
          Permanently delete your account and all associated data. This cannot be undone.
        </p>

        {deleteError && (
          <div
            className="text-xs rounded-lg px-3 py-2.5 text-red-300 mb-4"
            style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)' }}
          >
            {deleteError}
          </div>
        )}

        <button
          onClick={() => { setDeleteError(null); setShowDeleteModal(true) }}
          className="px-4 py-2.5 rounded-xl text-sm font-medium bg-red-500/[0.06] border border-red-500/[0.15] text-red-300/70 hover:bg-red-500/12 hover:border-red-500/28 hover:text-red-300 transition-colors duration-150"
        >
          Delete Account
        </button>
      </SectionCard>

      {/* ── Clear memory confirmation modal ───────────────────────────────────── */}
      {showClearMemoryModal && (
        <ClearMemoryModal
          onConfirm={handleClearMemory}
          onCancel={() => setShowClearMemoryModal(false)}
          clearing={clearingMemory}
        />
      )}

      {/* ── Delete confirmation modal ─────────────────────────────────────────── */}
      {showDeleteModal && (
        <DeleteAccountModal
          onConfirm={handleDeleteAccount}
          onCancel={() => setShowDeleteModal(false)}
          deleting={deleting}
        />
      )}
    </div>
  )
}
