// app/(client)/accueil/page.tsx
'use client'

import { useCurrentClient } from '@/components/providers/user-provider'

export default function ClientHomePage() {
  const session = useCurrentClient()
  const maskedPhone = session.phone.replace(/\d(?=\d{2})/g, '•')

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Bienvenue, {session.name}</h1>
      <p className="text-sm text-muted-foreground">{maskedPhone}</p>
    </div>
  )
}
