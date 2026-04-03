import { useEffect, useState } from 'react'
import { api } from '../api/client'

const PROVIDERS = [
  { value: 'ollama',    label: 'Local Ollama',      needsKey: false, hint: 'Runs on your machine — no API key required.' },
  { value: 'gemini',   label: 'Google Gemini',      needsKey: true,  hint: 'Uses gemini-2.0-flash.',            apiKeyUrl: 'https://aistudio.google.com/apikey',              apiKeyLabel: 'Get free key →' },
  { value: 'openai',   label: 'OpenAI',             needsKey: true,  hint: 'Uses gpt-4o-mini by default.',      apiKeyUrl: 'https://platform.openai.com/api-keys',            apiKeyLabel: 'Get key →' },
  { value: 'anthropic',label: 'Claude (Anthropic)', needsKey: true,  hint: 'Uses claude-sonnet-4.',             apiKeyUrl: 'https://console.anthropic.com/settings/keys',     apiKeyLabel: 'Get key →' },
  { value: 'groq',     label: 'Groq',               needsKey: true,  hint: 'Uses llama-3.1-8b-instant. Free tier available.', apiKeyUrl: 'https://console.groq.com/keys', apiKeyLabel: 'Get free key →' },
]

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

function SectionCard({ title, children }) {
  return (
    <div
      className="rounded-2xl p-6 mb-6"
      style={{
        background: 'rgba(15,15,35,0.45)',
        border: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <h2 className="text-sm font-semibold text-slate-200 mb-5">{title}</h2>
      {children}
    </div>
  )
}

export default function Settings() {
  // ── Provider state ───────────────────────────────────────────────────────────
  const [currentSettings, setCurrentSettings] = useState(null)
  const [provider, setProvider] = useState('ollama')
  const [apiKey, setApiKey] = useState('')
  const [providerSaving, setProviderSaving] = useState(false)
  const [providerMsg, setProviderMsg] = useState(null)

  // ── Canvas state ─────────────────────────────────────────────────────────────
  const [canvasUrl, setCanvasUrl] = useState('https://mtu.instructure.com/api/v1')
  const [canvasToken, setCanvasToken] = useState('')
  const [canvasSaving, setCanvasSaving] = useState(false)
  const [canvasMsg, setCanvasMsg] = useState(null)

  useEffect(() => { loadSettings() }, [])

  async function loadSettings() {
    try {
      const s = await api.getSettings()
      setCurrentSettings(s)
      setProvider(s.llm_provider || 'ollama')
      if (s.canvas_url) setCanvasUrl(s.canvas_url)
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
      setCanvasToken('')
      setCanvasMsg({ ok: true, text: 'Canvas settings saved.' })
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
      await api.saveCanvasSettings({ canvas_url: canvasUrl, canvas_token: '' })
      setCurrentSettings((prev) => ({ ...prev, canvas_connected: false }))
      setCanvasToken('')
      setCanvasMsg({ ok: true, text: 'Canvas disconnected.' })
    } catch (err) {
      setCanvasMsg({ ok: false, text: err.message })
    } finally {
      setCanvasSaving(false)
    }
  }

  const selectedMeta = PROVIDERS.find((p) => p.value === provider)

  return (
    <div className="p-4 sm:p-8 max-w-2xl mx-auto">
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
                style={{ background: 'rgba(99,102,241,0.8)', boxShadow: '0 0 6px rgba(99,102,241,0.9)' }}
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

          {/* Provider dropdown */}
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
                          background: 'rgba(99,102,241,0.15)',
                          border: '1px solid rgba(99,102,241,0.35)',
                          boxShadow: '0 0 16px rgba(99,102,241,0.1)',
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

          {/* API key input (only for cloud providers) */}
          {selectedMeta?.needsKey && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                API Key
                {currentSettings?.llm_api_key_set && currentSettings.llm_provider === provider && (
                  <span className="text-slate-600 font-normal ml-1.5">— leave blank to keep existing key</span>
                )}
              </label>
              <input
                className="input font-mono text-xs tracking-wider"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  currentSettings?.llm_api_key_set && currentSettings.llm_provider === provider
                    ? '••••••••••••••••'
                    : 'Paste your API key'
                }
                autoComplete="off"
              />
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

          <button
            type="submit"
            disabled={providerSaving}
            className="btn-primary"
          >
            {providerSaving ? <><Spinner />Saving…</> : 'Save Provider'}
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
                    <span className="text-slate-600"> · {currentSettings.canvas_url}</span>
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
            <label className="label">Canvas API URL</label>
            <input
              className="input"
              type="url"
              value={canvasUrl}
              onChange={(e) => setCanvasUrl(e.target.value)}
              placeholder="https://mtu.instructure.com/api/v1"
              required
            />
          </div>
          <div>
            <label className="label">API Token</label>
            <input
              className="input font-mono text-xs tracking-wide"
              type="password"
              value={canvasToken}
              onChange={(e) => setCanvasToken(e.target.value)}
              placeholder={currentSettings?.canvas_connected ? '••••••••' : 'Paste your Canvas access token'}
              autoComplete="off"
              required={!currentSettings?.canvas_connected}
            />
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

          <button
            type="submit"
            disabled={canvasSaving}
            className="btn-primary"
          >
            {canvasSaving ? (
              <><Spinner />{currentSettings?.canvas_connected ? 'Updating…' : 'Connecting…'}</>
            ) : (
              currentSettings?.canvas_connected ? 'Update Token' : 'Connect to Canvas'
            )}
          </button>
        </form>
      </SectionCard>
    </div>
  )
}
