'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { PaymentMethodPicker } from './payment-method-picker'
import type { PaymentMethod } from '@/lib/subscriptions/types'

export function VisitorSessionForm({
  onSubmit,
  onCancel,
  submitLabel,
}: {
  onSubmit: (values: { fullName: string; phoneNumber: string; paymentMethod: PaymentMethod }) => void
  onCancel: () => void
  submitLabel: string
}) {
  const [fullName, setFullName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (fullName.trim().length === 0 || phoneNumber.trim().length === 0) {
      setError('Le nom et le téléphone sont obligatoires.')
      return
    }
    setError(null)
    onSubmit({ fullName: fullName.trim(), phoneNumber: phoneNumber.trim(), paymentMethod })
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="visitor-full-name">Nom complet</Label>
        <Input
          id="visitor-full-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Nom et prénom"
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="visitor-phone">Téléphone</Label>
        <Input
          id="visitor-phone"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="+33…"
        />
      </div>
      <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
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
