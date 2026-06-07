import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import Logo from '../components/Logo'

export default function Login({ onAuth }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialMode = searchParams.get('signup') === '1' ? 'register' : 'login'
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  // Signup-only: gates `register` submit. Required by both the HTML5
  // `required` attribute on the checkbox and a JS guard below — login flow
  // never reads this state.
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (mode === 'register' && !acceptedTerms) {
      setError('Please agree to the Terms of Service and Privacy Policy to continue.')
      return
    }
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
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm fade-in-up">
        {/* Brand */}
        <div className="text-center mb-6">
          <Logo size={48} className="text-accent mx-auto mb-4" />
          <h1 className="text-xl font-bold text-ink-primary">StudyNerve AI</h1>
          <p className="text-sm text-ink-muted mt-1">Your personal AI tutor</p>
        </div>

        {/* Card */}
        <div className="bg-deep-surface border border-border-subtle rounded-lg p-8">
          {/* Mode toggle */}
          <div className="flex mb-6 p-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {['login', 'register'].map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null) }}
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors duration-150 ${
                  mode === m ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink-secondary'
                }`}
              >
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-ink-secondary mb-1.5">Your name</label>
                <input
                  className="input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Smith"
                  required
                  autoFocus
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-ink-secondary mb-1.5">Email</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@university.edu"
                required
                autoFocus={mode === 'login'}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-secondary mb-1.5">Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
              />
              {mode === 'register' && (
                <p className="text-[11px] text-ink-faint mt-1">Minimum 8 characters</p>
              )}
            </div>

            {mode === 'register' && (
              <div className="flex items-start gap-2.5 pt-1">
                <input
                  id="accept-terms"
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  required
                  className="mt-0.5 w-4 h-4 rounded accent-accent flex-shrink-0 cursor-pointer"
                />
                <label
                  htmlFor="accept-terms"
                  className="text-xs text-ink-muted leading-snug cursor-pointer select-none"
                >
                  I agree to the{' '}
                  <Link
                    to="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:text-accent-hover underline underline-offset-2"
                  >
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link
                    to="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:text-accent-hover underline underline-offset-2"
                  >
                    Privacy Policy
                  </Link>
                </label>
              </div>
            )}

            {error && (
              <div className="rounded-md px-3 py-2.5 text-xs text-red-300" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (mode === 'register' && !acceptedTerms)}
              className="btn-primary w-full py-2 font-medium"
            >
              {loading
                ? mode === 'login' ? 'Signing in…' : 'Creating account…'
                : mode === 'login' ? 'Sign in' : 'Create account'
              }
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-ink-faint mt-5">
          Your data stays local. No tracking, no ads.
        </p>
        <div className="flex justify-center gap-5 mt-3">
          <Link to="/terms" className="text-xs text-ink-faint hover:text-ink-muted transition-colors">
            Terms of Service
          </Link>
          <Link to="/privacy" className="text-xs text-ink-faint hover:text-ink-muted transition-colors">
            Privacy Policy
          </Link>
        </div>
      </div>
    </div>
  )
}
