// app/(staff)/seances/page.tsx
'use client'

import { CalendarDays } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ClientStatusBadge } from '@/components/clients/client-status-badge'
import { useClientStatus } from '@/components/clients/use-client-status'
import { ClientSearch } from '@/components/sessions/client-search'
import { PaymentMethodPicker } from '@/components/sessions/payment-method-picker'
import { SessionConfirmation } from '@/components/sessions/session-confirmation'
import { VisitorSessionForm } from '@/components/sessions/visitor-session-form'
import { useClients } from '@/components/providers/clients-provider'
import { useSessions } from '@/components/providers/sessions-provider'
import type { Client } from '@/lib/clients/types'
import type { Session } from '@/lib/sessions/types'
import type { PaymentMethod } from '@/lib/subscriptions/types'

const currency = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

type SubscriberStep = 'search' | 'payment'

function SelectedClientStatus({ clientId }: { clientId: string }) {
  const status = useClientStatus(clientId)
  return <ClientStatusBadge status={status} />
}

export default function SeancesPage() {
  const router = useRouter()
  const { clients } = useClients()
  const { getSessionsForToday, recordSubscriberSession, recordVisitorSession } = useSessions()

  const [subscriberDialogOpen, setSubscriberDialogOpen] = useState(false)
  const [subscriberStep, setSubscriberStep] = useState<SubscriberStep>('search')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')

  const [visitorDialogOpen, setVisitorDialogOpen] = useState(false)

  const [confirmation, setConfirmation] = useState<Session | null>(null)
  const [confirmationClientName, setConfirmationClientName] = useState<string | undefined>(undefined)

  const todaysSessions = getSessionsForToday()

  const clientName = (clientId: string) => clients.find((c) => c.id === clientId)?.name ?? 'Client inconnu'

  const openSubscriberDialog = () => {
    setSubscriberStep('search')
    setSelectedClient(null)
    setPaymentMethod('cash')
    setSubscriberDialogOpen(true)
  }

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client)
    setSubscriberStep('payment')
  }

  const handleConfirmSubscriber = () => {
    if (!selectedClient) return
    const created = recordSubscriberSession({ clientId: selectedClient.id, paymentMethod })
    setSubscriberDialogOpen(false)
    setConfirmationClientName(selectedClient.name)
    setConfirmation(created)
  }

  const handleConfirmVisitor = (values: { fullName: string; phoneNumber: string; paymentMethod: PaymentMethod }) => {
    const created = recordVisitorSession(values)
    setVisitorDialogOpen(false)
    setConfirmationClientName(undefined)
    setConfirmation(created)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">Séances journalières</h1>
          <p className="text-sm text-muted-foreground">
            {todaysSessions.length} séance{todaysSessions.length > 1 ? 's' : ''} aujourd'hui.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setVisitorDialogOpen(true)}>
            Nouvelle séance journalière
          </Button>
          <Button className="bg-gradient-brand text-primary-foreground" onClick={openSubscriberDialog}>
            Enregistrer la séance d'un abonné
          </Button>
        </div>
      </div>

      {todaysSessions.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Aucune séance aujourd'hui"
          description="Les séances enregistrées aujourd'hui apparaîtront ici."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Heure</TableHead>
              <TableHead>Montant</TableHead>
              <TableHead>Paiement</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {todaysSessions.map((session) => (
              <TableRow
                key={session.id}
                onClick={session.type === 'subscriber' ? () => router.push(`/clients/${session.clientId}`) : undefined}
                className={session.type === 'visitor' ? 'cursor-default' : undefined}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar name={session.type === 'subscriber' ? clientName(session.clientId) : session.fullName} />
                    <span className="font-medium">
                      {session.type === 'subscriber' ? clientName(session.clientId) : session.fullName}
                    </span>
                    {session.type === 'visitor' && <Badge variant="muted">Visiteur</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(session.checkedInAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </TableCell>
                <TableCell className="text-muted-foreground">{currency(session.amountPaid)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {session.paymentMethod === 'cash' && 'Espèces'}
                  {session.paymentMethod === 'card' && 'Carte'}
                  {session.paymentMethod === 'mobile_money' && 'Mobile Money'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={subscriberDialogOpen} onOpenChange={setSubscriberDialogOpen}>
        <DialogHeader>
          <DialogTitle>Enregistrer la séance d'un abonné</DialogTitle>
          <DialogDescription>
            {subscriberStep === 'search' ? 'Recherchez le client concerné.' : 'Choisissez le mode de paiement.'}
          </DialogDescription>
        </DialogHeader>
        {subscriberStep === 'search' ? (
          <ClientSearch clients={clients} onSelect={handleSelectClient} />
        ) : (
          selectedClient && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar name={selectedClient.name} />
                  <span className="text-sm font-medium">{selectedClient.name}</span>
                </div>
                <SelectedClientStatus clientId={selectedClient.id} />
              </div>
              <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setSubscriberStep('search')}>
                  Retour
                </Button>
                <Button type="button" className="bg-gradient-brand text-primary-foreground" onClick={handleConfirmSubscriber}>
                  Confirmer
                </Button>
              </div>
            </div>
          )
        )}
      </Dialog>

      <Dialog open={visitorDialogOpen} onOpenChange={setVisitorDialogOpen}>
        <DialogHeader>
          <DialogTitle>Nouvelle séance journalière</DialogTitle>
          <DialogDescription>Saisissez les informations du visiteur.</DialogDescription>
        </DialogHeader>
        <VisitorSessionForm
          onSubmit={handleConfirmVisitor}
          onCancel={() => setVisitorDialogOpen(false)}
          submitLabel="Confirmer"
        />
      </Dialog>

      <Dialog open={confirmation !== null} onOpenChange={(open) => !open && setConfirmation(null)}>
        <DialogHeader>
          <DialogTitle>Séance enregistrée</DialogTitle>
        </DialogHeader>
        {confirmation && <SessionConfirmation session={confirmation} clientName={confirmationClientName} />}
      </Dialog>
    </div>
  )
}
