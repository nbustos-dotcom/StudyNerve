import { useState } from 'react'
import { api } from '../api/client'

const WIZARD_PROVIDERS = [
  { value: 'groq',      label: 'Groq',             badge: 'Recommended · Free', badgeColor: '#34d399', url: 'https://console.groq.com/keys' },
  { value: 'gemini',    label: 'Google Gemini',     badge: 'Free',               badgeColor: '#34d399', url: 'https://aistudio.google.com/apikey' },
  { value: 'openai',    label: 'OpenAI',            badge: 'Paid',               badgeColor: '#64748b', url: 'https://platform.openai.com/api-keys' },
  { value: 'anthropic', label: 'Anthropic Claude',  badge: 'Paid',               badgeColor: '#64748b', url: 'https://console.anthropic.com/settings/keys' },
]

const TOTAL_STEPS = 5

// ── Step components ───────────────────────────────────────────────────────────

function StepWelcome() {
  return (
    <div>
      <div style={{
        width: 56, height: 56, borderRadius: '16px',
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        boxShadow: '0 8px 32px rgba(99,102,241,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '28px',
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <path d="M12 3a8 8 0 100 16A8 8 0 0012 3z" />
          <path d="M12 7v5l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <h1 style={{
        fontSize: '26px', fontWeight: 700, letterSpacing: '-0.02em',
        background: 'linear-gradient(115deg, #a5b4fc 0%, #c4b5fd 45%, #818cf8 100%)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        marginBottom: '16px', fontFamily: "'Sora', sans-serif",
      }}>
        Welcome to Master Teacher
      </h1>

      <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.7, marginBottom: '16px' }}>
        Your personal AI tutor that learns how{' '}
        <span style={{ color: '#a5b4fc', fontWeight: 600 }}>you</span> study.
      </p>
      <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.38)', lineHeight: 1.8 }}>
        It tracks your weak areas, adapts to how you talk, and gets smarter the more you use it.
      </p>
    </div>
  )
}

function StepHowItWorks() {
  const cards = [
    {
      title: 'Add Your Notes',
      desc: 'Paste lecture notes and AI extracts topics automatically.',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
        </svg>
      ),
    },
    {
      title: 'Take Smart Quizzes',
      desc: 'Adaptive quizzes target your weakest areas first.',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      ),
    },
    {
      title: 'Chat with Your Tutor',
      desc: 'AI tutor that remembers your history and adapts to your style.',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      ),
    },
  ]

  return (
    <div>
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'rgba(255,255,255,0.92)', marginBottom: '8px', fontFamily: "'Sora', sans-serif" }}>
        How it works
      </h2>
      <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.35)', marginBottom: '28px' }}>
        Three simple steps to smarter studying.
      </p>

      <div style={{ display: 'flex', gap: '12px' }}>
        {cards.map((card) => (
          <div key={card.title} style={{
            flex: 1, padding: '20px 14px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
          }}>
            <div style={{ marginBottom: '12px' }}>{card.icon}</div>
            <p style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: '6px', lineHeight: 1.4 }}>
              {card.title}
            </p>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.38)', lineHeight: 1.6 }}>
              {card.desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function StepConnectAI({ provider, setProvider, apiKey, setApiKey }) {
  return (
    <div>
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'rgba(255,255,255,0.92)', marginBottom: '8px', fontFamily: "'Sora', sans-serif" }}>
        Connect Your AI
      </h2>
      <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.38)', marginBottom: '24px', lineHeight: 1.6 }}>
        You need an API key to power the AI features. Pick one (Groq is free and fast), create a key at the link below, and paste it here.
      </p>

      {/* Provider cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px' }}>
        {WIZARD_PROVIDERS.map((p) => {
          const isSelected = provider === p.value
          return (
            <div
              key={p.value}
              onClick={() => setProvider(p.value)}
              style={{
                padding: '14px',
                background: isSelected ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isSelected ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: isSelected ? '#a5b4fc' : 'rgba(255,255,255,0.65)' }}>
                  {p.label}
                </p>
                {isSelected && (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', boxShadow: '0 0 6px rgba(99,102,241,0.8)', flexShrink: 0 }} />
                )}
              </div>
              <p style={{ fontSize: '11px', color: p.badgeColor, marginBottom: '6px' }}>{p.badge}</p>
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ fontSize: '11px', color: '#818cf8', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#a5b4fc')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#818cf8')}
              >
                Get API key →
              </a>
            </div>
          )
        })}
      </div>

      {/* API key input */}
      <div>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.35)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Paste your API key
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-… or gsk_…"
          autoComplete="off"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#e2e8f0',
            borderRadius: '10px',
            padding: '10px 14px',
            width: '100%',
            fontSize: '13px',
            outline: 'none',
            fontFamily: 'monospace',
            letterSpacing: '0.05em',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s',
          }}
          onFocus={(e) => (e.target.style.borderColor = 'rgba(99,102,241,0.5)')}
          onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
        />
        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.22)', marginTop: '6px' }}>
          You can also skip this and add it later in Settings.
        </p>
      </div>
    </div>
  )
}

