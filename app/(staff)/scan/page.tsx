// app/(staff)/scan/page.tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ClientStatusBadge } from '@/components/clients/client-status-badge'
import { useClientStatus } from '@/components/clients/use-client-status'
import { ClientIdentification } from '@/components/scan/client-identification'
import { IneligibilityNotice } from '@/components/scan/ineligibility-notice'
import { PaymentMethodPicker } from '@/components/sessions/payment-method-picker'
import { SessionConfirmation } from '@/components/sessions/session-confirmation'
import { useClients } from '@/components/providers/clients-provider'
import { useSessions } from '@/components/providers/sessions-provider'
import { useSubscriptions } from '@/components/providers/subscriptions-provider'
import { checkSessionEligibility } from '@/lib/sessions/eligibility'
import type { Client } from '@/lib/clients/types'
import type { Session } from '@/lib/sessions/types'
import type { PaymentMethod } from '@/lib/subscriptions/types'

export default function ScanPage() {
  const router = useRouter()
  const { clientRepository } = useClients()
  const { getCurrentSubscription } = useSubscriptions()
  const { recordSubscriberSession } = useSessions()

  const [identifiedClient, setIdentifiedClient] = useState<Client | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [confirmation, setConfirmation] = useState<Session | null>(null)
  const [confirmedClientName, setConfirmedClientName] = useState<string | undefined>(undefined)

  const status = useClientStatus(identifiedClient?.id ?? '')
  const subscription = identifiedClient ? getCurrentSubscription(identifiedClient.id) : undefined
  const eligibility = identifiedClient ? checkSessionEligibility(subscription) : null

  const reset = () => {
    setIdentifiedClient(null)
    setPaymentMethod('cash')
    setConfirmation(null)
    setConfirmedClientName(undefined)
  }

  const handleIdentified = (client: Client) => {
    // Identifying a new client always starts a fresh flow — any confirmation left over
    // from a previous session must not bleed into this one.
    setConfirmation(null)
    setConfirmedClientName(undefined)
    setIdentifiedClient(client)
  }

  const handleConfirm = () => {
    if (!identifiedClient) return
    const result = recordSubscriberSession({ clientId: identifiedClient.id, paymentMethod })
    if (result.ok) {
      setConfirmedClientName(identifiedClient.name)
      setConfirmation(result.session)
      setIdentifiedClient(null)
      setPaymentMethod('cash')
    }
    // result.ok === false should not be reachable here since the button is only shown when
    // eligibility.allowed is already true — no separate error UI is needed for this branch.
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">Scan QR code</h1>
        <p className="text-sm text-muted-foreground">
          Identifiez un client pour vérifier son statut et enregistrer sa séance.
        </p>
      </div>

      {confirmation ? (
        <div className="flex flex-col gap-4">
          <SessionConfirmation session={confirmation} clientName={confirmedClientName} />
          <Button variant="outline" onClick={reset}>
            Nouveau scan
          </Button>
        </div>
      ) : !identifiedClient ? (
        <ClientIdentification clientRepository={clientRepository} onIdentified={handleIdentified} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Avatar name={identifiedClient.name} />
              <span className="text-sm font-medium">{identifiedClient.name}</span>
            </div>
            <ClientStatusBadge status={status} />
          </div>

          {eligibility?.allowed ? (
            <div className="flex flex-col gap-4">
              <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} />
              <Button className="bg-gradient-brand text-primary-foreground" onClick={handleConfirm}>
                Enregistrer la séance
              </Button>
            </div>
          ) : (
            eligibility && (
              <IneligibilityNotice
                eligibility={eligibility}
                onRenew={() => router.push(`/clients/${identifiedClient.id}`)}
                onCreateSubscription={() => router.push(`/clients/${identifiedClient.id}`)}
                onDailySession={() => router.push('/seances')}
                onViewProfile={() => router.push(`/clients/${identifiedClient.id}`)}
              />
            )
          )}

          <Button variant="outline" onClick={reset}>
            Nouveau scan
          </Button>
        </div>
      )}
    </div>
  )
}
