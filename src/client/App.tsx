import { Routes, Route } from 'react-router-dom'
import LandingPage from './components/LandingPage.js'
import BoardPage from './components/BoardPage.js'
import ErrorBoundary from './components/ErrorBoundary.js'

export default function App() {
  return (
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
      <Route path="*" element={<LandingPage />} />
    </Routes>
  )
}
