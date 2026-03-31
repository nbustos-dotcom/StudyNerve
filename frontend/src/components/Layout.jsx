import { Outlet, NavLink } from 'react-router-dom'

const NAV = [
  { to: '/',           label: 'Dashboard', end: true },
  { to: '/notes',      label: 'Notes'               },
  { to: '/quiz',       label: 'Quiz'                },
  { to: '/chat',       label: 'Tutor'               },
  { to: '/results',    label: 'Results'             },
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

export default function Layout() {
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
        </nav>

        {/* Right: Ollama badge */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: 'rgba(99,102,241,0.7)', boxShadow: '0 0 5px rgba(99,102,241,0.9)' }}
          />
          <span className="text-[11px] text-white/30 tracking-wide whitespace-nowrap">
            Powered by Ollama
          </span>
        </div>
      </header>

      {/* ── Page content ────────────────────────────────────────────────────── */}
      {/* pt-16 clears the fixed 64px nav. Pages handle their own max-width/padding. */}
      <main className="pt-16">
        <Outlet />
      </main>
    </div>
  )
}
