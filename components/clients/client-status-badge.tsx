import { Badge } from '@/components/ui/badge'
import type { ClientStatus } from '@/lib/clients/types'

const STATUS_CONFIG: Record<ClientStatus, { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted' }> = {
  active: { label: 'Actif', variant: 'success' },
  expiring: { label: 'Expire bientôt', variant: 'warning' },
  expired: { label: 'Expiré', variant: 'destructive' },
  suspended: { label: 'Suspendu', variant: 'muted' },
  none: { label: 'Aucun abonnement', variant: 'muted' },
}

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  const config = STATUS_CONFIG[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}
