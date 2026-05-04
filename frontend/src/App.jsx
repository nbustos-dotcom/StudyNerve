import { useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import OnboardingWizard from './components/OnboardingWizard'
import Canvas from './pages/Canvas'
import Flashcards from './pages/Flashcards'
import Chat from './pages/Chat'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Notes from './pages/Notes'
import StudyGuide from './pages/StudyGuide'
import Quiz from './pages/Quiz'
import Results from './pages/Results'
import Settings from './pages/Settings'
import Brainspace from './pages/Brainspace'
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

export default function App() {
  const { user, showWizard, handleAuth, handleLogout, handleWizardComplete } = useAuth()

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login onAuth={handleAuth} />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <>
      {showWizard && <OnboardingWizard onComplete={handleWizardComplete} />}
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/" element={<Layout user={user} onLogout={handleLogout} />}>
          <Route index element={<Dashboard />} />
          <Route path="notes" element={<Notes />} />
          <Route path="notes/:noteId/study-guide" element={<StudyGuide />} />
          <Route path="quiz" element={<Quiz />} />
          <Route path="chat" element={<Chat />} />
          <Route path="results" element={<Results />} />
          <Route path="flashcards" element={<Flashcards />} />
          <Route path="canvas" element={<Canvas />} />
          <Route path="vision" element={<Brainspace />} />
          <Route path="universe" element={<StudyUniverse />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </>
  )
}
