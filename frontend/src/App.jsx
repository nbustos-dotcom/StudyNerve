import { useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Canvas from './pages/Canvas'
import Chat from './pages/Chat'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Notes from './pages/Notes'
import Quiz from './pages/Quiz'
import Results from './pages/Results'
import Settings from './pages/Settings'
import VisionBoard from './pages/VisionBoard'

function useAuth() {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('mt_user')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  function handleAuth(userData) {
    setUser(userData)
  }

  function handleLogout() {
    localStorage.removeItem('mt_token')
    localStorage.removeItem('mt_user')
    setUser(null)
  }

  return { user, handleAuth, handleLogout }
}

export default function App() {
  const { user, handleAuth, handleLogout } = useAuth()

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login onAuth={handleAuth} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/" element={<Layout user={user} onLogout={handleLogout} />}>
        <Route index element={<Dashboard />} />
        <Route path="notes" element={<Notes />} />
        <Route path="quiz" element={<Quiz />} />
        <Route path="chat" element={<Chat />} />
        <Route path="results" element={<Results />} />
        <Route path="canvas" element={<Canvas />} />
        <Route path="vision" element={<VisionBoard />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
