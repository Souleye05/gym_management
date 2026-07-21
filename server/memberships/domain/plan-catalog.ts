// server/memberships/domain/plan-catalog.ts
import type { PlanId } from './entities'

/**
 * Mirrors lib/subscriptions/plans.ts's PLANS array exactly (same durations/prices). Kept as a
 * static backend constant rather than a DB-backed model — the catalog stays frontend-editable-only
 * territory until an actual need to edit prices without a redeploy exists.
 */
export const PLAN_CATALOG: Record<PlanId, { durationDays: number; price: number }> = {
  MONTHLY: { durationDays: 30, price: 40 },
  QUARTERLY: { durationDays: 90, price: 105 },
  BIANNUAL: { durationDays: 180, price: 190 },
  ANNUAL: { durationDays: 365, price: 350 },
}
