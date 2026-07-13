import { Badge } from '@/components/ui/badge'
import type { SubscriptionStatus } from '@/lib/subscriptions/types'

const STATUS_CONFIG: Record<SubscriptionStatus, { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted' }> = {
  active: { label: 'Actif', variant: 'success' },
  expiring: { label: 'Expire bientôt', variant: 'warning' },
  expired: { label: 'Expiré', variant: 'destructive' },
  suspended: { label: 'Suspendu', variant: 'muted' },
}

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  const config = STATUS_CONFIG[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}
