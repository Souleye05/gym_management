// components/ui/dialog.tsx
'use client'

import { AnimatePresence, motion } from 'motion/react'
import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

const DialogTitleIdContext = createContext<string | undefined>(undefined)

type DialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement | null
      const panel = panelRef.current
      const focusable = panel?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      focusable?.focus()
    } else {
      triggerRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
            aria-hidden="true"
          />
          <DialogTitleIdContext.Provider value={titleId}>
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              initial={{ opacity: 0, scale: 0.97, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -8 }}
              transition={{ duration: 0.15 }}
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-popover p-5 shadow-2xl"
            >
              {children}
            </motion.div>
          </DialogTitleIdContext.Provider>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function DialogHeader({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1.5 pb-4">{children}</div>
}

export function DialogTitle({ children }: { children: ReactNode }) {
  const titleId = useContext(DialogTitleIdContext)
  return (
    <h2 id={titleId} className="text-base font-semibold tracking-tight">
      {children}
    </h2>
  )
}

export function DialogDescription({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className={cn('flex justify-end gap-2 pt-4')}>{children}</div>
}
