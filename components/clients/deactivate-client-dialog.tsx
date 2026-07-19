'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function DeactivateClientDialog({
  open,
  onOpenChange,
  clientName,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientName: string
  onConfirm: () => void
}) {
  const handleConfirm = () => {
    onConfirm()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Désactiver {clientName} ?</DialogTitle>
        <DialogDescription>
          Le client sera désactivé et n'apparaîtra plus dans les listes actives. Cette action ne supprime aucune donnée.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Annuler
        </Button>
        <Button variant="destructive" onClick={handleConfirm}>
          Désactiver
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
