import { CheckCircle2 } from 'lucide-react'
import type { Session } from '@/lib/sessions/types'
import type { PaymentMethod } from '@/lib/subscriptions/types'

const currency = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Espèces',
  card: 'Carte',
  mobile_money: 'Mobile Money',
}

export function SessionConfirmation({
  session,
  clientName,
}: {
  session: Session
  clientName?: string
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <CheckCircle2 className="size-8 text-success" />
      <div className="flex flex-col gap-1">
        {session.type === 'subscriber' ? (
          <p className="text-sm font-medium">{clientName ?? 'Client'}</p>
        ) : (
          <>
            <p className="text-sm font-medium">{session.fullName}</p>
            <p className="text-xs text-muted-foreground">{session.phoneNumber}</p>
          </>
        )}
        <p className="text-sm font-medium">{currency(session.amountPaid)}</p>
        <p className="text-xs text-muted-foreground">Paiement : {PAYMENT_LABELS[session.paymentMethod]}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(session.checkedInAt).toLocaleDateString('fr-FR')}{' '}
          {new Date(session.checkedInAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </p>
        <p className="text-xs text-muted-foreground">Séance n°{session.id}</p>
      </div>
    </div>
  )
}
