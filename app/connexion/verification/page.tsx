// app/connexion/verification/page.tsx
'use client'

import { ShieldCheck } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { useAuth } from '@/components/providers/user-provider'

function VerificationForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const phone = searchParams.get('phone') ?? ''
  const { verifyClientOtp } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    const result = await verifyClientOtp(phone, code)
    setSubmitting(false)
    if (result) {
      setError(result.message)
      setCode('')
      return
    }
    router.push('/accueil')
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center gap-3 text-center">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ShieldCheck className="size-5" />
        </div>
        <div className="flex flex-col gap-1">
          <CardTitle className="text-lg">Vérification</CardTitle>
          <CardDescription>Saisissez le code reçu par SMS au {phone || 'votre numéro'}.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="otp">Code à 6 chiffres</Label>
            <Input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={submitting} className="mt-1 bg-gradient-brand text-primary-foreground">
            {submitting ? 'Vérification…' : 'Valider'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export default function ClientOtpVerificationPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Suspense fallback={null}>
        <VerificationForm />
      </Suspense>
    </main>
  )
}
