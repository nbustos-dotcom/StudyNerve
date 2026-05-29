import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import Logo from './Logo'

const NAV_MAIN = [
  { to: '/',           label: 'Dashboard',  end: true },
  { to: '/notes',      label: 'Notes'                },
  { to: '/quiz',       label: 'Quiz'                 },
  { to: '/chat',       label: 'Tutor'                },
  { to: '/flashcards', label: 'Flashcards'           },
]

const NAV_MORE = [
  { to: '/canvas',   label: 'Canvas'      },
  { to: '/vision',   label: 'Vision Board'},
  { to: '/universe', label: 'My Universe' },
]

function useUsage() {
  const [usage, setUsage] = useState(null)
  useEffect(() => {
    api.getUsage().then(setUsage).catch(() => {})
    const t = setInterval(() => {
      api.getUsage().then(setUsage).catch(() => {})
    }, 60_000)
    return () => clearInterval(t)
  }, [])
  return usage
}

export default function Layout({ user, onLogout, onOpenPalette }) {
  const navigate = useNavigate()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const usage = useUsage()

  useEffect(() => {
    function handler(e) {
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); navigate('/notes') }
      if (e.key === 'q' || e.key === 'Q') { e.preventDefault(); navigate('/quiz') }
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); navigate('/chat') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])

  function handleLogout() {
    onLogout()
    navigate('/login')
  }

  return (
    <div className="relative min-h-screen">

      {/* ── Top navigation bar ──────────────────────────────────────────────── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 flex items-center px-4 md:px-6 bg-deep-bg"
        style={{
          height: 48,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* Brand */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Logo size={20} className="text-accent" />
          <span className="text-sm font-semibold text-ink-primary">StudyNerve</span>
        </div>

        {/* Nav links — centered, hidden on mobile */}
        <nav className="hidden md:flex items-center gap-0.5 mx-auto">
          {NAV_MAIN.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `px-3 py-1 rounded-md text-sm font-medium transition-colors duration-150 ${
                  isActive ? 'text-accent nav-active-glow' : 'text-ink-muted hover:text-ink-primary'
                }`
              }
            >
              {label}
            </NavLink>
          ))}

          {/* More dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowMore((v) => !v)}
              className="px-3 py-1 rounded-md text-sm font-medium text-ink-muted hover:text-ink-primary transition-colors duration-150 flex items-center gap-1"
            >
              More
              <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M3 5l3 3 3-3" />
              </svg>
            </button>
            {showMore && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowMore(false)} />
                <div
                  className="absolute top-full left-0 mt-1 w-40 rounded-lg py-1 z-40 bg-deep-elevated"
                  style={{ border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
                >
                  {NAV_MORE.map(({ to, label }) => (
                    <NavLink
                      key={to}
                      to={to}
                      onClick={() => setShowMore(false)}
                      className={({ isActive }) =>
                        `block px-3 py-2 text-sm transition-colors duration-150 ${
                          isActive ? 'text-accent' : 'text-ink-muted hover:text-ink-primary'
                        }`
                      }
                    >
                      {label}
                    </NavLink>
                  ))}
                </div>
              </>
            )}
          </div>
        </nav>

        {/* Right side */}
        <div className="hidden md:flex items-center gap-2 flex-shrink-0">

          {/* Ctrl+K hint */}
          <button
            onClick={onOpenPalette}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-ink-faint hover:text-ink-muted transition-colors duration-150"
            style={{ border: '1px solid rgba(255,255,255,0.06)', fontSize: 11 }}
            title="Quick actions (Ctrl+K)"
          >
            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="6" cy="6" r="4.5" /><path d="M9 9L11.5 11.5" />
            </svg>
            <kbd style={{ fontFamily: 'inherit', fontSize: 10 }}>⌘K</kbd>
          </button>

          {/* Usage indicator */}
          {usage && (() => {
            const pct = Math.min(100, (usage.tokens_used_today / usage.daily_limit) * 100)
            const barColor = pct >= 95 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#6366f1'
            return (
              <div className="flex items-center gap-1.5" title={`${usage.tokens_used_today.toLocaleString()} / ${usage.daily_limit.toLocaleString()} tokens today`}>
                <div style={{ width: 40, height: 2, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: barColor, transition: 'width 0.4s ease' }} />
                </div>
                {pct >= 95 && (
                  <span style={{ fontSize: 10, color: '#fca5a5' }}>Backup</span>
                )}
              </div>
            )
          })()}

          {/* Settings link */}
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `p-1.5 rounded-md transition-colors duration-150 ${isActive ? 'text-accent' : 'text-ink-muted hover:text-ink-primary'}`
            }
            title="Settings"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" />
              <path d="M13.4 9.6l.6-1.6-.6-1.6-1.6-.6-1-1.4V3l-1.6-.6L8 3l-1.2-.6L5.2 3v1.4l-1 1.4-1.6.6L2 8l.6 1.6 1.6.6 1 1.4V13l1.6.6L8 13l1.2.6 1.6-.6v-1.4l1-1.4 1.6-.6z" />
            </svg>
          </NavLink>

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu((v) => !v)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors duration-150 hover:bg-white/[0.04]"
              style={{ border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-accent flex-shrink-0"
                style={{ background: 'rgba(99,102,241,0.2)' }}
              >
                {user?.name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <span className="text-xs text-ink-secondary max-w-[80px] truncate">{user?.name}</span>
            </button>

            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowUserMenu(false)} />
                <div
                  className="absolute right-0 top-full mt-1 w-44 rounded-lg py-1 z-40 bg-deep-elevated"
                  style={{ border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
                >
                  <div className="px-3 py-2 border-b border-border-subtle">
                    <p className="text-xs font-medium text-ink-primary truncate">{user?.name}</p>
                    <p className="text-[10px] text-ink-faint truncate mt-0.5">{user?.email}</p>
                  </div>
                  <NavLink
                    to="/settings"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-ink-secondary hover:text-ink-primary transition-colors"
                  >
                    Settings
                  </NavLink>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400/60 hover:text-red-400 transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Hamburger — mobile only */}
        <button
          className="md:hidden ml-auto p-2 rounded-md text-ink-muted hover:text-ink-primary transition-colors"
          onClick={() => setShowMobileMenu((v) => !v)}
          aria-label="Toggle menu"
        >
          {showMobileMenu ? (
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M5 5l10 10M15 5l-10 10" />
            </svg>
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 6h14M3 10h14M3 14h14" />
            </svg>
          )}
        </button>
      </header>

      {/* ── Mobile slide-out nav ─────────────────────────────────────────────── */}
      {showMobileMenu && (
        <div
          className="md:hidden fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowMobileMenu(false)}
        />
      )}

      <div
        className={`md:hidden fixed top-0 left-0 bottom-0 z-50 w-64 flex flex-col transition-transform duration-200 ease-out bg-deep-surface ${
          showMobileMenu ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <span className="text-sm font-semibold text-ink-primary">StudyNerve</span>
          <button
            onClick={() => setShowMobileMenu(false)}
            className="p-1.5 rounded-md text-ink-muted hover:text-ink-primary transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <nav className="flex flex-col py-1 flex-1 overflow-y-auto">
          {[...NAV_MAIN, ...NAV_MORE].map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setShowMobileMenu(false)}
              className={({ isActive }) =>
                `px-4 py-3 text-sm font-medium transition-colors min-h-[48px] flex items-center ${
                  isActive ? 'text-accent bg-accent/10' : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.03]'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
          <NavLink
            to="/settings"
            onClick={() => setShowMobileMenu(false)}
            className={({ isActive }) =>
              `px-4 py-3 text-sm font-medium transition-colors min-h-[48px] flex items-center ${
                isActive ? 'text-accent bg-accent/10' : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.03]'
              }`
            }
          >
            Settings
          </NavLink>
        </nav>

        <div className="px-4 py-3 border-t border-border-subtle">
          <p className="text-xs font-medium text-ink-primary truncate">{user?.name}</p>
          <button
            onClick={() => { setShowMobileMenu(false); handleLogout() }}
            className="text-xs text-red-400/60 hover:text-red-400 transition-colors mt-1"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* ── Page content ────────────────────────────────────────────────────── */}
      <main className="pt-12 relative">
        <Outlet />
      </main>

    </div>
  )
}
