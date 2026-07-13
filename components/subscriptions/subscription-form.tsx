'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/input'
import { PlanPicker } from './plan-picker'
import type { PaymentMethod, PlanId } from '@/lib/subscriptions/types'

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Espèces' },
  { value: 'card', label: 'Carte' },
  { value: 'mobile_money', label: 'Mobile Money' },
]

export function SubscriptionForm({
  onSubmit,
  onCancel,
  submitLabel,
}: {
  onSubmit: (values: { planId: PlanId; paymentMethod: PaymentMethod }) => void
  onCancel: () => void
  submitLabel: string
}) {
  const [planId, setPlanId] = useState<PlanId | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!planId) {
      setError('Sélectionnez une formule.')
      return
    }
    setError(null)
    onSubmit({ planId, paymentMethod })
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <Label>Formule</Label>
        <PlanPicker value={planId} onChange={setPlanId} />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="payment-method">Mode de paiement</Label>
        <div className="flex gap-1.5">
          {PAYMENT_METHODS.map((method) => (
            <button
              key={method.value}
              type="button"
              onClick={() => setPaymentMethod(method.value)}
              className={
                paymentMethod === method.value
                  ? 'rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground'
                  : 'rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted'
              }
            >
              {method.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" className="bg-gradient-brand text-primary-foreground">
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
