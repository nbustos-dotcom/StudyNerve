import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { api } from '../api/client'

const NAV = [
  { to: '/',        label: 'Dashboard', end: true },
  { to: '/notes',   label: 'Notes'               },
  { to: '/quiz',    label: 'Quiz'                },
  { to: '/chat',    label: 'Tutor'               },
  { to: '/results', label: 'Results'             },
  { to: '/canvas',  label: 'Canvas'              },
  { to: '/vision',  label: 'Vision'              },
]


const navbarStyle = {
  background: 'rgba(10, 10, 26, 0.72)',
  backdropFilter: 'blur(28px)',
  WebkitBackdropFilter: 'blur(28px)',
  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
}

const activePillStyle = {
  background: 'rgba(99, 102, 241, 0.18)',
  border: '1px solid rgba(99, 102, 241, 0.32)',
  boxShadow: '0 0 18px rgba(99, 102, 241, 0.18), inset 0 1px 0 rgba(255,255,255,0.07)',
}

const inactivePillStyle = {
  border: '1px solid transparent',
}

export default function Layout({ user, onLogout }) {
  const navigate = useNavigate()
  const [showUserMenu, setShowUserMenu] = useState(false)

  function handleLogout() {
    onLogout()
    navigate('/login')
  }

  return (
    <div className="relative z-10 min-h-screen">

      {/* ── Top navigation bar ──────────────────────────────────────────────── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center px-6"
        style={navbarStyle}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              boxShadow: '0 3px 14px rgba(99,102,241,0.45), inset 0 1px 0 rgba(255,255,255,0.2)',
            }}
          >
            <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M8 2a5.5 5.5 0 100 11A5.5 5.5 0 008 2z" />
              <path d="M8 5v3l1.8 1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span
            className="text-base font-bold tracking-tight bg-clip-text text-transparent"
            style={{
              backgroundImage: 'linear-gradient(115deg, #a5b4fc 0%, #c4b5fd 45%, #818cf8 100%)',
              fontFamily: "'Sora', sans-serif",
            }}
          >
            Master Teacher
          </span>
        </div>

        {/* Nav links — centered */}
        <nav className="flex items-center gap-1 mx-auto">
          {NAV.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive ? 'text-indigo-300' : 'text-white/50 hover:text-white/80'
                }`
              }
              style={({ isActive }) => (isActive ? activePillStyle : inactivePillStyle)}
            >
              {label}
            </NavLink>
          ))}
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive ? 'text-indigo-300' : 'text-white/50 hover:text-white/80'
              }`
            }
            style={({ isActive }) => (isActive ? activePillStyle : inactivePillStyle)}
            title="Settings"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" />
              <path d="M13.4 9.6l.6-1.6-.6-1.6-1.6-.6-1-1.4V3l-1.6-.6L8 3l-1.2-.6L5.2 3v1.4l-1 1.4-1.6.6L2 8l.6 1.6 1.6.6 1 1.4V13l1.6.6L8 13l1.2.6 1.6-.6v-1.4l1-1.4 1.6-.6z" />
            </svg>
          </NavLink>
        </nav>

        {/* Right: provider badge + user */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Provider indicator */}
          <div className="flex items-center gap-1.5">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: 'rgba(99,102,241,0.7)', boxShadow: '0 0 5px rgba(99,102,241,0.9)' }}
            />
            <span className="text-[11px] text-white/30 tracking-wide whitespace-nowrap">
              Powered by AI
            </span>
          </div>

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu((v) => !v)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all duration-150"
              style={{
                background: showUserMenu ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-indigo-300 flex-shrink-0"
                style={{ background: 'rgba(99,102,241,0.25)' }}
              >
                {user?.name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <span className="text-xs text-white/60 max-w-[96px] truncate">{user?.name}</span>
              <svg className="w-3 h-3 text-white/30" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M3 5l3 3 3-3" />
              </svg>
            </button>

            {showUserMenu && (
              <div
                className="absolute right-0 top-full mt-1.5 w-44 rounded-xl py-1 z-50"
                style={{
                  background: 'rgba(12,12,28,0.95)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                }}
              >
                <div className="px-3 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                  <p className="text-xs font-medium text-slate-300 truncate">{user?.name}</p>
                  <p className="text-[10px] text-slate-600 truncate mt-0.5">{user?.email}</p>
                </div>
                <NavLink
                  to="/settings"
                  onClick={() => setShowUserMenu(false)}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" />
                    <path d="M13.4 9.6l.6-1.6-.6-1.6-1.6-.6-1-1.4V3l-1.6-.6L8 3l-1.2-.6L5.2 3v1.4l-1 1.4-1.6.6L2 8l.6 1.6 1.6.6 1 1.4V13l1.6.6L8 13l1.2.6 1.6-.6v-1.4l1-1.4 1.6-.6z" />
                  </svg>
                  Settings
                </NavLink>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400/70 hover:text-red-400 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 3H3a1 1 0 00-1 1v8a1 1 0 001 1h3M10 11l3-3-3-3M14 8H6" />
                  </svg>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Overlay to close menu */}
      {showUserMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
      )}

      {/* ── Page content ────────────────────────────────────────────────────── */}
      <main className="pt-16">
        <Outlet />
      </main>
    </div>
  )
}
