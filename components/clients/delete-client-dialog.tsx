'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function DeleteClientDialog({
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
        <DialogTitle>Supprimer {clientName} ?</DialogTitle>
        <DialogDescription>Cette action est irréversible.</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Annuler
        </Button>
        <Button variant="destructive" onClick={handleConfirm}>
          Supprimer
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
