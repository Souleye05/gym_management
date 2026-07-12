'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { AppSidebar } from './app-sidebar'
import { BottomNav } from './bottom-nav'
import { CommandPalette } from './command-palette'
import { Topbar } from './topbar'

export function AppShell({ children }: { children: ReactNode }) {
  const [commandOpen, setCommandOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <div className="lg:pl-64">
        <Topbar onOpenCommand={() => setCommandOpen(true)} />
        <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-6 lg:px-8 lg:pb-12">
          {children}
        </main>
      </div>
      <BottomNav />
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  )
}
