// app/(staff)/clients/[id]/page.tsx
'use client'

import { CalendarClock, CreditCard, Pencil, RefreshCw, Trash2, Users } from 'lucide-react'
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
import { useClientStatus } from '@/components/clients/use-client-status'
import { SubscriptionConfirmation } from '@/components/subscriptions/subscription-confirmation'
import { SubscriptionForm } from '@/components/subscriptions/subscription-form'
import { SubscriptionStatusBadge } from '@/components/subscriptions/subscription-status-badge'
import { useClients } from '@/components/providers/clients-provider'
import { useSubscriptions } from '@/components/providers/subscriptions-provider'
import { PLANS } from '@/lib/subscriptions/plans'
import type { PaymentMethod, PlanId, Subscription } from '@/lib/subscriptions/types'

const currency = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

function planLabel(planId: PlanId): string {
  return PLANS.find((p) => p.id === planId)?.label ?? planId
}

export default function ClientProfilePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { getClient, updateClient, deleteClient } = useClients()
  const { getCurrentSubscription, getSubscriptionHistory, createSubscription, renewSubscription, suspendSubscription, reactivateSubscription } =
    useSubscriptions()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [subscriptionFormOpen, setSubscriptionFormOpen] = useState(false)
  const [confirmation, setConfirmation] = useState<Subscription | null>(null)

  const client = getClient(params.id)
  const clientStatus = useClientStatus(params.id)

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

  const currentSubscription = getCurrentSubscription(client.id)
  const history = getSubscriptionHistory(client.id)

  const handleUpdate = (values: { name: string; phone: string; email?: string }) => {
    updateClient(client.id, values)
    setEditOpen(false)
  }

  const handleDelete = () => {
    deleteClient(client.id)
    router.push('/clients')
  }

  const handleSubscriptionSubmit = (values: { planId: PlanId; paymentMethod: PaymentMethod }) => {
    const result = currentSubscription
      ? renewSubscription(client.id, values)
      : createSubscription({ clientId: client.id, ...values })
    setSubscriptionFormOpen(false)
    setConfirmation(result)
  }

  const handleSuspend = () => {
    if (currentSubscription) suspendSubscription(currentSubscription.id)
  }

  const handleReactivate = () => {
    if (currentSubscription) reactivateSubscription(currentSubscription.id)
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
                <ClientStatusBadge status={clientStatus} />
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
              <CreditCard className="size-4" />
              Abonnement
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {currentSubscription ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{planLabel(currentSubscription.planId)}</span>
                  <SubscriptionStatusBadge status={clientStatus === 'none' ? 'expired' : clientStatus} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Du {new Date(currentSubscription.startDate).toLocaleDateString('fr-FR')} au{' '}
                  {new Date(currentSubscription.endDate).toLocaleDateString('fr-FR')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {currency(currentSubscription.amountPaid)} payé
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSubscriptionFormOpen(true)}>
                    <RefreshCw className="size-4" />
                    Renouveler
                  </Button>
                  {currentSubscription.suspended ? (
                    <Button size="sm" variant="outline" onClick={handleReactivate}>
                      Réactiver
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={handleSuspend}>
                      Suspendre
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <p className="text-sm text-muted-foreground">Aucun abonnement actif.</p>
                <Button size="sm" onClick={() => setSubscriptionFormOpen(true)}>
                  Créer un abonnement
                </Button>
              </div>
            )}

            {history.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Historique
                </p>
                <ul className="flex flex-col gap-2">
                  {history.map((s) => (
                    <li key={s.id} className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{planLabel(s.planId)}</span>
                      <span>
                        {new Date(s.startDate).toLocaleDateString('fr-FR')} –{' '}
                        {new Date(s.endDate).toLocaleDateString('fr-FR')}
                      </span>
                      <span>{currency(s.amountPaid)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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

      <Dialog open={subscriptionFormOpen} onOpenChange={setSubscriptionFormOpen}>
        <DialogHeader>
          <DialogTitle>{currentSubscription ? 'Renouveler' : 'Créer'} l'abonnement</DialogTitle>
          <DialogDescription>Choisissez une formule et un mode de paiement.</DialogDescription>
        </DialogHeader>
        <SubscriptionForm
          onSubmit={handleSubscriptionSubmit}
          onCancel={() => setSubscriptionFormOpen(false)}
          submitLabel={currentSubscription ? 'Renouveler' : 'Créer'}
        />
      </Dialog>

      <Dialog open={confirmation !== null} onOpenChange={(open) => !open && setConfirmation(null)}>
        <DialogHeader>
          <DialogTitle>Paiement confirmé</DialogTitle>
        </DialogHeader>
        {confirmation && (
          <SubscriptionConfirmation
            planId={confirmation.planId}
            paymentMethod={confirmation.paymentMethod}
            startDate={confirmation.startDate}
            endDate={confirmation.endDate}
          />
        )}
      </Dialog>
    </div>
  )
}
