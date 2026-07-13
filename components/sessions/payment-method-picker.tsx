'use client'

import { Label } from '@/components/ui/input'
import type { PaymentMethod } from '@/lib/subscriptions/types'

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Espèces' },
  { value: 'card', label: 'Carte' },
  { value: 'mobile_money', label: 'Mobile Money' },
]

export function PaymentMethodPicker({
  value,
  onChange,
}: {
  value: PaymentMethod
  onChange: (value: PaymentMethod) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>Mode de paiement</Label>
      <div className="flex gap-1.5">
        {PAYMENT_METHODS.map((method) => (
          <button
            key={method.value}
            type="button"
            onClick={() => onChange(method.value)}
            className={
              value === method.value
                ? 'rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground'
                : 'rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted'
            }
          >
            {method.label}
          </button>
        ))}
      </div>
    </div>
  )
}
