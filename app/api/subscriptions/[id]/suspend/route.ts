import type { NextRequest } from 'next/server'
import { suspendSubscriptionController } from '@/server/memberships/http/subscriptions/suspend.controller'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id } = await context.params
  return suspendSubscriptionController(req, id)
}
