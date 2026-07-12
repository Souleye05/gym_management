'use client'

import { motion } from 'motion/react'
import { CalendarPlus, QrCode, UserPlus, Wallet } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const actions = [
  { label: 'Nouvelle séance', desc: 'Enregistrer une entrée', href: '/seances', icon: CalendarPlus },
  { label: 'Ajouter un client', desc: 'Créer une fiche', href: '/clients', icon: UserPlus },
  { label: 'Scanner un QR', desc: 'Vérifier un membre', href: '/scan', icon: QrCode },
  { label: 'Encaisser', desc: 'Nouveau paiement', href: '/abonnements', icon: Wallet },
]

export function QuickActions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Actions rapides</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <motion.div key={action.label} whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}>
              <Link
                href={action.href}
                className="flex h-full flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/50"
              >
                <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-brand text-primary-foreground">
                  <Icon className="size-4.5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{action.label}</span>
                  <span className="text-xs text-muted-foreground">{action.desc}</span>
                </div>
              </Link>
            </motion.div>
          )
        })}
      </CardContent>
    </Card>
  )
}
