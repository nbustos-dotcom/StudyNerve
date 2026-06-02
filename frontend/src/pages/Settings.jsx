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

// BYOK providers (shown only inside the collapsed "Advanced" disclosure).
// Normal users get the free hosted AI — they don't pick a provider.
const BYOK_PROVIDERS = [
  { value: 'gemini',    label: 'Google Gemini',      apiKeyUrl: 'https://aistudio.google.com/apikey' },
  { value: 'groq',      label: 'Groq',               apiKeyUrl: 'https://console.groq.com/keys' },
  { value: 'openai',    label: 'OpenAI',             apiKeyUrl: 'https://platform.openai.com/api-keys' },
  { value: 'anthropic', label: 'Claude (Anthropic)', apiKeyUrl: 'https://console.anthropic.com/settings/keys' },
  { value: 'ollama',    label: 'Local Ollama',       apiKeyUrl: null },
]

function SectionCard({ title, children }) {
  return (
    <div className="card-solid mb-5 overflow-hidden">
      <div className="px-5 pt-4 pb-2">
        <h2 className="text-[11px] font-semibold text-ink-muted uppercase tracking-[0.08em]">{title}</h2>
      </div>
      <div className="px-5 pb-5">{children}</div>
    </div>
  )
}

function DeleteAccountModal({ onConfirm, onCancel, deleting }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)' }}
    >
      <div
        className="rounded-2xl p-6 max-w-md w-full mx-4"
        style={{
          background: '#18181b',
          border: '1px solid rgba(239,68,68,0.2)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
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
            <h3 className="text-base font-semibold text-ink-primary">Delete Account</h3>
            <p className="text-xs text-ink-muted mt-0.5">This cannot be undone</p>
          </div>
        </div>

        <p className="text-sm text-ink-muted mb-6 leading-relaxed">
          This permanently deletes your account and <span className="text-ink-secondary">all your data</span> — notes, quiz history, chat sessions, AI insights, vision boards, and settings. There is no recovery.
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
      style={{ background: 'rgba(0,0,0,0.75)' }}
    >
      <div
        className="rounded-2xl p-6 max-w-md w-full mx-4"
        style={{
          background: '#18181b',
          border: '1px solid rgba(239,68,68,0.2)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
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
            <h3 className="text-base font-semibold text-ink-primary">Clear AI Memory</h3>
            <p className="text-xs text-ink-muted mt-0.5">This cannot be undone</p>
          </div>
        </div>

        <p className="text-sm text-ink-muted mb-6 leading-relaxed">
          This will erase everything the AI has learned about you from past conversations — your learning patterns, strengths, weak spots, and preferences. Your notes, quizzes, and chat history are <span className="text-ink-secondary">not</span> deleted. The AI just starts learning you from scratch.
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

  // ── Provider state (BYOK — server-side key is the default) ──────────────────
  const [currentSettings, setCurrentSettings] = useState(null)
  const [byokProvider, setByokProvider] = useState('gemini')
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
      // Only mirror the stored provider into the BYOK picker when a key is set;
      // otherwise leave the default so stale local-dev values (e.g. 'ollama')
      // don't get re-saved when the user toggles BYOK on.
      if (s.llm_api_key_set && s.llm_provider) setByokProvider(s.llm_provider)
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
    if (!apiKey.trim()) return
    setProviderSaving(true)
    setProviderMsg(null)
    try {
      const result = await api.saveProvider({ provider: byokProvider, api_key: apiKey.trim() })
      setCurrentSettings(result)
      setApiKey('')
      setProviderMsg({ ok: true, text: 'API key saved — you’re on the unlimited tier.' })
    } catch (err) {
      setProviderMsg({ ok: false, text: err.message })
    } finally {
      setProviderSaving(false)
    }
  }

  async function clearByokKey() {
    setProviderSaving(true)
    setProviderMsg(null)
    try {
      const result = await api.saveProvider({ provider: byokProvider, api_key: '' })
      setCurrentSettings(result)
      setApiKey('')
      setProviderMsg({ ok: true, text: 'Your API key was removed — back on the free hosted tier.' })
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

  const byokActive = !!currentSettings?.llm_api_key_set
  const savedProviderLabel = BYOK_PROVIDERS.find((p) => p.value === currentSettings?.llm_provider)?.label
    ?? currentSettings?.llm_provider
  const byokMeta = BYOK_PROVIDERS.find((p) => p.value === byokProvider)
  const keyPlaceholderForSaved =
    byokActive && currentSettings?.llm_provider === byokProvider
      ? '••••••••••••••••'
      : 'Paste your API key'

  return (
    <div className="p-4 sm:p-8 max-w-2xl mx-auto fade-in-up">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink-primary">Settings</h1>
        <p className="text-sm text-ink-muted mt-1">Manage your AI and connected apps.</p>
      </div>

      {/* ── AI Provider ───────────────────────────────────────────────────────── */}
      <SectionCard title="AI">
        {/* Status row — shown to all users */}
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={
              byokActive
                ? { background: 'rgba(52,211,153,0.85)', boxShadow: '0 0 8px rgba(52,211,153,0.7)' }
                : { background: 'rgba(99,102,241,0.85)', boxShadow: '0 0 6px rgba(99,102,241,0.9)' }
            }
          />
          <span className="text-xs text-ink-muted">
            {byokActive ? (
              <>
                <span className="text-emerald-300 font-medium">Unlimited</span>
                <span className="text-ink-faint"> · using your own {savedProviderLabel} key</span>
              </>
            ) : (
              <>
                <span className="text-ink-secondary font-medium">Free hosted AI</span>
                <span className="text-ink-faint"> · included with your account</span>
              </>
            )}
          </span>
        </div>

        {/* Collapsed advanced disclosure — preserves BYOK upgrade path */}
        <details
          open={byokActive}
          className="group rounded-xl"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <summary className="cursor-pointer select-none px-4 py-3 text-xs text-ink-muted hover:text-ink-secondary transition-colors flex items-center gap-2">
            <svg
              className="w-3 h-3 transition-transform group-open:rotate-90"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 2l4 4-4 4" />
            </svg>
            Advanced — use your own API key (unlimited)
          </summary>

          <form onSubmit={saveProvider} className="space-y-4 px-4 pt-2 pb-4">
            <p className="text-[11px] text-ink-faint leading-relaxed">
              Bring your own provider key to bypass the shared free-tier limit. Your key is stored encrypted and used only for your account.
            </p>

            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1.5">Provider</label>
              <select
                className="input"
                value={byokProvider}
                onChange={(e) => setByokProvider(e.target.value)}
              >
                {BYOK_PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              {byokMeta?.apiKeyUrl && (
                <a
                  href={byokMeta.apiKeyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-accent hover:text-accent-hover transition mt-1.5 inline-block"
                >
                  Get a key →
                </a>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1.5">
                API Key
                {byokActive && currentSettings?.llm_provider === byokProvider && (
                  <span className="text-ink-faint font-normal ml-1.5">— leave blank to keep existing key</span>
                )}
              </label>
              <div className="relative">
                <input
                  className="input font-mono text-xs tracking-wider pr-10"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={keyPlaceholderForSaved}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-muted transition-colors"
                  tabIndex={-1}
                >
                  <EyeIcon open={showApiKey} />
                </button>
              </div>
            </div>

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

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={providerSaving || !apiKey.trim()}
                className="btn-primary"
              >
                {providerSaving ? <><Spinner size="sm" />Saving…</> : (byokActive ? 'Update Key' : 'Save Key')}
              </button>
              {byokActive && (
                <button
                  type="button"
                  onClick={clearByokKey}
                  disabled={providerSaving}
                  className="text-xs text-ink-faint hover:text-red-300 transition-colors"
                >
                  Remove key
                </button>
              )}
            </div>
          </form>
        </details>
      </SectionCard>

      {/* ── Canvas LMS ────────────────────────────────────────────────────────── */}
      <SectionCard title="Canvas LMS">
        {/* Status badge */}
        {currentSettings && (
          <div className="flex items-center gap-2 mb-5">
            <div
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${currentSettings.canvas_connected ? 'bg-emerald-400' : 'bg-zinc-600'}`}
              style={currentSettings.canvas_connected ? { boxShadow: '0 0 8px rgba(52,211,153,0.7)' } : {}}
            />
            <span className="text-xs text-ink-muted">
              {currentSettings.canvas_connected ? (
                <>
                  <span className="text-emerald-400 font-medium">Connected</span>
                  {currentSettings.canvas_url && (
                    <span className="text-ink-faint"> · {currentSettings.canvas_url.replace(/\/api\/v\d+\/?$/, '')}</span>
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
            <p className="text-[11px] text-ink-faint mt-1.5 leading-relaxed">
              Enter your university's Canvas domain — do <strong className="text-ink-muted">not</strong> include <code className="text-ink-muted">/api/v1</code>, we add that automatically.
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-muted transition-colors"
                tabIndex={-1}
              >
                <EyeIcon open={showCanvasToken} />
              </button>
            </div>
            <p className="text-[11px] text-ink-faint mt-1.5 leading-relaxed">
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
        <p className="text-sm text-ink-muted mb-4">
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
        <p className="text-sm text-ink-muted mb-4">
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
