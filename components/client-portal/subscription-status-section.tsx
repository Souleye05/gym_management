import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ClientStatusBadge } from '@/components/clients/client-status-badge'
import type { ClientStatus } from '@/lib/clients/types'
import type { Subscription } from '@/lib/subscriptions/types'

function daysRemaining(endDate: string): number {
  const ms = new Date(endDate).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)))
}

export function SubscriptionStatusSection({
  name,
  status,
  subscription,
  demo,
}: {
  name: string
  status: ClientStatus
  subscription: Subscription | null
  demo?: boolean
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 pt-5">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">{name}</h1>
          {demo && <Badge variant="muted">Démo</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <ClientStatusBadge status={status} />
          {status === 'expiring' && subscription && (
            <span className="text-xs text-muted-foreground">
              Expire dans {daysRemaining(subscription.endDate)} jour{daysRemaining(subscription.endDate) > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
