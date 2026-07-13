import type { Subscription, SubscriptionStatus } from './types'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export function computeSubscriptionStatus(
  subscription: Subscription,
  now: Date = new Date(),
): SubscriptionStatus {
  if (subscription.suspended) return 'suspended'
  const end = new Date(subscription.endDate)
  if (end.getTime() <= now.getTime()) return 'expired'
  if (end.getTime() - now.getTime() <= SEVEN_DAYS_MS) return 'expiring'
  return 'active'
}

export function computeStartDate(
  currentSubscription: Subscription | undefined,
  now: Date,
): Date {
  if (!currentSubscription) return now
  const currentEnd = new Date(currentSubscription.endDate)
  return currentEnd.getTime() > now.getTime() ? currentEnd : now
}
