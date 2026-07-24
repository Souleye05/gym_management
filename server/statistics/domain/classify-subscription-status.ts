import type { ExpiringSubscriptionStatus } from './entities'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export type SubscriptionStatusClassification = { status: ExpiringSubscriptionStatus; daysLeft: number } | null

/**
 * `subscription` must already be the client's latest-started subscription — this function only
 * judges the one it's given, it does not pick which one (see
 * PrismaStatisticsRepository.getLatestStartedSubscriptionPerClient). Suspended subscriptions are
 * excluded (`null`): suspension is a deliberate staff action, not something needing a renewal
 * follow-up. Status is decided by `endDate <= now` first (same inclusive boundary convention as
 * checkSessionEligibility in server/memberships), not by the sign of `daysLeft` — this keeps
 * "expired 30 seconds ago" correctly `expired` rather than rounding to `daysLeft: 0` and being
 * misread as still within the expiring window.
 */
export function classifySubscriptionStatus(
  subscription: { suspended: boolean; endDate: Date },
  now: Date,
  expiringThresholdDays: number,
): SubscriptionStatusClassification {
  if (subscription.suspended) return null
  const daysLeft = Math.ceil((subscription.endDate.getTime() - now.getTime()) / MS_PER_DAY)
  if (subscription.endDate <= now) return { status: 'expired', daysLeft }
  if (daysLeft <= expiringThresholdDays) return { status: 'expiring', daysLeft }
  return null
}
