import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import OnboardingWizard from './components/OnboardingWizard'
import CommandPalette from './components/CommandPalette'
import { ToastProvider } from './components/Toast'
import WarmingBanner from './components/WarmingBanner'
import Canvas from './pages/Canvas'
import Flashcards from './pages/Flashcards'
import Chat from './pages/Chat'
import Dashboard from './pages/Dashboard'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Notes from './pages/Notes'
import StudyGuide from './pages/StudyGuide'
import Quiz from './pages/Quiz'
import Settings from './pages/Settings'
import VisionBoard from './pages/VisionBoard'
import StudyUniverse from './pages/StudyUniverse'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'

// Per-user onboarding flag. Keyed by user.id so each account on a shared
// browser gets its own flag and clearing one user doesn't affect others.
// Move to a backend flag (e.g. users.onboarded_at) if cross-device behavior
// is needed later.
function onboardedKey(userId) {
  return `mt_onboarded:${userId}`
}

function hasSeenOnboarding(userId) {
  if (userId == null) return false
  try {
    if (localStorage.getItem(onboardedKey(userId))) return true
    // Migrate the legacy global flag to this user, one-shot
    if (localStorage.getItem('mt_onboarded')) {
      localStorage.setItem(onboardedKey(userId), '1')
      return true
    }
  } catch {}
  return false
}

function useAuth() {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('mt_user')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  const [showWizard, setShowWizard] = useState(() => {
    try {
      const stored = localStorage.getItem('mt_user')
      if (!stored) return false
      const u = JSON.parse(stored)
      return !hasSeenOnboarding(u?.id)
    } catch {
      return false
    }
  })

  function handleAuth(userData) {
    setUser(userData)
    setShowWizard(!hasSeenOnboarding(userData?.id))
  }

  function handleLogout() {
    localStorage.removeItem('mt_token')
    localStorage.removeItem('mt_user')
    setUser(null)
  }

  function handleWizardComplete() {
    if (user?.id != null) {
      try { localStorage.setItem(onboardedKey(user.id), '1') } catch {}
    }
    setShowWizard(false)
  }

  return { user, showWizard, handleAuth, handleLogout, handleWizardComplete }
}

// ── Keyboard shortcut registry ────────────────────────────────────────────────

function useGlobalShortcuts(onOpenPalette, onShowHelp) {
  useEffect(() => {
    function handler(e) {
      const active = document.activeElement
      const inInput = active && (
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.isContentEditable
      )

      // Ctrl+K / Cmd+K — command palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        onOpenPalette()
        return
      }

      if (inInput) return

      // Single-key shortcuts (only when not in an input)
      if (e.key === '?') { e.preventDefault(); onShowHelp(); return }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onOpenPalette, onShowHelp])
}

// ── Shortcut help overlay ────────────────────────────────────────────────────

function ShortcutHelp({ open, onClose }) {
  useEffect(() => {
    if (!open) return
    function handler(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const shortcuts = [
    ['Ctrl+K / ⌘K', 'Open command palette'],
    ['N', 'Notes'],
    ['Q', 'Quiz'],
    ['T', 'Tutor'],
    ['?', 'Show this help'],
    ['Esc', 'Close palette / help'],
  ]

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(0,0,0,0.55)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 9995, width: 340, borderRadius: 10,
        background: '#18181b', border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        padding: '20px 24px',
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#e4e4e7' }}>Keyboard Shortcuts</h3>
        {shortcuts.map(([key, label]) => (
          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ fontSize: 13, color: '#71717a' }}>{label}</span>
            <kbd style={{ fontSize: 11, color: '#a1a1aa', background: 'rgba(255,255,255,0.07)', padding: '3px 8px', borderRadius: 4, fontFamily: 'IBM Plex Mono, monospace' }}>{key}</kbd>
          </div>
        ))}
        <button onClick={onClose} style={{ marginTop: 16, width: '100%', padding: '8px', borderRadius: 6, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8', fontSize: 13, cursor: 'pointer' }}>
          Close
        </button>
      </div>
    </>
  )
}

export default function App() {
  const { user, showWizard, handleAuth, handleLogout, handleWizardComplete } = useAuth()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  useGlobalShortcuts(
    () => setPaletteOpen(true),
    () => setHelpOpen(true),
  )

  if (!user) {
    return (
      <ToastProvider>
        <WarmingBanner />
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login onAuth={handleAuth} />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </ToastProvider>
    )
  }

  return (
    <ToastProvider>
      <WarmingBanner />
      {showWizard && <OnboardingWizard onComplete={handleWizardComplete} />}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ErrorBoundary>
        <Routes>
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/" element={<Layout user={user} onLogout={handleLogout} onOpenPalette={() => setPaletteOpen(true)} />}>
            <Route index element={<Dashboard />} />
            <Route path="notes" element={<Notes />} />
            <Route
              path="notes/:noteId/study-guide"
              element={<ErrorBoundary label="The study guide"><StudyGuide /></ErrorBoundary>}
            />
            <Route
              path="quiz"
              element={<ErrorBoundary label="The quiz"><Quiz /></ErrorBoundary>}
            />
            <Route path="chat" element={<Chat />} />
            <Route path="flashcards" element={<Flashcards />} />
            <Route path="canvas" element={<Canvas />} />
            <Route
              path="vision"
              element={<ErrorBoundary label="The vision board"><VisionBoard /></ErrorBoundary>}
            />
            <Route
              path="universe"
              element={<ErrorBoundary label="AI Brain"><StudyUniverse /></ErrorBoundary>}
            />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </ErrorBoundary>
    </ToastProvider>
  )
}
