'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function DeactivateClientDialog({
  open,
  onOpenChange,
  clientName,
  onConfirm,
  error,
  pending = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientName: string
  onConfirm: () => void
  error?: string
  pending?: boolean
}) {
  // While a deactivation request is in flight, dismissal (Escape, backdrop click, Cancel) is
  // blocked and the confirm button is disabled, so a double-click can't fire a second mutation
  // and a "cancel" attempt can't race against the (uncancellable) request resolving successfully.
  const handleOpenChange = (next: boolean) => {
    if (pending) return
    onOpenChange(next)
  }

  const handleConfirm = () => {
    if (pending) return
    onConfirm()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogHeader>
        <DialogTitle>Désactiver {clientName} ?</DialogTitle>
        <DialogDescription>
          Le client sera désactivé et n'apparaîtra plus dans les listes actives. Cette action ne supprime aucune donnée.
        </DialogDescription>
      </DialogHeader>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
          Annuler
        </Button>
        <Button variant="destructive" onClick={handleConfirm} disabled={pending}>
          {pending ? 'Désactivation…' : 'Désactiver'}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
