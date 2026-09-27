import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { createElement } from 'react'
import type { User } from '../lib/api/auth'
import {
  getCurrentUser, onAuthChange,
  signIn as apiSignIn, signUp as apiSignUp, signOut as apiSignOut,
  checkProfileCompleted, updateProfile as apiUpdateProfile,
} from '../lib/api/auth'

interface AuthContextType {
  user: User | null
  loading: boolean
  profileCompleted: boolean | null // null = still checking
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (name: string, emoji: string, color: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileCompleted, setProfileCompleted] = useState<boolean | null>(null)

  useEffect(() => {
    getCurrentUser().then(u => {
      setUser(u)
      setLoading(false)
      if (u) {
        checkProfileCompleted(u.id)
          .then(setProfileCompleted)
          .catch(() => setProfileCompleted(null)) // keep null on error, don't set false
      }
    }).catch(() => setLoading(false))

    const { data: { subscription } } = onAuthChange((u, event) => {
      // On explicit sign-out, aggressively clear all state
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setProfileCompleted(null)
        setLoading(false)
        return
      }

      setUser(u)
      setLoading(false)
      if (u) {
        checkProfileCompleted(u.id)
          .then(setProfileCompleted)
          .catch(() => setProfileCompleted(null)) // keep null on error, don't set false
      } else {
        setProfileCompleted(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    await apiSignIn(email, password)
  }

  const signUp = async (email: string, password: string) => {
    await apiSignUp(email, password)
  }

  const signOut = async () => {
    await apiSignOut()
    setProfileCompleted(null)
  }

  const updateProfile = async (name: string, emoji: string, color: string) => {
    await apiUpdateProfile(name, emoji, color)
    setProfileCompleted(true)
  }

  return createElement(
    AuthContext.Provider,
    { value: { user, loading, profileCompleted, signIn, signUp, signOut, updateProfile } },
    children,
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
