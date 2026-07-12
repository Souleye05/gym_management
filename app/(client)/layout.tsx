// app/(client)/layout.tsx
'use client'

import { Dumbbell, LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/providers/user-provider'

function ClientGuard({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { session, status, logout } = useAuth()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/connexion')
      return
    }
    if (status === 'authenticated' && session?.kind !== 'client') {
      router.replace('/connexion')
    }
  }, [status, session, router])

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    )
  }

  if (status === 'unauthenticated' || session?.kind !== 'client') {
    return null
  }

  const handleLogout = async () => {
    await logout()
    router.replace('/connexion')
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-brand text-primary-foreground">
            <Dumbbell className="size-3.5" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Atlas</span>
        </div>
        <Button variant="ghost" size="icon" aria-label="Déconnexion" onClick={handleLogout}>
          <LogOut className="size-4" />
        </Button>
      </header>
      <main className="flex flex-1 flex-col p-4">{children}</main>
    </div>
  )
}

export default function ClientLayout({ children }: { children: ReactNode }) {
  return <ClientGuard>{children}</ClientGuard>
}
