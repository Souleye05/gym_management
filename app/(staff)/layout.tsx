// app/(staff)/layout.tsx
'use client'

import { useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { AppShell } from '@/components/shell/app-shell'
import { ClientsProvider } from '@/components/providers/clients-provider'
import { SettingsProvider } from '@/components/providers/settings-provider'
import { SessionsProvider } from '@/components/providers/sessions-provider'
import { SubscriptionsProvider } from '@/components/providers/subscriptions-provider'
import { useAuth } from '@/components/providers/user-provider'

function StaffGuard({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { session, status } = useAuth()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login')
      return
    }
    if (status === 'authenticated' && session?.kind !== 'staff') {
      router.replace('/login')
    }
  }, [status, session, router])

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    )
  }

  if (status === 'unauthenticated' || session?.kind !== 'staff') {
    return null
  }

  return (
    <ClientsProvider>
      <SubscriptionsProvider>
        <SettingsProvider>
          <SessionsProvider>
            <AppShell>{children}</AppShell>
          </SessionsProvider>
        </SettingsProvider>
      </SubscriptionsProvider>
    </ClientsProvider>
  )
}

export default function StaffLayout({ children }: { children: ReactNode }) {
  return <StaffGuard>{children}</StaffGuard>
}
