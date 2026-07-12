'use client'

import { Dumbbell } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useCurrentUser } from '@/components/providers/user-provider'
import { cn } from '@/lib/utils'
import { primaryNav, secondaryNav } from './nav-config'

export function AppSidebar() {
  const pathname = usePathname()
  const user = useCurrentUser()
  const visiblePrimary = primaryNav.filter((item) => item.roles.includes(user.role))
  const visibleSecondary = secondaryNav.filter((item) => item.roles.includes(user.role))

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-brand text-primary-foreground shadow-sm">
          <Dumbbell className="size-5" />
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight">Atlas</span>
          <span className="text-xs text-muted-foreground">Studio Fitness</span>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Général
        </p>
        {visiblePrimary.map((item) => (
          <NavLink key={item.href} item={item} active={pathname === item.href} />
        ))}

        {visibleSecondary.length > 0 && (
          <>
            <p className="px-3 pt-5 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Système
            </p>
            {visibleSecondary.map((item) => (
              <NavLink key={item.href} item={item} active={pathname === item.href} />
            ))}
          </>
        )}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <Avatar name={user.name} className="bg-primary/10 text-primary" />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-medium">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </div>
        </div>
      </div>
    </aside>
  )
}

function NavLink({
  item,
  active,
}: {
  item: (typeof primaryNav)[number]
  active: boolean
}) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
      )}
    >
      {active && (
        <span className="absolute left-0 h-5 w-1 -translate-x-3 rounded-full bg-primary" />
      )}
      <Icon className={cn('size-4.5', active && 'text-primary')} />
      <span className="flex-1">{item.label}</span>
      {item.badge && (
        <Badge variant={active ? 'default' : 'muted'} className="px-1.5">
          {item.badge}
        </Badge>
      )}
    </Link>
  )
}
