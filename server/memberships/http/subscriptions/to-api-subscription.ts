import type { PaymentMethod, PlanId, Subscription } from '../../domain/entities'

const PLAN_ID_MAP: Record<PlanId, string> = {
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  BIANNUAL: 'biannual',
  ANNUAL: 'annual',
}

const PAYMENT_METHOD_MAP: Record<PaymentMethod, string> = {
  CASH: 'cash',
  CARD: 'card',
  MOBILE_MONEY: 'mobile_money',
}

export function toApiSubscription(subscription: Subscription) {
  return {
    id: subscription.id,
    clientId: subscription.clientId,
    planId: PLAN_ID_MAP[subscription.planId],
    startDate: subscription.startDate,
    endDate: subscription.endDate,
    suspended: subscription.suspended,
    amountPaid: subscription.amountPaid,
    paymentMethod: PAYMENT_METHOD_MAP[subscription.paymentMethod],
    createdAt: subscription.createdAt,
  }
}
