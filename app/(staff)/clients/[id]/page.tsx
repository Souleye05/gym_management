// app/(staff)/clients/[id]/page.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
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
import { DeactivateClientDialog } from '@/components/clients/deactivate-client-dialog'
import { useClientStatus } from '@/components/clients/use-client-status'
import { SubscriptionConfirmation } from '@/components/subscriptions/subscription-confirmation'
import { SubscriptionForm } from '@/components/subscriptions/subscription-form'
import { SubscriptionStatusBadge } from '@/components/subscriptions/subscription-status-badge'
import { PaymentMethodPicker } from '@/components/sessions/payment-method-picker'
import { SessionConfirmation } from '@/components/sessions/session-confirmation'
import { IneligibilityNotice } from '@/components/scan/ineligibility-notice'
import { ClientQrCode } from '@/components/scan/client-qr-code'
import { useClients } from '@/components/providers/clients-provider'
import { useSessions } from '@/components/providers/sessions-provider'
import { useSubscriptions } from '@/components/providers/subscriptions-provider'
import { getClientByIdRequest } from '@/lib/clients/fetch-clients'
import { PLANS } from '@/lib/subscriptions/plans'
import { checkSessionEligibility } from '@/lib/sessions/eligibility'
import type { PaymentMethod, PlanId, Subscription } from '@/lib/subscriptions/types'
import type { Session } from '@/lib/sessions/types'

const currency = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

function planLabel(planId: PlanId): string {
  return PLANS.find((p) => p.id === planId)?.label ?? planId
}

