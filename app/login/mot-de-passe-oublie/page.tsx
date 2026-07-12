'use client'

import { CheckCircle2, Mail } from 'lucide-react'
import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center gap-3 text-center">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Mail className="size-5" />
          </div>
          <div className="flex flex-col gap-1">
            <CardTitle className="text-lg">Mot de passe oublié</CardTitle>
            <CardDescription>
              Saisissez votre email professionnel pour recevoir les instructions.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <CheckCircle2 className="size-8 text-success" />
              <p className="text-sm text-muted-foreground">
                Si ce compte existe, un email a été envoyé avec les instructions de réinitialisation.
              </p>
              <Link href="/login" className="text-sm font-medium text-primary hover:underline">
                Retour à la connexion
              </Link>
            </div>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@atlas.fit"
                />
              </div>
              <Button type="submit" className="mt-1 bg-gradient-brand text-primary-foreground">
                Envoyer les instructions
              </Button>
              <Link
                href="/login"
                className="text-center text-sm text-muted-foreground hover:text-foreground"
              >
                Retour à la connexion
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
