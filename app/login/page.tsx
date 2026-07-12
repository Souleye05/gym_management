// app/login/page.tsx
'use client'

import { Dumbbell } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { useAuth } from '@/components/providers/user-provider'

export default function LoginPage() {
  const router = useRouter()
  const { loginStaff } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    const result = await loginStaff({ email, password })
    setSubmitting(false)
    if (result) {
      setError(result.message)
      return
    }
    router.push('/')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center gap-3 text-center">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-brand text-primary-foreground">
            <Dumbbell className="size-5" />
          </div>
          <div className="flex flex-col gap-1">
            <CardTitle className="text-lg">Connexion personnel</CardTitle>
            <CardDescription>Accédez à l'espace de gestion Atlas.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={submitting} className="mt-1 bg-gradient-brand text-primary-foreground">
              {submitting ? 'Connexion…' : 'Se connecter'}
            </Button>
            <Link
              href="/login/mot-de-passe-oublie"
              className="text-center text-sm text-muted-foreground hover:text-foreground"
            >
              Mot de passe oublié ?
            </Link>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
