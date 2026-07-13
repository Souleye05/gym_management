'use client'

import { PLANS } from '@/lib/subscriptions/plans'
import type { PlanId } from '@/lib/subscriptions/types'
import { cn } from '@/lib/utils'

const currency = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

export function PlanPicker({
  value,
  onChange,
}: {
  value: PlanId | null
  onChange: (planId: PlanId) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {PLANS.map((plan) => (
        <button
          key={plan.id}
          type="button"
          onClick={() => onChange(plan.id)}
          className={cn(
            'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors',
            value === plan.id
              ? 'border-primary bg-primary/5'
              : 'border-border hover:bg-muted/50',
          )}
        >
          <span className="text-sm font-medium">{plan.label}</span>
          <span className="text-xs text-muted-foreground">{plan.durationDays} jours</span>
          <span className="text-sm font-semibold">{currency(plan.price)}</span>
        </button>
      ))}
    </div>
  )
}
