import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import OnboardingWizard from './components/OnboardingWizard'
import CommandPalette from './components/CommandPalette'
import { ToastProvider } from './components/Toast'
import Canvas from './pages/Canvas'
import Flashcards from './pages/Flashcards'
import Chat from './pages/Chat'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Notes from './pages/Notes'
import StudyGuide from './pages/StudyGuide'
import Quiz from './pages/Quiz'
import Settings from './pages/Settings'
import VisionBoard from './pages/VisionBoard'
import StudyUniverse from './pages/StudyUniverse'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'

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
      const onboarded = localStorage.getItem('mt_onboarded')
      return Boolean(stored) && !onboarded
    } catch {
      return false
    }
  })

  function handleAuth(userData) {
    setUser(userData)
    if (!localStorage.getItem('mt_onboarded')) {
      setShowWizard(true)
    }
  }

  function handleLogout() {
    localStorage.removeItem('mt_token')
    localStorage.removeItem('mt_user')
    setUser(null)
  }

  function handleWizardComplete() {
    localStorage.setItem('mt_onboarded', '1')
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
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 9995, width: 340, borderRadius: 16,
        background: 'rgba(12,12,30,0.97)', border: '1px solid rgba(255,255,255,0.1)',
        backdropFilter: 'blur(24px)', boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
        padding: '20px 24px',
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>Keyboard Shortcuts</h3>
        {shortcuts.map(([key, label]) => (
          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{label}</span>
            <kbd style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.08)', padding: '3px 8px', borderRadius: 5, fontFamily: 'monospace' }}>{key}</kbd>
          </div>
        ))}
        <button onClick={onClose} style={{ marginTop: 16, width: '100%', padding: '8px', borderRadius: 8, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', fontSize: 13, cursor: 'pointer' }}>
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
        <Routes>
          <Route path="/login" element={<Login onAuth={handleAuth} />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </ToastProvider>
    )
  }

  return (
    <ToastProvider>
      {showWizard && <OnboardingWizard onComplete={handleWizardComplete} />}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/" element={<Layout user={user} onLogout={handleLogout} onOpenPalette={() => setPaletteOpen(true)} />}>
          <Route index element={<Dashboard />} />
          <Route path="notes" element={<Notes />} />
          <Route path="notes/:noteId/study-guide" element={<StudyGuide />} />
          <Route path="quiz" element={<Quiz />} />
          <Route path="chat" element={<Chat />} />
          <Route path="flashcards" element={<Flashcards />} />
          <Route path="canvas" element={<Canvas />} />
          <Route path="vision" element={<VisionBoard />} />
          <Route path="universe" element={<StudyUniverse />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </ToastProvider>
  )
}
