'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import type { Client } from '@/lib/clients/types'

type ClientFormValues = {
  name: string
  phone: string
  email?: string
}

type ClientFormErrors = Partial<Record<'name' | 'phone' | 'email', string>>

function validate(values: { name: string; phone: string; email: string }): ClientFormErrors {
  const errors: ClientFormErrors = {}
  if (values.name.trim().length === 0) {
    errors.name = 'Le nom est requis.'
  }
  if (!/^\+\d{8,15}$/.test(values.phone.trim())) {
    errors.phone = 'Le numéro doit commencer par + et contenir entre 8 et 15 chiffres.'
  }
  if (values.email.trim().length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = 'Adresse e-mail invalide.'
  }
  return errors
}

export function ClientForm({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel,
  serverError,
}: {
  initialValues?: Pick<Client, 'name' | 'phone' | 'email'>
  onSubmit: (values: ClientFormValues) => void
  onCancel: () => void
  submitLabel: string
  serverError?: string
}) {
  const [name, setName] = useState(initialValues?.name ?? '')
  const [phone, setPhone] = useState(initialValues?.phone ?? '')
  const [email, setEmail] = useState(initialValues?.email ?? '')
  const [errors, setErrors] = useState<ClientFormErrors>({})

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors = validate({ name, phone, email })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    onSubmit({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim().length > 0 ? email.trim() : undefined,
    })
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-name">Nom</Label>
        <Input
          id="client-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jeanne Dupont"
        />
        {errors.name && (
          <p role="alert" className="text-sm text-destructive">
            {errors.name}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-phone">Téléphone</Label>
        <Input
          id="client-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+33612345678"
        />
        {errors.phone && (
          <p role="alert" className="text-sm text-destructive">
            {errors.phone}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-email">Email (optionnel)</Label>
        <Input
          id="client-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jeanne.dupont@example.com"
        />
        {errors.email && (
          <p role="alert" className="text-sm text-destructive">
            {errors.email}
          </p>
        )}
      </div>
      {serverError && (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
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
