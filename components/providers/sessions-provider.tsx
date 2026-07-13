// components/providers/sessions-provider.tsx
'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { useSettings } from '@/components/providers/settings-provider'
import { mockSessions } from '@/lib/sessions/mock-sessions'
import type { Session, SubscriberSession, VisitorSession } from '@/lib/sessions/types'
import type { PaymentMethod } from '@/lib/subscriptions/types'

type SessionsContextValue = {
  sessions: Session[]
  recordSubscriberSession(input: { clientId: string; paymentMethod: PaymentMethod }): SubscriberSession
  recordVisitorSession(input: { fullName: string; phoneNumber: string; paymentMethod: PaymentMethod }): VisitorSession
  getSessionsForClient(clientId: string): SubscriberSession[]
  getSessionsForToday(): Session[]
}

const SessionsContext = createContext<SessionsContextValue | null>(null)

function isSameDay(isoA: string, isoB: string): boolean {
  const a = new Date(isoA)
  const b = new Date(isoB)
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function SessionsProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings()
  const [sessions, setSessions] = useState<Session[]>(() => [...mockSessions])

  const recordSubscriberSession = useCallback(
    (input: { clientId: string; paymentMethod: PaymentMethod }): SubscriberSession => {
      const created: SubscriberSession = {
        type: 'subscriber',
        id: `sess${Date.now()}`,
        clientId: input.clientId,
        amountPaid: settings.sessionPrice,
        paymentMethod: input.paymentMethod,
        checkedInAt: new Date().toISOString(),
      }
      setSessions((prev) => [...prev, created])
      return created
    },
    [settings.sessionPrice],
  )

  const recordVisitorSession = useCallback(
    (input: { fullName: string; phoneNumber: string; paymentMethod: PaymentMethod }): VisitorSession => {
      const created: VisitorSession = {
        type: 'visitor',
        id: `sess${Date.now()}`,
        fullName: input.fullName,
        phoneNumber: input.phoneNumber,
        amountPaid: settings.sessionPrice,
        paymentMethod: input.paymentMethod,
        checkedInAt: new Date().toISOString(),
      }
      setSessions((prev) => [...prev, created])
      return created
    },
    [settings.sessionPrice],
  )

  const getSessionsForClient = useCallback(
    (clientId: string): SubscriberSession[] =>
      sessions
        .filter((s): s is SubscriberSession => s.type === 'subscriber' && s.clientId === clientId)
        .sort((a, b) => new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime()),
    [sessions],
  )

  const getSessionsForToday = useCallback(() => {
    const now = new Date().toISOString()
    return sessions
      .filter((s) => isSameDay(s.checkedInAt, now))
      .sort((a, b) => new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime())
  }, [sessions])

  return (
    <SessionsContext.Provider
      value={{
        sessions,
        recordSubscriberSession,
        recordVisitorSession,
        getSessionsForClient,
        getSessionsForToday,
      }}
    >
      {children}
    </SessionsContext.Provider>
  )
}

export function useSessions(): SessionsContextValue {
  const ctx = useContext(SessionsContext)
  if (!ctx) throw new Error('useSessions must be used within a SessionsProvider')
  return ctx
}
