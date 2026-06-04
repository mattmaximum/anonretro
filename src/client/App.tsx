import { Routes, Route } from 'react-router-dom'
import LandingPage from './components/LandingPage.js'
import BoardPage from './components/BoardPage.js'
import Dashboard from './components/Dashboard.js'
import PrivacyPolicy from './components/PrivacyPolicy.js'
import About from './components/About.js'
import Formats from './components/Formats.js'
import ErrorBoundary from './components/ErrorBoundary.js'
import ThemeToggle from './components/ThemeToggle.js'

export default function App() {
  return (
    <>
      <ThemeToggle />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route
          path="/b/:boardId"
          element={
            <ErrorBoundary>
              <BoardPage />
            </ErrorBoundary>
          }
        />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/about" element={<About />} />
        <Route path="/formats" element={<Formats />} />
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </>
  )
}