export default function ClientProfilePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { getClient, updateClient, deactivateClient, isLoading: clientsLoading, isError: clientsError, refetch } = useClients()
  const { getCurrentSubscription, getSubscriptionHistory, createSubscription, renewSubscription, suspendSubscription, reactivateSubscription } =
    useSubscriptions()
  const { getSessionsForClient, recordSubscriberSession } = useSessions()
  const [editOpen, setEditOpen] = useState(false)
  const [editError, setEditError] = useState<string | undefined>(undefined)
  const [isUpdating, setIsUpdating] = useState(false)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [deactivateError, setDeactivateError] = useState<string | undefined>(undefined)
  const [isDeactivating, setIsDeactivating] = useState(false)
  const [subscriptionFormOpen, setSubscriptionFormOpen] = useState(false)
  const [confirmation, setConfirmation] = useState<Subscription | null>(null)
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)
  const [sessionPaymentMethod, setSessionPaymentMethod] = useState<PaymentMethod>('cash')
  const [sessionConfirmation, setSessionConfirmation] = useState<Session | null>(null)

  const listClient = getClient(params.id)
  // The clients list is capped to the backend's first page of active clients (see
  // DEFAULT_LIST_ACTIVE_LIMIT). A real, active client beyond that page won't be in `clients`, so
  // once the list has genuinely finished loading (not mid-fetch, not errored) and still doesn't
  // contain this id, fall back to a direct single-client fetch before concluding it doesn't exist.
  const shouldFetchFallbackClient = !listClient && !clientsLoading && !clientsError
  const fallbackClientQuery = useQuery({
    queryKey: ['client', params.id],
    queryFn: () => getClientByIdRequest(params.id),
    enabled: shouldFetchFallbackClient,
  })
  const client = listClient ?? fallbackClientQuery.data
  const clientStatus = useClientStatus(params.id)

  if (clientsLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    )
  }

  if (clientsError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">Impossible de charger la liste des clients.</p>
        <Button variant="outline" onClick={refetch}>
          Réessayer
        </Button>
      </div>
    )
  }

  if (!client) {
    if (fallbackClientQuery.isLoading) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Chargement…</p>
        </div>
      )
    }
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
  const sessionHistory = getSessionsForClient(client.id)
  const sessionEligibility = checkSessionEligibility(currentSubscription)

  const handleUpdate = (values: { name: string; phone: string; email?: string | null }) => {
    setEditError(undefined)
    setIsUpdating(true)
    updateClient(client.id, values, {
      onSuccess: () => {
        setIsUpdating(false)
        setEditOpen(false)
      },
      onError: (message) => {
        setIsUpdating(false)
        setEditError(message)
      },
    })
  }

  const handleOpenEdit = () => {
    setEditError(undefined)
    setEditOpen(true)
  }

  const handleOpenDeactivate = () => {
    setDeactivateError(undefined)
    setDeactivateOpen(true)
  }

  const handleDeactivate = () => {
    setDeactivateError(undefined)
    setIsDeactivating(true)
    deactivateClient(client.id, {
      onSuccess: () => {
        setIsDeactivating(false)
        setDeactivateOpen(false)
        router.push('/clients')
      },
      onError: (message) => {
        setIsDeactivating(false)
        setDeactivateError(message)
      },
    })
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

  const handleRecordSession = () => {
    setSessionPaymentMethod('cash')
    setSessionDialogOpen(true)
  }

  const handleConfirmSession = () => {
    const result = recordSubscriberSession({ clientId: client.id, paymentMethod: sessionPaymentMethod })
    if (result.ok) {
      setSessionDialogOpen(false)
      setSessionConfirmation(result.session)
    }
    // result.ok === false is unreachable here since the dialog's "Confirmer" button is only
    // rendered when eligibility.allowed is already true (see the session dialog below).
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
          <div className="flex items-center gap-4">
            <ClientQrCode cardNumber={client.cardNumber} />
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleOpenEdit}>
                <Pencil className="size-4" />
                Modifier
              </Button>
              <Button variant="destructive" onClick={handleOpenDeactivate}>
                <Trash2 className="size-4" />
                Désactiver
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4" />
              Historique des séances
            </CardTitle>
            <Button size="sm" variant="outline" onClick={handleRecordSession}>
              Enregistrer une séance
            </Button>
          </CardHeader>
          <CardContent>
            {sessionHistory.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Aucune séance enregistrée.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {sessionHistory.map((session) => (
                  <li key={session.id} className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {new Date(session.checkedInAt).toLocaleDateString('fr-FR')}{' '}
                      {new Date(session.checkedInAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span>{currency(session.amountPaid)}</span>
                  </li>
                ))}
              </ul>
            )}
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
          serverError={editError}
          isSubmitting={isUpdating}
        />
      </Dialog>

      <DeactivateClientDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        clientName={client.name}
        onConfirm={handleDeactivate}
        error={deactivateError}
        pending={isDeactivating}
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

      <Dialog open={sessionDialogOpen} onOpenChange={setSessionDialogOpen}>
        <DialogHeader>
          <DialogTitle>Enregistrer une séance</DialogTitle>
          <DialogDescription>
            {sessionEligibility.allowed
              ? `Choisissez le mode de paiement pour ${client.name}.`
              : 'Ce client ne peut pas enregistrer de séance pour le moment.'}
          </DialogDescription>
        </DialogHeader>
        {sessionEligibility.allowed ? (
          <div className="flex flex-col gap-4">
            <PaymentMethodPicker value={sessionPaymentMethod} onChange={setSessionPaymentMethod} />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setSessionDialogOpen(false)}>
                Annuler
              </Button>
              <Button type="button" className="bg-gradient-brand text-primary-foreground" onClick={handleConfirmSession}>
                Confirmer
              </Button>
            </div>
          </div>
        ) : (
          <IneligibilityNotice eligibility={sessionEligibility} />
        )}
      </Dialog>

      <Dialog open={sessionConfirmation !== null} onOpenChange={(open) => !open && setSessionConfirmation(null)}>
        <DialogHeader>
          <DialogTitle>Séance enregistrée</DialogTitle>
        </DialogHeader>
        {sessionConfirmation && (
          <SessionConfirmation session={sessionConfirmation} clientName={client.name} />
        )}
      </Dialog>
    </div>
  )
}
