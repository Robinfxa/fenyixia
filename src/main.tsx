import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { DebugProvider } from './contexts/DebugContext'
import App from './App'
import './styles/global.css'

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