function StepCanvas({ canvasUrl, setCanvasUrl, canvasToken, setCanvasToken }) {
  return (
    <div>
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'rgba(255,255,255,0.92)', marginBottom: '8px', fontFamily: "'Sora', sans-serif" }}>
        Connect Canvas{' '}
        <span style={{ fontSize: '14px', fontWeight: 400, color: 'rgba(255,255,255,0.3)' }}>(Optional)</span>
      </h2>
      <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.38)', marginBottom: '28px', lineHeight: 1.6 }}>
        Link your university's Canvas LMS to automatically import courses and assignments.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.35)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Canvas API URL
          </label>
          <input
            type="url"
            value={canvasUrl}
            onChange={(e) => setCanvasUrl(e.target.value)}
            placeholder="https://university.instructure.com/api/v1"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#e2e8f0',
              borderRadius: '10px',
              padding: '10px 14px',
              width: '100%',
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'rgba(99,102,241,0.5)')}
            onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.35)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Access Token
          </label>
          <input
            type="password"
            value={canvasToken}
            onChange={(e) => setCanvasToken(e.target.value)}
            placeholder="Paste your Canvas access token"
            autoComplete="off"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#e2e8f0',
              borderRadius: '10px',
              padding: '10px 14px',
              width: '100%',
              fontSize: '13px',
              outline: 'none',
              fontFamily: 'monospace',
              boxSizing: 'border-box',
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'rgba(99,102,241,0.5)')}
            onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
          />
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.22)', marginTop: '6px' }}>
            Canvas → Account → Settings → Approved Integrations → New Access Token
          </p>
        </div>
      </div>
    </div>
  )
}

