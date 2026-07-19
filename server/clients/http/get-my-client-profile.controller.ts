// server/clients/http/get-my-client-profile.controller.ts
import { NextResponse, type NextRequest } from 'next/server'
import { apiSuccess } from '../../shared/api-response'
import { getContainer } from '../../shared/container'
import { withInternalErrorHandling } from '../../shared/with-internal-error-handling'
import { requireClientAuth } from '../../auth/http/require-client-auth'
import type { PlanId, PaymentMethod, Subscription, Session } from '../../client-portal-history/domain/entities'

// The domain layer mirrors the Prisma schema's UPPERCASE enum values. The frontend
// (lib/subscriptions/types.ts, lib/sessions/types.ts) expects lowercase string unions.
// These maps translate at the HTTP boundary only; internal layers stay uppercase.
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

function toApiSubscription(subscription: Subscription) {
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

function toApiSession(session: Session) {
  return {
    id: session.id,
    type: 'subscriber' as const,
    clientId: session.clientId,
    amountPaid: session.amountPaid,
    paymentMethod: PAYMENT_METHOD_MAP[session.paymentMethod],
    checkedInAt: session.checkedInAt,
  }
}

export async function getMyClientProfileController(req: NextRequest): Promise<NextResponse> {
  const auth = await requireClientAuth(req)
  if (!auth.ok) return auth.response

  return withInternalErrorHandling(async () => {
    const { clientService, clientHistoryService } = getContainer()
    const client = await clientService.findByClientAccountId(auth.client.id)

    if (!client) {
      return NextResponse.json(apiSuccess({
        client: null,
        subscription: null,
        subscriptionHistory: [],
        sessionHistory: [],
      }))
    }

    const history = await clientHistoryService.getHistory(client.id)
    return NextResponse.json(apiSuccess({
      client,
      subscription: history.currentSubscription ? toApiSubscription(history.currentSubscription) : null,
      subscriptionHistory: history.subscriptions.map(toApiSubscription),
      sessionHistory: history.recentSessions.map(toApiSession),
    }))
  })
}
