import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import NeuralNetIcon from '../components/NeuralNetIcon'

const glassCard = {
  background: 'rgba(15, 15, 35, 0.6)',
  backdropFilter: 'blur(32px)',
  WebkitBackdropFilter: 'blur(32px)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  boxShadow: '0 8px 48px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
}

const inputStyle = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#e2e8f0',
  borderRadius: '10px',
  padding: '10px 14px',
  width: '100%',
  fontSize: '14px',
  outline: 'none',
  transition: 'border-color 0.15s',
}

const btnPrimary = {
  background: 'linear-gradient(135deg, var(--indigo-500) 0%, var(--violet-600) 100%)',
  boxShadow: '0 4px 20px rgba(var(--indigo-500-rgb),0.4)',
  color: '#fff',
  border: 'none',
  borderRadius: '10px',
  padding: '11px 0',
  width: '100%',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'opacity 0.15s, transform 0.1s',
}

export default function Login({ onAuth }) {
  const navigate = useNavigate()
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      let result
      if (mode === 'login') {
        result = await api.login({ email, password })
      } else {
        result = await api.register({ email, password, name })
      }

      localStorage.setItem('mt_token', result.access_token)
      localStorage.setItem('mt_user', JSON.stringify(result.user))
      onAuth(result.user)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(var(--indigo-500-rgb),0.12) 0%, transparent 70%)' }}
    >
      {/* Ambient orbs */}
      <div
        className="fixed pointer-events-none"
        style={{
          width: 520, height: 520, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(var(--indigo-500-rgb),0.07) 0%, transparent 70%)',
          top: -120, left: '50%', transform: 'translateX(-50%)',
        }}
      />

      <div className="w-full max-w-[400px] fade-in-up">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <NeuralNetIcon size={48} idPrefix="login" />
          <div className="text-center">
            <h1
              className="text-2xl font-bold tracking-tight bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(115deg, #a5b4fc 0%, #c4b5fd 45%, var(--indigo-400) 100%)' }}
            >
              StudyNerve AI
            </h1>
            <p className="text-sm text-slate-500 mt-1">Your personal AI tutor</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-7" style={glassCard}>
          {/* Mode toggle */}
          <div
            className="flex mb-6 p-0.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            {['login', 'register'].map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null) }}
                className="flex-1 py-2 text-sm font-medium rounded-[10px] transition-all duration-200"
                style={
                  mode === m
                    ? {
                        background: 'rgba(var(--indigo-500-rgb),0.2)',
                        border: '1px solid rgba(var(--indigo-500-rgb),0.3)',
                        color: '#a5b4fc',
                        boxShadow: '0 2px 12px rgba(var(--indigo-500-rgb),0.15)',
                      }
                    : { color: 'rgba(255,255,255,0.35)', border: '1px solid transparent' }
                }
              >
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Your name</label>
                <input
                  style={inputStyle}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Smith"
                  required
                  autoFocus
                  onFocus={(e) => (e.target.style.borderColor = 'rgba(var(--indigo-500-rgb),0.5)')}
                  onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
              <input
                style={inputStyle}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@university.edu"
                required
                autoFocus={mode === 'login'}
                onFocus={(e) => (e.target.style.borderColor = 'rgba(var(--indigo-500-rgb),0.5)')}
                onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
              <input
                style={inputStyle}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                onFocus={(e) => (e.target.style.borderColor = 'rgba(var(--indigo-500-rgb),0.5)')}
                onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
              />
              {mode === 'register' && (
                <p className="text-[11px] text-slate-600 mt-1">Minimum 8 characters</p>
              )}
            </div>

            {error && (
              <div
                className="rounded-lg px-3 py-2.5 text-xs text-red-300"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={btnPrimary}
              onMouseEnter={(e) => !loading && (e.target.style.opacity = '0.88')}
              onMouseLeave={(e) => (e.target.style.opacity = '1')}
            >
              {loading
                ? mode === 'login' ? 'Signing in…' : 'Creating account…'
                : mode === 'login' ? 'Sign in' : 'Create account'
              }
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-700 mt-5">
          Your data stays local. No tracking, no ads.
        </p>
        <div className="flex justify-center gap-5 mt-3">
          <Link to="/terms" className="text-xs text-slate-700 hover:text-slate-500 transition-colors">
            Terms of Service
          </Link>
          <Link to="/privacy" className="text-xs text-slate-700 hover:text-slate-500 transition-colors">
            Privacy Policy
          </Link>
        </div>
      </div>
    </div>
  )
}
