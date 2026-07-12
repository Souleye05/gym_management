'use client'

import { QrCode } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { bottomNav } from './nav-config'

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <div className="grid grid-cols-5 items-end">
        {bottomNav.map((item) => {
          const active = pathname === item.href
          const isScan = item.href === '/scan'
          const Icon = item.icon

          if (isScan) {
            return (
              <div key={item.href} className="flex justify-center">
                <Link
                  href={item.href}
                  aria-label="Scanner un QR code"
                  className="-mt-6 flex size-14 flex-col items-center justify-center rounded-2xl bg-gradient-brand text-primary-foreground shadow-lg shadow-primary/30"
                >
                  <QrCode className="size-6" />
                </Link>
              </div>
            )
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon className="size-5" />
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
