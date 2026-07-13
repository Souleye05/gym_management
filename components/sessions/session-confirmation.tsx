import { CheckCircle2 } from 'lucide-react'
import type { PaymentMethod } from '@/lib/subscriptions/types'

const currency = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Espèces',
  card: 'Carte',
  mobile_money: 'Mobile Money',
}

export function SessionConfirmation({
  amountPaid,
  paymentMethod,
  checkedInAt,
}: {
  amountPaid: number
  paymentMethod: PaymentMethod
  checkedInAt: string
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <CheckCircle2 className="size-8 text-success" />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{currency(amountPaid)}</p>
        <p className="text-xs text-muted-foreground">Paiement : {PAYMENT_LABELS[paymentMethod]}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(checkedInAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}
