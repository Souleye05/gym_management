import type { NextRequest } from 'next/server'
import { getClientController } from '@/server/clients/http/get-client.controller'
import { updateClientController } from '@/server/clients/http/update-client.controller'
import { deactivateClientController } from '@/server/clients/http/deactivate-client.controller'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, context: RouteContext) {
  const { id } = await context.params
  return getClientController(req, id)
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id } = await context.params
  return updateClientController(req, id)
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const { id } = await context.params
  return deactivateClientController(req, id)
}
