'use client'

import { AnimatePresence, motion } from 'motion/react'
import { CornerDownLeft, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { primaryNav, secondaryNav } from './nav-config'

const quickActions = [
  { label: 'Nouvelle séance', href: '/seances', hint: 'Action' },
  { label: 'Ajouter un client', href: '/clients', hint: 'Action' },
  { label: 'Encaisser un paiement', href: '/abonnements', hint: 'Action' },
  { label: 'Scanner un QR code', href: '/scan', hint: 'Action' },
]

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')

  const pages = [...primaryNav, ...secondaryNav].map((item) => ({
    label: item.label,
    href: item.href,
    hint: 'Page',
  }))

  const results = useMemo(() => {
    const all = [...quickActions, ...pages]
    if (!query) return all
    return all.filter((item) =>
      item.label.toLowerCase().includes(query.toLowerCase()),
    )
  }, [query, pages])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onOpenChange])

  const go = (href: string) => {
    onOpenChange(false)
    router.push(href)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[15vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-label="Recherche globale"
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.15 }}
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-4 text-muted-foreground" />
              {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher une page, une action, un client…"
                className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {results.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Aucun résultat pour «&nbsp;{query}&nbsp;»
                </p>
              ) : (
                results.map((item) => (
                  <button
                    key={`${item.hint}-${item.label}`}
                    type="button"
                    onClick={() => go(item.href)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted"
                  >
                    <span className="flex-1 font-medium">{item.label}</span>
                    <span className="text-xs text-muted-foreground">{item.hint}</span>
                    <CornerDownLeft className="size-3.5 text-muted-foreground" />
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
