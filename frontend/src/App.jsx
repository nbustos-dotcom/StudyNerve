import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Notes from './pages/Notes'
import Quiz from './pages/Quiz'
import Results from './pages/Results'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="notes" element={<Notes />} />
        <Route path="quiz" element={<Quiz />} />
        <Route path="results" element={<Results />} />
      </Route>
    </Routes>
  )
}
