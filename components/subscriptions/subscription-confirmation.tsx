import { CheckCircle2 } from 'lucide-react'
import { PLANS } from '@/lib/subscriptions/plans'
import type { PaymentMethod, PlanId } from '@/lib/subscriptions/types'

const currency = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Espèces',
  card: 'Carte',
  mobile_money: 'Mobile Money',
}

export function SubscriptionConfirmation({
  planId,
  paymentMethod,
  startDate,
  endDate,
}: {
  planId: PlanId
  paymentMethod: PaymentMethod
  startDate: string
  endDate: string
}) {
  const plan = PLANS.find((p) => p.id === planId)
  if (!plan) return null

  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <CheckCircle2 className="size-8 text-success" />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{plan.label} · {currency(plan.price)}</p>
        <p className="text-xs text-muted-foreground">Paiement : {PAYMENT_LABELS[paymentMethod]}</p>
        <p className="text-xs text-muted-foreground">
          Du {new Date(startDate).toLocaleDateString('fr-FR')} au {new Date(endDate).toLocaleDateString('fr-FR')}
        </p>
      </div>
    </div>
  )
}
