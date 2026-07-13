// app/(staff)/clients/[id]/page.tsx
'use client'

import { CalendarClock, CreditCard, Pencil, Receipt, Trash2, Users } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { ClientForm } from '@/components/clients/client-form'
import { ClientStatusBadge } from '@/components/clients/client-status-badge'
import { DeleteClientDialog } from '@/components/clients/delete-client-dialog'
import { useClients } from '@/components/providers/clients-provider'

export default function ClientProfilePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { getClient, updateClient, deleteClient } = useClients()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const client = getClient(params.id)

  if (!client) {
    return (
      <EmptyState
        icon={Users}
        title="Client introuvable"
        description="Ce client n'existe pas ou a été supprimé."
        action={
          <Button variant="outline" onClick={() => router.push('/clients')}>
            Retour à la liste
          </Button>
        }
      />
    )
  }

  const handleUpdate = (values: { name: string; phone: string; email?: string }) => {
    updateClient(client.id, values)
    setEditOpen(false)
  }

  const handleDelete = () => {
    deleteClient(client.id)
    router.push('/clients')
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={client.name} className="size-14 text-base" />
            <div className="flex flex-col gap-1">
              <h1 className="text-lg font-semibold tracking-tight">{client.name}</h1>
              <p className="text-sm text-muted-foreground">{client.phone}</p>
              {client.email && <p className="text-sm text-muted-foreground">{client.email}</p>}
              <div className="flex items-center gap-2 pt-1">
                <ClientStatusBadge status={client.status} />
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CreditCard className="size-3.5" />
                  {client.cardNumber}
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" />
              Modifier
            </Button>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-4" />
              Supprimer
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4" />
              Historique des séances
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={CalendarClock}
              title="Bientôt disponible"
              description="L'historique des séances sera disponible avec la gestion des séances."
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="size-4" />
              Paiements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={Receipt}
              title="Bientôt disponible"
              description="L'historique des paiements sera disponible avec la gestion des abonnements."
            />
          </CardContent>
        </Card>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogHeader>
          <DialogTitle>Modifier {client.name}</DialogTitle>
          <DialogDescription>Mettez à jour les informations du client.</DialogDescription>
        </DialogHeader>
        <ClientForm
          initialValues={{ name: client.name, phone: client.phone, email: client.email }}
          onSubmit={handleUpdate}
          onCancel={() => setEditOpen(false)}
          submitLabel="Enregistrer"
        />
      </Dialog>

      <DeleteClientDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        clientName={client.name}
        onConfirm={handleDelete}
      />
    </div>
  )
}
