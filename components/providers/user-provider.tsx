// components/providers/user-provider.tsx
'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createAuthService } from '@/lib/auth/auth-service'
import { localStorageSessionRepository } from '@/lib/auth/session-repository'
import type { AuthError, ClientSession, Session, StaffCredentials, StaffSession } from '@/lib/auth/types'

const REFRESH_INTERVAL_MS = 5 * 60 * 1000

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

type AuthContextValue = {
  session: Session | null
  status: AuthStatus
  loginStaff(credentials: StaffCredentials): Promise<AuthError | null>
  requestClientOtp(phone: string): Promise<AuthError | null>
  verifyClientOtp(phone: string, code: string): Promise<AuthError | null>
  logout(): Promise<void>
}

const authService = createAuthService(localStorageSessionRepository)

const AuthContext = createContext<AuthContextValue | null>(null)

export function UserProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopRefreshInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const startRefreshInterval = useCallback(() => {
    stopRefreshInterval()
    intervalRef.current = setInterval(() => {
      void authService.refreshSession()
    }, REFRESH_INTERVAL_MS)
  }, [stopRefreshInterval])

  useEffect(() => {
    let cancelled = false
    authService.getSession().then((current) => {
      if (cancelled) return
      setSession(current)
      setStatus(current ? 'authenticated' : 'unauthenticated')
      if (current) startRefreshInterval()
    })
    return () => {
      cancelled = true
      stopRefreshInterval()
    }
  }, [startRefreshInterval, stopRefreshInterval])

  const loginStaff = useCallback(async (credentials: StaffCredentials) => {
    const result = await authService.loginStaff(credentials)
    if (!result.ok) return result.error
    setSession(result.value)
    setStatus('authenticated')
    startRefreshInterval()
    return null
  }, [startRefreshInterval])

  const requestClientOtp = useCallback(async (phone: string) => {
    const result = await authService.requestClientOtp(phone)
    return result.ok ? null : result.error
  }, [])

  const verifyClientOtp = useCallback(async (phone: string, code: string) => {
    const result = await authService.verifyClientOtp(phone, code)
    if (!result.ok) return result.error
    setSession(result.value)
    setStatus('authenticated')
    startRefreshInterval()
    return null
  }, [startRefreshInterval])

  const logout = useCallback(async () => {
    stopRefreshInterval()
    await authService.logout()
    setSession(null)
    setStatus('unauthenticated')
  }, [stopRefreshInterval])

  return (
    <AuthContext.Provider
      value={{ session, status, loginStaff, requestClientOtp, verifyClientOtp, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within a UserProvider')
  return ctx
}

export function useCurrentUser(): StaffSession {
  const { session } = useAuth()
  if (!session || session.kind !== 'staff') {
    throw new Error('useCurrentUser must be used within an authenticated staff session')
  }
  return session
}

export function useCurrentClient(): ClientSession {
  const { session } = useAuth()
  if (!session || session.kind !== 'client') {
    throw new Error('useCurrentClient must be used within an authenticated client session')
  }
  return session
}
