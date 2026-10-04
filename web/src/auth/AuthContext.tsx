import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, tokenStore, type Tokens } from '../api/client'
import type { User } from '../api/types'

interface AuthState {
  user: User | null
  loading: boolean
  login(email: string, password: string): Promise<void>
  register(name: string, email: string, password: string): Promise<void>
  logout(): Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const loadMe = useCallback(async () => {
    if (!tokenStore.get()) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      setUser(await api<User>('/auth/me'))
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMe()
    const unsub = tokenStore.subscribe((t) => {
      if (!t) setUser(null)
    })
    return () => {
      unsub()
    }
  }, [loadMe])

  const login = async (email: string, password: string) => {
    tokenStore.set(await api<Tokens>('/auth/login', { method: 'POST', json: { email, password } }))
    await loadMe()
  }
  const register = async (name: string, email: string, password: string) => {
    tokenStore.set(await api<Tokens>('/auth/register', { method: 'POST', json: { name, email, password } }))
    await loadMe()
  }
  const logout = async () => {
    const t = tokenStore.get()
    tokenStore.set(null)
    if (t) await api('/auth/logout', { method: 'POST', json: { refresh_token: t.refresh_token } }).catch(() => {})
  }

  return <Ctx.Provider value={{ user, loading, login, register, logout }}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}
