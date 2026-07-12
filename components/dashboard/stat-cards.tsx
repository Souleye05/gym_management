'use client'

import { motion } from 'motion/react'
import { CreditCard, TrendingDown, TrendingUp, UserCheck, Users, XCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { kpis } from '@/lib/mock-data'
import { AnimatedNumber } from './animated-number'

const icons = {
  revenue: CreditCard,
  active: Users,
  sessions: UserCheck,
  expired: XCircle,
} as const

export function StatCards() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      {kpis.map((kpi, index) => {
        const Icon = icons[kpi.id as keyof typeof icons]
        const positive = kpi.trend === 'up'
        const goodTrend = kpi.id === 'expired' ? !positive : positive

        return (
          <motion.div
            key={kpi.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06, duration: 0.4, ease: 'easeOut' }}
          >
            <Card className="gap-4 p-5">
              <div className="flex items-center justify-between">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4.5" />
                </div>
                <span
                  className={cn(
                    'flex items-center gap-0.5 text-xs font-medium',
                    goodTrend ? 'text-success' : 'text-destructive',
                  )}
                >
                  {positive ? (
                    <TrendingUp className="size-3.5" />
                  ) : (
                    <TrendingDown className="size-3.5" />
                  )}
                  {Math.abs(kpi.delta)}%
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-2xl font-semibold tracking-tight tabular-nums lg:text-3xl">
                  <AnimatedNumber value={kpi.value} format={kpi.format} />
                </span>
                <span className="text-sm font-medium text-foreground/80">
                  {kpi.label}
                </span>
                <span className="text-xs text-muted-foreground">{kpi.hint}</span>
              </div>
            </Card>
          </motion.div>
        )
      })}
    </div>
  )
}
