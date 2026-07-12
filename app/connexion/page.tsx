'use client'

import { Dumbbell } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { useAuth } from '@/components/providers/user-provider'

export default function ClientLoginPage() {
  const router = useRouter()
  const { requestClientOtp } = useAuth()
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    const result = await requestClientOtp(phone)
    setSubmitting(false)
    if (result) {
      setError(result.message)
      return
    }
    router.push(`/connexion/verification?phone=${encodeURIComponent(phone)}`)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center gap-3 text-center">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-brand text-primary-foreground">
            <Dumbbell className="size-5" />
          </div>
          <div className="flex flex-col gap-1">
            <CardTitle className="text-lg">Espace membre</CardTitle>
            <CardDescription>Connectez-vous avec votre numéro de téléphone.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Numéro de téléphone</Label>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+33612345601"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={submitting} className="mt-1 bg-gradient-brand text-primary-foreground">
              {submitting ? 'Envoi…' : 'Recevoir le code'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
