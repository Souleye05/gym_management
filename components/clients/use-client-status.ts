// components/clients/use-client-status.ts
'use client'

import { useSubscriptions } from '@/components/providers/subscriptions-provider'
import { computeSubscriptionStatus } from '@/lib/subscriptions/status'
import type { ClientStatus } from '@/lib/clients/types'

export function useClientStatus(clientId: string): ClientStatus {
  const { getCurrentSubscription } = useSubscriptions()
  const current = getCurrentSubscription(clientId)
  if (!current) return 'none'
  return computeSubscriptionStatus(current)
}
