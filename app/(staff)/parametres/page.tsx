'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { useSettings } from '@/components/providers/settings-provider'
import { useCurrentUser } from '@/components/providers/user-provider'

export default function ParametresPage() {
  const { settings, isLoading, isError, refetch, updateSettings, isUpdating } = useSettings()
  const { permissions } = useCurrentUser()
  const canEdit = permissions.includes('settings:update')

  const [sessionPriceInput, setSessionPriceInput] = useState('')
  const [formError, setFormError] = useState<string | undefined>(undefined)
  const [editing, setEditing] = useState(false)

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    )
  }

  if (isError || !settings) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">Impossible de charger les paramètres.</p>
        <Button variant="outline" onClick={refetch}>
          Réessayer
        </Button>
      </div>
    )
  }

  const handleStartEdit = () => {
    setSessionPriceInput(String(settings.sessionPrice))
    setFormError(undefined)
    setEditing(true)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsed = Number(sessionPriceInput)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setFormError('Le tarif doit être un nombre entier positif.')
      return
    }
    setFormError(undefined)
    updateSettings(
      { sessionPrice: parsed },
      {
        onSuccess: () => setEditing(false),
        onError: (message) => setFormError(message),
      },
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">Paramètres</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tarif de séance</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {editing ? (
            <form className="flex flex-col gap-3" noValidate onSubmit={handleSubmit}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="session-price">Tarif (€)</Label>
                <Input
                  id="session-price"
                  type="number"
                  min={1}
                  step={1}
                  value={sessionPriceInput}
                  onChange={(e) => setSessionPriceInput(e.target.value)}
                  autoFocus
                />
                {formError && (
                  <p role="alert" className="text-sm text-destructive">
                    {formError}
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={isUpdating}>
                  Annuler
                </Button>
                <Button type="submit" className="bg-gradient-brand text-primary-foreground" disabled={isUpdating}>
                  Enregistrer
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {settings.sessionPrice} € par séance
              </p>
              {canEdit && (
                <Button size="sm" variant="outline" onClick={handleStartEdit}>
                  Modifier
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
