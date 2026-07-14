// lib/sessions/eligibility.ts
import { computeSubscriptionStatus } from '@/lib/subscriptions/status'
import type { Subscription } from '@/lib/subscriptions/types'

export type SessionEligibility =
  | { allowed: true }
  | { allowed: false; reason: 'expired' | 'suspended' | 'none' }

export function checkSessionEligibility(subscription: Subscription | undefined): SessionEligibility {
  if (!subscription) return { allowed: false, reason: 'none' }
  const status = computeSubscriptionStatus(subscription)
  if (status === 'expired' || status === 'suspended') return { allowed: false, reason: status }
  return { allowed: true } // 'active' | 'expiring'
}
