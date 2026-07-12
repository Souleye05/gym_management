'use client'

import { Bell, Command, Dumbbell, Plus, Search } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'

export function Topbar({ onOpenCommand }: { onOpenCommand: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl lg:px-8">
      {/* Mobile brand */}
      <div className="flex items-center gap-2 lg:hidden">
        <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-brand text-primary-foreground">
          <Dumbbell className="size-4" />
        </div>
        <span className="text-sm font-semibold tracking-tight">Atlas</span>
      </div>

      {/* Search / command palette trigger */}
      <button
        type="button"
        onClick={onOpenCommand}
        className="ml-auto flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:bg-muted lg:ml-0 lg:w-72"
        aria-label="Ouvrir la recherche globale"
      >
        <Search className="size-4" />
        <span className="hidden lg:inline">Rechercher…</span>
        <kbd className="ml-auto hidden items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium lg:flex">
          <Command className="size-2.5" />K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        <Button
          size="sm"
          className="hidden bg-gradient-brand text-primary-foreground sm:inline-flex"
        >
          <Plus className="size-4" />
          Nouvelle séance
        </Button>

        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell className="size-4" />
          <span className="absolute right-2 top-2 size-1.5 rounded-full bg-destructive ring-2 ring-background" />
        </Button>

        <ThemeToggle />

        <Avatar name="Admin Studio" className="bg-primary/10 text-primary" />
      </div>
    </header>
  )
}
