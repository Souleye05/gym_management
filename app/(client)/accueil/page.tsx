// app/(client)/accueil/page.tsx
'use client'

import { CalendarClock, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DigitalCardSection } from '@/components/client-portal/digital-card-section'
import { HistoryList, type HistoryRow } from '@/components/client-portal/history-list'
import { SubscriptionStatusSection } from '@/components/client-portal/subscription-status-section'
import { useMyProfile } from '@/components/providers/my-profile-provider'
import { PLANS } from '@/lib/subscriptions/plans'
import type { PlanId, Subscription } from '@/lib/subscriptions/types'
import type { SubscriberSession } from '@/lib/sessions/types'

const currency = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

function planLabel(planId: PlanId): string {
  return PLANS.find((p) => p.id === planId)?.label ?? planId
}

function subscriptionRow(s: Subscription): HistoryRow {
  return {
    key: s.id,
    label: planLabel(s.planId),
    date: new Date(s.createdAt).toLocaleDateString('fr-FR'),
    amount: currency(s.amountPaid),
  }
}

function sessionRow(s: SubscriberSession): HistoryRow {
  return {
    key: s.id,
    label: 'Séance',
    date: `${new Date(s.checkedInAt).toLocaleDateString('fr-FR')} ${new Date(s.checkedInAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
    amount: currency(s.amountPaid),
  }
}

// Sort by the real ISO date field BEFORE mapping to HistoryRow. Sorting the
// already-formatted `DD/MM/YYYY` display strings via lexical comparison does not
// produce chronological order, so timestamps are compared here instead.
function byMostRecent<T>(items: T[], isoDateOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => new Date(isoDateOf(b)).getTime() - new Date(isoDateOf(a)).getTime())
}

export default function ClientHomePage() {
  const state = useMyProfile()

  if (state.status === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">Impossible de charger votre profil.</p>
        <Button variant="outline" onClick={state.retry}>
          Réessayer
        </Button>
      </div>
    )
  }

  if (state.status === 'no-profile') {
    return (
      <div className="flex flex-1 items-center justify-center text-center">
        <p className="text-sm text-muted-foreground">
          Votre compte n'est pas encore relié à une fiche client. Contactez l'accueil.
        </p>
      </div>
    )
  }

  const { profile } = state

  // Combine both mocked history types, tagging each with its real ISO timestamp so the
  // merged list can be sorted chronologically (a plain concat of two independently-sorted
  // lists is not itself sorted).
  const paymentHistoryRows: HistoryRow[] = byMostRecent(
    [
      ...profile.subscriptionHistory.map((s) => ({ isoDate: s.createdAt, row: subscriptionRow(s) })),
      ...profile.sessionHistory.map((s) => ({ isoDate: s.checkedInAt, row: sessionRow(s) })),
    ],
    (entry) => entry.isoDate
  ).map((entry) => entry.row)

  const sessionHistoryRows: HistoryRow[] = byMostRecent(profile.sessionHistory, (s) => s.checkedInAt).map(sessionRow)

  return (
    <div className="flex flex-col gap-4">
      <SubscriptionStatusSection
        name={profile.client.name}
        status={profile.subscriptionStatus}
        subscription={profile.subscription}
        demo
      />
      <DigitalCardSection cardNumber={profile.client.cardNumber} />
      <HistoryList
        icon={Receipt}
        title="Historique paiements"
        rows={paymentHistoryRows}
        emptyMessage="Aucun historique pour l'instant."
        demo
      />
      <HistoryList
        icon={CalendarClock}
        title="Historique séances"
        rows={sessionHistoryRows}
        emptyMessage="Aucune séance pour l'instant."
        demo
      />
    </div>
  )
}
