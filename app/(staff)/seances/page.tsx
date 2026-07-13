'use client'

import { CalendarDays } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ClientSearch } from '@/components/sessions/client-search'
import { PaymentMethodPicker } from '@/components/sessions/payment-method-picker'
import { SessionConfirmation } from '@/components/sessions/session-confirmation'
import { useClients } from '@/components/providers/clients-provider'
import { useSessions } from '@/components/providers/sessions-provider'
import type { Client } from '@/lib/clients/types'
import type { Session } from '@/lib/sessions/types'
import type { PaymentMethod } from '@/lib/subscriptions/types'

const currency = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

type RecordStep = 'search' | 'payment'

export default function SeancesPage() {
  const router = useRouter()
  const { clients } = useClients()
  const { getSessionsForToday, recordSession } = useSessions()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [step, setStep] = useState<RecordStep>('search')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [confirmation, setConfirmation] = useState<Session | null>(null)

  const todaysSessions = getSessionsForToday()

  const clientName = (clientId: string) => clients.find((c) => c.id === clientId)?.name ?? 'Client inconnu'

  const openDialog = () => {
    setStep('search')
    setSelectedClient(null)
    setPaymentMethod('cash')
    setDialogOpen(true)
  }

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client)
    setStep('payment')
  }

  const handleConfirm = () => {
    if (!selectedClient) return
    const created = recordSession({ clientId: selectedClient.id, paymentMethod })
    setDialogOpen(false)
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
        <Button className="bg-gradient-brand text-primary-foreground sm:w-auto" onClick={openDialog}>
          Enregistrer une séance
        </Button>
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
              <TableRow key={session.id} onClick={() => router.push(`/clients/${session.clientId}`)}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar name={clientName(session.clientId)} />
                    <span className="font-medium">{clientName(session.clientId)}</span>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogHeader>
          <DialogTitle>Enregistrer une séance</DialogTitle>
          <DialogDescription>
            {step === 'search' ? 'Recherchez le client concerné.' : 'Choisissez le mode de paiement.'}
          </DialogDescription>
        </DialogHeader>
        {step === 'search' ? (
          <ClientSearch clients={clients} onSelect={handleSelectClient} />
        ) : (
          selectedClient && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Avatar name={selectedClient.name} />
                <span className="text-sm font-medium">{selectedClient.name}</span>
              </div>
              <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setStep('search')}>
                  Retour
                </Button>
                <Button type="button" className="bg-gradient-brand text-primary-foreground" onClick={handleConfirm}>
                  Confirmer
                </Button>
              </div>
            </div>
          )
        )}
      </Dialog>

      <Dialog open={confirmation !== null} onOpenChange={(open) => !open && setConfirmation(null)}>
        <DialogHeader>
          <DialogTitle>Séance enregistrée</DialogTitle>
        </DialogHeader>
        {confirmation && (
          <SessionConfirmation
            amountPaid={confirmation.amountPaid}
            paymentMethod={confirmation.paymentMethod}
            checkedInAt={confirmation.checkedInAt}
          />
        )}
      </Dialog>
    </div>
  )
}
