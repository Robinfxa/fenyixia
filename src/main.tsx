import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { DebugProvider } from './contexts/DebugContext'
import App from './App'
import './styles/global.css'

// Ensure Secure Context for Camera & Media API in production
if (
  typeof window !== 'undefined' &&
  window.location.protocol === 'http:' &&
  window.location.hostname !== 'localhost' &&
  window.location.hostname !== '127.0.0.1'
) {
  window.location.replace(`https://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`)
}

const rawBase = import.meta.env.BASE_URL || '/'
const basename = rawBase === '/' ? undefined : rawBase.replace(/\/+$/, '')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <DebugProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </DebugProvider>
    </BrowserRouter>
  </StrictMode>,
)