function StepReady() {
  return (
    <div style={{ textAlign: 'center', paddingTop: '8px' }}>
      <div style={{
        width: 72, height: 72, borderRadius: '20px', margin: '0 auto 28px',
        background: 'rgba(52,211,153,0.12)',
        border: '1px solid rgba(52,211,153,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
          <path d="M22 4L12 14.01l-3-3" />
        </svg>
      </div>

      <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'rgba(255,255,255,0.92)', marginBottom: '16px', fontFamily: "'Sora', sans-serif" }}>
        You&apos;re Ready!
      </h2>
      <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, maxWidth: '340px', margin: '0 auto' }}>
        Start by adding your first set of study notes. Master Teacher will take it from there.
      </p>
    </div>
  )
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export default function OnboardingWizard({ onComplete }) {
  const [step, setStep] = useState(0)
  const [transitioning, setTransitioning] = useState(false)
  const [dir, setDir] = useState(1)
  const [provider, setProvider] = useState('groq')
  const [apiKey, setApiKey] = useState('')
  const [canvasUrl, setCanvasUrl] = useState('')
  const [canvasToken, setCanvasToken] = useState('')
  const [saving, setSaving] = useState(false)

  function navigateTo(target) {
    if (transitioning) return
    setDir(target > step ? 1 : -1)
    setTransitioning(true)
    setTimeout(() => {
      setStep(target)
      setTransitioning(false)
    }, 210)
  }

  async function handleContinue() {
    // Step 2: save provider + key if entered
    if (step === 2 && apiKey.trim()) {
      setSaving(true)
      try {
        await api.saveProvider({ provider, api_key: apiKey.trim() })
      } catch {
        // fail silently — user can set in Settings
      }
      setSaving(false)
    }
    // Step 3: save Canvas if both fields filled
    if (step === 3 && canvasUrl.trim() && canvasToken.trim()) {
      setSaving(true)
      try {
        await api.saveCanvasSettings({ canvas_url: canvasUrl, canvas_token: canvasToken })
      } catch {}
      setSaving(false)
    }
    if (step === TOTAL_STEPS - 1) {
      onComplete()
    } else {
      navigateTo(step + 1)
    }
  }

  const contentStyle = {
    transition: 'opacity 0.21s ease, transform 0.21s ease',
    opacity: transitioning ? 0 : 1,
    transform: transitioning ? `translateX(${dir * 28}px)` : 'translateX(0)',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(4,4,18,0.88)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
    }}>
      <div style={{
        background: 'rgba(11,11,28,0.97)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        border: '1px solid rgba(255,255,255,0.09)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)',
        borderRadius: '24px',
        width: '100%', maxWidth: '560px',
        maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
      }}>

        {/* Skip all — hidden on final step */}
        {step < TOTAL_STEPS - 1 && (
          <button
            onClick={onComplete}
            style={{
              position: 'absolute', top: 18, right: 18, zIndex: 10,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.09)',
              color: 'rgba(255,255,255,0.3)',
              borderRadius: '8px', padding: '5px 14px',
              fontSize: '12px', cursor: 'pointer',
            }}
          >
            Skip
          </button>
        )}

        {/* Scrollable step content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '44px 40px 28px', scrollbarWidth: 'none' }}>
          <div style={contentStyle}>
            {step === 0 && <StepWelcome />}
            {step === 1 && <StepHowItWorks />}
            {step === 2 && (
              <StepConnectAI
                provider={provider} setProvider={setProvider}
                apiKey={apiKey} setApiKey={setApiKey}
              />
            )}
            {step === 3 && (
              <StepCanvas
                canvasUrl={canvasUrl} setCanvasUrl={setCanvasUrl}
                canvasToken={canvasToken} setCanvasToken={setCanvasToken}
              />
            )}
            {step === 4 && <StepReady />}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          flexShrink: 0,
          padding: '18px 40px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '12px',
        }}>
          {/* Progress dots */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div key={i} style={{
                height: '6px',
                width: i === step ? '20px' : '6px',
                borderRadius: '3px',
                background: i === step ? '#6366f1' : i < step ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)',
                transition: 'all 0.25s ease',
                flexShrink: 0,
              }} />
            ))}
          </div>

          {/* Navigation buttons */}
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            {step > 0 && (
              <button
                onClick={() => navigateTo(step - 1)}
                disabled={transitioning || saving}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  color: 'rgba(255,255,255,0.42)',
                  borderRadius: '10px', padding: '9px 16px',
                  fontSize: '13px', cursor: 'pointer',
                  opacity: (transitioning || saving) ? 0.5 : 1,
                }}
              >
                Back
              </button>
            )}
            {/* "Skip for now" on Canvas step */}
            {step === 3 && (
              <button
                onClick={() => navigateTo(step + 1)}
                disabled={transitioning || saving}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  color: 'rgba(255,255,255,0.42)',
                  borderRadius: '10px', padding: '9px 16px',
                  fontSize: '13px', cursor: 'pointer',
                  opacity: (transitioning || saving) ? 0.5 : 1,
                }}
              >
                Skip for now
              </button>
            )}
            <button
              onClick={handleContinue}
              disabled={transitioning || saving}
              style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
                color: '#fff', border: 'none',
                borderRadius: '10px', padding: '9px 20px',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                opacity: (transitioning || saving) ? 0.65 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {saving ? 'Saving…' : step === TOTAL_STEPS - 1 ? 'Go to Dashboard →' : 'Continue →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
