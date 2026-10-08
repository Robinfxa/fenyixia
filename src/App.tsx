import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { SWRConfig } from 'swr'
import { useAuth } from './hooks/useAuth'
import { mutateBills } from './hooks/useBills'
import { ToastProvider } from './contexts/ToastContext'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import ContactsPage from './pages/ContactsPage'
import NewFriendsPage from './pages/NewFriendsPage'
import GroupsPage from './pages/GroupsPage'
import TagsPage from './pages/TagsPage'
import SettingsPage from './pages/SettingsPage'
import StatsPage from './pages/StatsPage'
import ScanPage from './pages/ScanPage'
import QuickBillPage from './pages/QuickBillPage'
import AdminPage from './pages/AdminPage'
import SettlementsPage from './pages/SettlementsPage'
import AddBillOverlay from './components/AddBillOverlay/AddBillOverlay'
import DebugConsole from './components/Debug/DebugConsole'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, profileCompleted } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  // 未完善资料 → 重定向到 login 页的 setup 流程
  if (profileCompleted === false) return <Navigate to="/login" replace />
  // 还在检查 profileCompleted 状态
  if (profileCompleted === null) return null

  return <>{children}</>
}

export default function App() {
  const [showAddOptions, setShowAddOptions] = useState(false)
  const handleAddClick = () => setShowAddOptions(true)

  return (
    <SWRConfig value={{ revalidateOnFocus: true, dedupingInterval: 5000 }}>
    <ToastProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <HomePage onAddClick={handleAddClick} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/contacts"
          element={
            <ProtectedRoute>
              <ContactsPage onAddClick={handleAddClick} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/contacts/new"
          element={
            <ProtectedRoute>
              <NewFriendsPage onAddClick={handleAddClick} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/contacts/groups"
          element={
            <ProtectedRoute>
              <GroupsPage onAddClick={handleAddClick} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/contacts/tags"
          element={
            <ProtectedRoute>
              <TagsPage onAddClick={handleAddClick} />
            </ProtectedRoute>
          }
        />
        {/* Redirect old /friends to /contacts */}
        <Route path="/friends" element={<Navigate to="/contacts" replace />} />
        <Route
          path="/stats"
          element={
            <ProtectedRoute>
              <StatsPage onAddClick={handleAddClick} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settlements"
          element={
            <ProtectedRoute>
              <SettlementsPage onAddClick={handleAddClick} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage onAddClick={handleAddClick} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/scan"
          element={
            <ProtectedRoute>
              <ScanPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/quick-bill"
          element={
            <ProtectedRoute>
              <QuickBillPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminPage />
            </ProtectedRoute>
          }
        />
      </Routes>
      <AddBillOverlay
        show={showAddOptions}
        onClose={() => setShowAddOptions(false)}
        onCreated={() => { setShowAddOptions(false); mutateBills() }}
      />
      <DebugConsole />
    </ToastProvider>
    </SWRConfig>
  )
}
