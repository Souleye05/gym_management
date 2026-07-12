'use client'

import { motion } from 'motion/react'
import { CreditCard, QrCode, RefreshCw, UserPlus, XCircle } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { recentActivity, type Activity } from '@/lib/mock-data'

const config: Record<
  Activity['type'],
  { icon: typeof CreditCard; className: string }
> = {
  payment: { icon: CreditCard, className: 'bg-success/10 text-success' },
  session: { icon: QrCode, className: 'bg-primary/10 text-primary' },
  signup: { icon: UserPlus, className: 'bg-accent/10 text-accent' },
  renewal: { icon: RefreshCw, className: 'bg-primary/10 text-primary' },
  expired: { icon: XCircle, className: 'bg-destructive/10 text-destructive' },
}

export function RecentActivity() {
  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Activité récente</CardTitle>
        <Button variant="ghost" size="sm">
          Tout voir
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col">
        {recentActivity.map((item, index) => {
          const { icon: Icon, className } = config[item.type]
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + index * 0.05 }}
              className="flex items-center gap-3 border-b border-border py-3 last:border-0"
            >
              <div className={`flex size-8 items-center justify-center rounded-lg ${className}`}>
                <Icon className="size-4" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="truncate text-sm">
                  <span className="font-medium">{item.name}</span>{' '}
                  <span className="text-muted-foreground">{item.action}</span>
                </p>
                <span className="text-xs text-muted-foreground">{item.detail}</span>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{item.time}</span>
            </motion.div>
          )
        })}
      </CardContent>
    </Card>
  )
}
