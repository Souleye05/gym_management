import type { NextRequest } from 'next/server'
import { reactivateSubscriptionController } from '@/server/memberships/http/subscriptions/reactivate.controller'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id } = await context.params
  return reactivateSubscriptionController(req, id)
}
